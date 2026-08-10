import {
  CreativeWorkOriginNotFoundError,
  getOrCreateThoughtCreativeWork,
  listCreativeWorks,
  MissingCreativeWorkOpportunityMigrationError,
  MissingCreativeWorksTableError,
} from "@/lib/echo/creative-works/repository";
import { formatError } from "@/lib/echo/errors";
import {
  InvalidCreativeWorkRequestError,
  parseCreativeWorkCreateRequest,
} from "@/lib/echo/creative-works/request";
import type { CreativeWorkStatus, Platform } from "@/lib/echo/types";

// No Anthropic import anywhere in this file — listing and creating an
// opportunity are pure Supabase reads/writes and must never spend an API
// call.

const STATUSES: CreativeWorkStatus[] = [
  "opportunity",
  "ready",
  "filming",
  "editing",
  "posted",
  "abandoned",
];

function handleCreativeWorksError(routeLabel: string, error: unknown) {
  if (error instanceof MissingCreativeWorkOpportunityMigrationError) {
    console.error(
      `${routeLabel} failed: atomic creative-work opportunity migration is missing.`,
    );
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (error instanceof MissingCreativeWorksTableError) {
    console.error(`${routeLabel} failed: creative_works table is missing.`);
    return Response.json(
      {
        error:
          "The creative_works table doesn't exist yet. Run the setup SQL, then try again.",
      },
      { status: 500 },
    );
  }

  console.error(`${routeLabel} failed:`, formatError(error));
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");

    if (statusParam && !STATUSES.includes(statusParam as CreativeWorkStatus)) {
      return Response.json({ error: "Invalid status filter." }, { status: 400 });
    }

    const creativeWorks = await listCreativeWorks({
      status: statusParam ? (statusParam as CreativeWorkStatus) : undefined,
    });

    return Response.json({ creativeWorks });
  } catch (error) {
    return handleCreativeWorksError("GET /api/creative-works", error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    const { thoughtId } = parseCreativeWorkCreateRequest(body);
    const platform: Platform = "TikTok";

    // Source ownership/existence and duplicate prevention live in one
    // database transaction. Concurrent tabs therefore receive the same work
    // instead of creating parallel Creator Loop items.
    const result = await getOrCreateThoughtCreativeWork(thoughtId, platform);

    return Response.json(
      result,
      result.created ? { status: 201 } : undefined,
    );
  } catch (error) {
    if (error instanceof InvalidCreativeWorkRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CreativeWorkOriginNotFoundError) {
      return Response.json({ error: "Thought not found." }, { status: 404 });
    }
    return handleCreativeWorksError("POST /api/creative-works", error);
  }
}

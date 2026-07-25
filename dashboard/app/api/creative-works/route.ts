import {
  createCreativeWork,
  findCreativeWorkByOrigin,
  listCreativeWorks,
  MissingCreativeWorksTableError,
} from "@/lib/echo/creative-works/repository";
import { getThoughtById } from "@/lib/echo/thoughts/repository";
import { formatError } from "@/lib/echo/errors";
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
    const body = (await request.json()) as Record<string, unknown>;
    const thoughtId = typeof body.thoughtId === "string" ? body.thoughtId.trim() : "";

    if (!thoughtId) {
      return Response.json({ error: "thoughtId is required." }, { status: 400 });
    }

    // Ownership check: getThoughtById is scoped to the current user
    // internally (the app's single hardcoded user) — a thought that doesn't
    // belong to them, or doesn't exist, resolves to null here. userId is
    // never read from the request body.
    const thought = await getThoughtById(thoughtId);
    if (!thought) {
      return Response.json({ error: "Thought not found." }, { status: 404 });
    }

    const platform: Platform = "TikTok";

    // Duplicate prevention: same origin thought + platform returns the
    // existing row instead of creating another one.
    const existing = await findCreativeWorkByOrigin("thought", thoughtId, platform);
    if (existing) {
      return Response.json({ creativeWork: existing, created: false });
    }

    const creativeWork = await createCreativeWork({
      originType: "thought",
      originId: thoughtId,
      platform,
    });

    return Response.json({ creativeWork, created: true }, { status: 201 });
  } catch (error) {
    return handleCreativeWorksError("POST /api/creative-works", error);
  }
}

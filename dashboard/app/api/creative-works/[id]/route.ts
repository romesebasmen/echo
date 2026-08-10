import {
  getCreativeWorkById,
  MissingCreativeWorksTableError,
  updateCreativeWork,
} from "@/lib/echo/creative-works/repository";
import { isValidStatusTransition } from "@/lib/echo/creative-works/transitions";
import { formatError } from "@/lib/echo/errors";
import type { CreativeWorkStatus } from "@/lib/echo/types";
import {
  InvalidCreativeWorkRequestError,
  parseCreativeWorkUpdateRequest,
} from "@/lib/echo/creative-works/request";

// No Anthropic import anywhere in this file — fetching and patching status
// or reflection are pure Supabase reads/writes.

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const creativeWork = await getCreativeWorkById(id);

    if (!creativeWork) {
      return Response.json({ error: "Creative work not found." }, { status: 404 });
    }

    return Response.json({ creativeWork });
  } catch (error) {
    return handleCreativeWorksError("GET /api/creative-works/[id]", error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const input = parseCreativeWorkUpdateRequest(body);

    // Ownership: getCreativeWorkById is scoped to the current user
    // internally — a work belonging to someone else (hypothetically) or
    // that doesn't exist resolves to null here.
    const current = await getCreativeWorkById(id);
    if (!current) {
      return Response.json({ error: "Creative work not found." }, { status: 404 });
    }

    let status: CreativeWorkStatus | undefined;
    let postedAt: string | undefined;

    if (input.status !== undefined) {
      status = input.status;

      // Forward-only workflow, enforced here (not in the repository, which
      // stays a generic data layer). No arbitrary jumps: only the specific
      // next step in the pipeline is accepted.
      if (!isValidStatusTransition(current.status, status)) {
        return Response.json(
          { error: `Cannot transition from "${current.status}" to "${status}".` },
          { status: 400 },
        );
      }

      if (status === "posted" && !current.postedAt) {
        postedAt = new Date().toISOString();
      }
    }

    const creativeWork = await updateCreativeWork(id, {
      status,
      reflection: input.reflection,
      postedAt,
    });

    return Response.json({ creativeWork });
  } catch (error) {
    if (error instanceof InvalidCreativeWorkRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return handleCreativeWorksError("PATCH /api/creative-works/[id]", error);
  }
}

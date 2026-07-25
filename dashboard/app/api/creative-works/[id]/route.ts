import {
  getCreativeWorkById,
  MissingCreativeWorksTableError,
  updateCreativeWork,
} from "@/lib/echo/creative-works/repository";
import { isValidStatusTransition } from "@/lib/echo/creative-works/transitions";
import { formatError } from "@/lib/echo/errors";
import type { CreativeWorkStatus } from "@/lib/echo/types";

// No Anthropic import anywhere in this file — fetching and patching status
// or reflection are pure Supabase reads/writes.

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
    const body = (await request.json()) as Record<string, unknown>;

    const statusInput = typeof body.status === "string" ? body.status : undefined;
    const reflectionInput =
      typeof body.reflection === "string" && body.reflection.trim()
        ? body.reflection.trim()
        : undefined;

    if (statusInput === undefined && reflectionInput === undefined) {
      return Response.json({ error: "No valid fields to update." }, { status: 400 });
    }

    // Ownership: getCreativeWorkById is scoped to the current user
    // internally — a work belonging to someone else (hypothetically) or
    // that doesn't exist resolves to null here.
    const current = await getCreativeWorkById(id);
    if (!current) {
      return Response.json({ error: "Creative work not found." }, { status: 404 });
    }

    let status: CreativeWorkStatus | undefined;
    let postedAt: string | undefined;

    if (statusInput !== undefined) {
      if (!STATUSES.includes(statusInput as CreativeWorkStatus)) {
        return Response.json({ error: "Invalid status value." }, { status: 400 });
      }
      status = statusInput as CreativeWorkStatus;

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
      reflection: reflectionInput,
      postedAt,
    });

    return Response.json({ creativeWork });
  } catch (error) {
    return handleCreativeWorksError("PATCH /api/creative-works/[id]", error);
  }
}

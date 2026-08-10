import {
  getCreativeWorkById,
  MissingCreativeWorksTableError,
  updateCreativeWork,
} from "@/lib/echo/creative-works/repository";
import { getThoughtById } from "@/lib/echo/thoughts/repository";
import { getRelevantMemories } from "@/lib/echo/memories/retrieval";
import {
  generateTikTokPackage,
  InvalidGeneratedPackageError,
} from "@/lib/echo/ai/claude-tiktok-package";
import {
  releaseGenerationLock,
  tryAcquireGenerationLock,
} from "@/lib/echo/creative-works/generation-lock";
import { creatorProfile } from "@/lib/echo/profile";
import { formatError } from "@/lib/echo/errors";
import {
  InvalidCreativeWorkRequestError,
  parseCreativeWorkGenerationRequest,
} from "@/lib/echo/creative-works/request";
import {
  AiOperationInProgressError,
  AiOperationLeaseUnavailableError,
  createAiOperationKey,
} from "@/lib/echo/ai/operation-lease";
import { runWithAiOperationLease } from "@/lib/echo/ai/operation-lease-server";

// SERVER-ONLY. This is the only route in the app that calls Anthropic to
// produce a TikTok package, and it must make at most one call per request —
// no retry, no background/automatic invocation. Only POST is defined here:
// there is no GET, so a page load, refresh, or render can never trigger
// this route by accident.

const RELEVANT_MEMORY_LIMIT = 15;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let lockAcquired = false;

  try {
    let body: unknown = {};
    try {
      const rawBody = await request.text();
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    const { force } = parseCreativeWorkGenerationRequest(body);

    // Ownership: getCreativeWorkById is scoped to the current user
    // internally.
    const creativeWork = await getCreativeWorkById(id);
    if (!creativeWork) {
      return Response.json(
        { error: "Creative work not found." },
        { status: 404 },
      );
    }

    // Already generated and this isn't an explicit regeneration: return
    // what's there, make no Anthropic call.
    if (creativeWork.package && !force) {
      return Response.json({ creativeWork, generated: false });
    }

    if (!tryAcquireGenerationLock(id)) {
      return Response.json(
        {
          error: "A generation is already in progress for this creative work.",
        },
        { status: 409 },
      );
    }
    lockAcquired = true;

    return await runWithAiOperationLease(
      createAiOperationKey("tiktok-package", id),
      async () => {
        if (creativeWork.originType !== "thought" || !creativeWork.originId) {
          return Response.json(
            {
              error:
                "Only thought-originated creative works can be generated in this slice.",
            },
            { status: 400 },
          );
        }

        // Ownership: getThoughtById is scoped to the current user internally.
        const thought = await getThoughtById(creativeWork.originId);
        if (!thought) {
          return Response.json(
            { error: "Originating thought not found." },
            { status: 404 },
          );
        }

        // getRelevantMemories is scoped to the current user internally — only
        // memories already filtered by Echo's existing privacy rules (Phase 9
        // extraction: nothing sensitive unless explicitly asked to remember)
        // are ever included. No unrestricted context is injected.
        const relevantMemories = await getRelevantMemories(
          RELEVANT_MEMORY_LIMIT,
        );

        let generatedPackage;
        try {
          generatedPackage = await generateTikTokPackage({
            thought: {
              content: thought.content,
              context: thought.context,
              possibleFormat: thought.possibleFormat,
            },
            relevantMemories: relevantMemories.map((memory) => ({
              category: memory.category,
              title: memory.title,
              description: memory.description,
            })),
            creatorName: creatorProfile.name,
            recurringSeries: creatorProfile.recurringSeries,
          });
        } catch (generationError) {
          // No retry. Nothing has been written to the database at this point,
          // so any prior valid package (a failed regeneration attempt) is left
          // exactly as it was.
          console.error(
            `POST /api/creative-works/${id}/generate failed:`,
            formatError(generationError),
          );

          if (generationError instanceof InvalidGeneratedPackageError) {
            return Response.json(
              {
                error:
                  "Echo generated an invalid package. Nothing was saved. Try again.",
              },
              { status: 502 },
            );
          }

          return Response.json(
            { error: "Generation failed. Nothing was saved. Try again." },
            { status: 502 },
          );
        }

        // A first-time generation (opportunity -> ready) advances status. A
        // force-regeneration on a work that has already moved further along
        // (filming/editing/posted) only refreshes the package content — it
        // does not reset production progress.
        const nextStatus =
          creativeWork.status === "opportunity" ? "ready" : undefined;

        const updated = await updateCreativeWork(id, {
          package: generatedPackage,
          status: nextStatus,
          generatedAt: new Date().toISOString(),
        });

        return Response.json({ creativeWork: updated, generated: true });
      },
    );
  } catch (error) {
    if (error instanceof InvalidCreativeWorkRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof MissingCreativeWorksTableError) {
      console.error(
        `POST /api/creative-works/${id}/generate failed: creative_works table is missing.`,
      );
      return Response.json(
        {
          error:
            "The creative_works table doesn't exist yet. Run the setup SQL, then try again.",
        },
        { status: 500 },
      );
    }
    if (error instanceof AiOperationInProgressError) {
      return Response.json(
        {
          error: "A generation is already in progress for this creative work.",
        },
        { status: 409 },
      );
    }
    if (error instanceof AiOperationLeaseUnavailableError) {
      console.error(
        `POST /api/creative-works/${id}/generate failed:`,
        formatError(error),
      );
      return Response.json(
        { error: "Echo couldn't safely coordinate package generation." },
        { status: 503 },
      );
    }

    console.error(
      `POST /api/creative-works/${id}/generate failed:`,
      formatError(error),
    );
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  } finally {
    if (lockAcquired) {
      releaseGenerationLock(id);
    }
  }
}

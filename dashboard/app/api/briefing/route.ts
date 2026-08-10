import {
  getTodaysBriefing,
  regenerateTodaysBriefing,
} from "@/lib/echo/daily-briefing/generator";
import { MissingBriefingsTableError } from "@/lib/echo/daily-briefing/repository";
import {
  BriefingProviderUnavailableError,
  InvalidGeneratedBriefingError,
} from "@/lib/echo/ai/claude-briefing";
import { formatError } from "@/lib/echo/errors";

function handleBriefingError(routeLabel: string, error: unknown) {
  if (error instanceof MissingBriefingsTableError) {
    console.error(`${routeLabel} failed: daily_briefings table is missing.`);
    return Response.json(
      {
        error:
          "The daily_briefings table doesn't exist yet. Run the setup SQL, then try again.",
      },
      { status: 500 },
    );
  }

  if (
    error instanceof BriefingProviderUnavailableError ||
    error instanceof InvalidGeneratedBriefingError
  ) {
    console.error(`${routeLabel} failed:`, formatError(error));
    return Response.json(
      { error: "Echo couldn't prepare the briefing because its AI provider is unavailable." },
      { status: 502 },
    );
  }

  console.error(`${routeLabel} failed:`, formatError(error));
  return Response.json({ error: "Could not load today's briefing." }, { status: 500 });
}

export async function GET() {
  try {
    const briefing = await getTodaysBriefing();
    return Response.json({ briefing });
  } catch (error) {
    return handleBriefingError("GET /api/briefing", error);
  }
}

export async function POST() {
  try {
    const briefing = await regenerateTodaysBriefing();
    return Response.json({ briefing });
  } catch (error) {
    return handleBriefingError("POST /api/briefing", error);
  }
}

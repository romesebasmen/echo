import { useCallback, useEffect, useState } from "react";
import type { DailyBriefing } from "@/lib/echo/types";

interface BriefingResponse {
  briefing: DailyBriefing;
}

interface ErrorResponse {
  error: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function parseBriefingResponse(response: Response): Promise<DailyBriefing> {
  const body = (await response.json()) as BriefingResponse | ErrorResponse;
  if (!response.ok || !("briefing" in body)) {
    throw new Error("error" in body ? body.error : GENERIC_ERROR);
  }
  return body.briefing;
}

export function useBriefing() {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/briefing");
      setBriefing(await parseBriefingResponse(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching data on mount is a legitimate use of an Effect (React docs,
    // "You Might Not Need an Effect" -> "Fetching data"); the setState calls
    // happen after the request resolves, not synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function refresh(): Promise<void> {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/briefing", { method: "POST" });
      setBriefing(await parseBriefingResponse(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setIsRefreshing(false);
    }
  }

  return { briefing, isLoading, isRefreshing, error, refresh };
}

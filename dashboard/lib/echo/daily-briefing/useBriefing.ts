import { useCallback, useEffect, useState } from "react";
import type { DailyBriefing } from "@/lib/echo/types";
import {
  hasResponseField,
  parseJsonResponse,
} from "@/lib/echo/client/json-response";

interface BriefingResponse {
  briefing: DailyBriefing;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function parseBriefingResponse(response: Response): Promise<DailyBriefing> {
  const body = await parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (candidate): candidate is BriefingResponse =>
      hasResponseField(candidate, "briefing") &&
      typeof candidate.briefing === "object" &&
      candidate.briefing !== null,
  });
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

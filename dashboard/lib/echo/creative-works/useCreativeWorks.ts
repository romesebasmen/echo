import { useCallback, useEffect, useRef, useState } from "react";
import type { CreativeWork, CreativeWorkStatus } from "@/lib/echo/types";
import {
  hasResponseField,
  parseJsonResponse,
} from "@/lib/echo/client/json-response";
import {
  runExclusiveClientOperation,
  runExclusiveKeyedClientOperation,
} from "@/lib/echo/client/operation-gate";

interface CreativeWorksResponse {
  creativeWorks: CreativeWork[];
}

interface CreativeWorkResponse {
  creativeWork: CreativeWork;
  created?: boolean;
  generated?: boolean;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function parseCreativeWorksResponse(
  response: Response,
): Promise<CreativeWorksResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is CreativeWorksResponse =>
      hasResponseField(body, "creativeWorks") && Array.isArray(body.creativeWorks),
  });
}

async function parseCreativeWorkResponse(
  response: Response,
): Promise<CreativeWorkResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is CreativeWorkResponse =>
      hasResponseField(body, "creativeWork") &&
      typeof body.creativeWork === "object" &&
      body.creativeWork !== null,
  });
}

export function useCreativeWorks() {
  const createGate = useRef({ busy: false });
  const activeWorkKeys = useRef(new Set<string>());
  const [creativeWorks, setCreativeWorks] = useState<CreativeWork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  // Per-id pending sets so one work's Generate button being disabled doesn't
  // disable every other row, and so a second click on the same button
  // before the first request resolves is impossible.
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/creative-works");
      const body = await parseCreativeWorksResponse(response);
      setCreativeWorks(body.creativeWorks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load TikTok ideas. Please try again.");
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

  async function runWorkOperation(
    id: string,
    operation: () => Promise<boolean>,
  ): Promise<boolean> {
    const result = await runExclusiveKeyedClientOperation(
      activeWorkKeys.current,
      id,
      async () => {
        setPendingIds((previous) => new Set(previous).add(id));
        try {
          return await operation();
        } finally {
          setPendingIds((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
        }
      },
    );
    return result.executed ? result.value : false;
  }

  async function createFromThought(thoughtId: string): Promise<boolean> {
    const result = await runExclusiveClientOperation(
      createGate.current,
      async () => {
        setError(null);
        setIsCreating(true);
        try {
          const response = await fetch("/api/creative-works", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ thoughtId }),
          });
          const body = await parseCreativeWorkResponse(response);
          setCreativeWorks((previous) => {
            const alreadyListed = previous.some(
              (work) => work.id === body.creativeWork.id,
            );
            return alreadyListed
              ? previous.map((work) =>
                  work.id === body.creativeWork.id ? body.creativeWork : work,
                )
              : [body.creativeWork, ...previous];
          });
          return true;
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not create a TikTok idea. Please try again.",
          );
          return false;
        } finally {
          setIsCreating(false);
        }
      },
    );
    return result.executed ? result.value : false;
  }

  async function performGeneratePackage(
    id: string,
    force = false,
  ): Promise<boolean> {
    if (generatingIds.has(id)) {
      // Already pending for this work — refuse to submit a second request
      // from this client, on top of the server-side lock.
      return false;
    }

    setError(null);
    setGeneratingIds((previous) => new Set(previous).add(id));

    try {
      const response = await fetch(`/api/creative-works/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const body = await parseCreativeWorkResponse(response);
      setCreativeWorks((previous) =>
        previous.map((work) => (work.id === id ? body.creativeWork : work)),
      );
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not generate the package. Please try again.",
      );
      return false;
    } finally {
      setGeneratingIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  async function generatePackage(id: string, force = false): Promise<boolean> {
    return runWorkOperation(id, () => performGeneratePackage(id, force));
  }

  async function performUpdateStatus(
    id: string,
    status: CreativeWorkStatus,
  ): Promise<boolean> {
    setError(null);
    try {
      const response = await fetch(`/api/creative-works/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await parseCreativeWorkResponse(response);
      setCreativeWorks((previous) =>
        previous.map((work) => (work.id === id ? body.creativeWork : work)),
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status. Please try again.");
      return false;
    }
  }

  async function updateStatus(
    id: string,
    status: CreativeWorkStatus,
  ): Promise<boolean> {
    return runWorkOperation(id, () => performUpdateStatus(id, status));
  }

  async function performUpdateReflection(
    id: string,
    reflection: string,
  ): Promise<boolean> {
    setError(null);
    try {
      const response = await fetch(`/api/creative-works/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reflection }),
      });
      const body = await parseCreativeWorkResponse(response);
      setCreativeWorks((previous) =>
        previous.map((work) => (work.id === id ? body.creativeWork : work)),
      );
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your reflection. Please try again.",
      );
      return false;
    }
  }

  async function updateReflection(
    id: string,
    reflection: string,
  ): Promise<boolean> {
    return runWorkOperation(id, () =>
      performUpdateReflection(id, reflection),
    );
  }

  return {
    creativeWorks,
    isLoading,
    isCreating,
    isGenerating: (id: string) => generatingIds.has(id),
    isBusy: (id: string) => pendingIds.has(id),
    error,
    createFromThought,
    generatePackage,
    updateStatus,
    updateReflection,
    reload: load,
  };
}

import { useCallback, useEffect, useState } from "react";
import type { Thought } from "@/lib/echo/types";
import {
  hasResponseField,
  parseJsonResponse,
} from "@/lib/echo/client/json-response";

export interface ThoughtInput {
  content: string;
  context?: string;
  possibleFormat?: string;
}

interface ThoughtsResponse {
  thoughts: Thought[];
}

interface ThoughtResponse {
  thought: Thought;
}

interface DeleteThoughtResponse {
  ok: boolean;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function parseThoughtsResponse(response: Response): Promise<ThoughtsResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is ThoughtsResponse =>
      hasResponseField(body, "thoughts") && Array.isArray(body.thoughts),
  });
}

async function parseThoughtResponse(response: Response): Promise<ThoughtResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is ThoughtResponse =>
      hasResponseField(body, "thought") &&
      typeof body.thought === "object" &&
      body.thought !== null,
  });
}

async function parseDeleteThoughtResponse(
  response: Response,
): Promise<DeleteThoughtResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: "Could not delete your thought. Please try again.",
    isSuccessBody: (body): body is DeleteThoughtResponse =>
      hasResponseField(body, "ok") && body.ok === true,
  });
}

export function useThoughts() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThoughts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/thoughts");
      const body = await parseThoughtsResponse(response);
      setThoughts(body.thoughts);
    } catch {
      setError("Could not load your thoughts. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching data on mount is a legitimate use of an Effect (React docs,
    // "You Might Not Need an Effect" -> "Fetching data"); the setState calls
    // happen after the request resolves, not synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadThoughts();
  }, [loadThoughts]);

  async function createThought(input: ThoughtInput): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/thoughts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await parseThoughtResponse(response);
      setThoughts((previous) => [body.thought, ...previous]);
      return true;
    } catch {
      setError("Could not save your thought. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function updateThought(id: string, input: ThoughtInput): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/thoughts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await parseThoughtResponse(response);
      setThoughts((previous) =>
        previous.map((thought) => (thought.id === id ? body.thought : thought)),
      );
      return true;
    } catch {
      setError("Could not update your thought. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteThought(id: string): Promise<void> {
    setError(null);
    const previousThoughts = thoughts;
    setThoughts((previous) => previous.filter((thought) => thought.id !== id));

    try {
      const response = await fetch(`/api/thoughts/${id}`, { method: "DELETE" });
      await parseDeleteThoughtResponse(response);
    } catch (err) {
      setThoughts(previousThoughts);
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete your thought. Please try again.",
      );
    }
  }

  return {
    thoughts,
    isLoading,
    isSaving,
    error,
    createThought,
    updateThought,
    deleteThought,
  };
}

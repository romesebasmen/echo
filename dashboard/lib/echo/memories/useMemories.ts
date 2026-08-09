import { useCallback, useEffect, useState } from "react";
import type {
  Memory,
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
} from "@/lib/echo/types";
import {
  hasResponseField,
  parseJsonResponse,
} from "@/lib/echo/client/json-response";

export interface MemoryEditInput {
  title?: string;
  description?: string;
  category?: MemoryCategory;
  importance?: MemoryImportance;
  confidence?: MemoryConfidence;
}

interface MemoriesResponse {
  memories: Memory[];
}

interface MemoryResponse {
  memory: Memory;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function parseMemoriesResponse(response: Response): Promise<MemoriesResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is MemoriesResponse =>
      hasResponseField(body, "memories") && Array.isArray(body.memories),
  });
}

async function parseMemoryResponse(response: Response): Promise<MemoryResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is MemoryResponse =>
      hasResponseField(body, "memory") &&
      typeof body.memory === "object" &&
      body.memory !== null,
  });
}

export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/memories");
      const body = await parseMemoriesResponse(response);
      setMemories(body.memories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load memories. Please try again.");
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

  async function editMemory(id: string, input: MemoryEditInput): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await parseMemoryResponse(response);
      setMemories((previous) =>
        previous.map((memory) => (memory.id === id ? body.memory : memory)),
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update memory. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveMemory(id: string): Promise<void> {
    setError(null);
    const previous = memories;
    setMemories((current) => current.filter((memory) => memory.id !== id));
    try {
      const response = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!response.ok) throw new Error(GENERIC_ERROR);
    } catch (err) {
      setMemories(previous);
      setError(err instanceof Error ? err.message : "Could not archive memory. Please try again.");
    }
  }

  async function deleteMemoryById(id: string): Promise<void> {
    setError(null);
    const previous = memories;
    setMemories((current) => current.filter((memory) => memory.id !== id));
    try {
      const response = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(GENERIC_ERROR);
    } catch (err) {
      setMemories(previous);
      setError(err instanceof Error ? err.message : "Could not delete memory. Please try again.");
    }
  }

  return {
    memories,
    isLoading,
    isSaving,
    error,
    editMemory,
    archiveMemory,
    deleteMemory: deleteMemoryById,
  };
}

import { useCallback, useEffect, useState } from "react";
import type {
  Memory,
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
} from "@/lib/echo/types";

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

interface ErrorResponse {
  error: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

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
      const body = (await response.json()) as MemoriesResponse | ErrorResponse;
      if (!response.ok || !("memories" in body)) {
        throw new Error("error" in body ? body.error : GENERIC_ERROR);
      }
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
      const body = (await response.json()) as MemoryResponse | ErrorResponse;
      if (!response.ok || !("memory" in body)) {
        throw new Error("error" in body ? body.error : GENERIC_ERROR);
      }
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

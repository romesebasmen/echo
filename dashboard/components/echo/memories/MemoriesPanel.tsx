"use client";

import { useState, type FormEvent } from "react";
import { useMemories } from "@/lib/echo/memories/useMemories";
import type {
  Memory,
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
} from "@/lib/echo/types";
import {
  MAX_MEMORY_DESCRIPTION_LENGTH,
  MAX_MEMORY_TITLE_LENGTH,
} from "@/lib/echo/types";

const CATEGORIES: MemoryCategory[] = [
  "identity",
  "preference",
  "goal",
  "project",
  "relationship",
  "routine",
  "creator-style",
  "constraint",
  "other",
];

const LEVELS: (MemoryImportance | MemoryConfidence)[] = ["low", "medium", "high"];

const inputClassName =
  "rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent";
const selectClassName =
  "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent";

export function MemoriesPanel() {
  const { memories, isLoading, isSaving, error, editMemory, archiveMemory, deleteMemory } =
    useMemories();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<MemoryCategory>("other");
  const [editImportance, setEditImportance] = useState<MemoryImportance>("medium");
  const [editConfidence, setEditConfidence] = useState<MemoryConfidence>("medium");

  function startEditing(memory: Memory) {
    setEditingId(memory.id);
    setEditTitle(memory.title);
    setEditDescription(memory.description);
    setEditCategory(memory.category);
    setEditImportance(memory.importance);
    setEditConfidence(memory.confidence);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  async function saveEditing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || !editTitle.trim() || !editDescription.trim()) return;

    const success = await editMemory(editingId, {
      title: editTitle.trim(),
      description: editDescription.trim(),
      category: editCategory,
      importance: editImportance,
      confidence: editConfidence,
    });

    if (success) {
      setEditingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-accent">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-muted">Loading memories…</p>
      ) : memories.length === 0 ? (
        <p className="text-sm text-muted">No memories yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {memories.map((memory) =>
            editingId === memory.id ? (
              <li key={memory.id} className="py-4">
                <form onSubmit={saveEditing} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`title-${memory.id}`} className="text-sm text-muted">
                      Title
                    </label>
                    <input
                      id={`title-${memory.id}`}
                      type="text"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      required
                      maxLength={MAX_MEMORY_TITLE_LENGTH}
                      className={inputClassName}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`description-${memory.id}`} className="text-sm text-muted">
                      Description
                    </label>
                    <textarea
                      id={`description-${memory.id}`}
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      required
                      maxLength={MAX_MEMORY_DESCRIPTION_LENGTH}
                      rows={3}
                      className={inputClassName}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <select
                      value={editCategory}
                      onChange={(event) =>
                        setEditCategory(event.target.value as MemoryCategory)
                      }
                      aria-label="Category"
                      className={selectClassName}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editImportance}
                      onChange={(event) =>
                        setEditImportance(event.target.value as MemoryImportance)
                      }
                      aria-label="Importance"
                      className={selectClassName}
                    >
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level} importance
                        </option>
                      ))}
                    </select>
                    <select
                      value={editConfidence}
                      onChange={(event) =>
                        setEditConfidence(event.target.value as MemoryConfidence)
                      }
                      aria-label="Confidence"
                      className={selectClassName}
                    >
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level} confidence
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-md border border-foreground px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="rounded-md px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={memory.id} className="flex items-start justify-between gap-4 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {memory.category} · {memory.importance} importance ·{" "}
                    {memory.confidence} confidence
                  </span>
                  <h3 className="text-base font-medium text-foreground">{memory.title}</h3>
                  <p className="max-w-prose text-sm leading-relaxed text-muted">
                    {memory.description}
                  </p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => startEditing(memory)}
                    className="text-sm text-muted transition-colors hover:text-accent"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveMemory(memory.id)}
                    className="text-sm text-muted transition-colors hover:text-accent"
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMemory(memory.id)}
                    aria-label={`Delete memory: ${memory.title}`}
                    className="text-sm text-muted transition-colors hover:text-accent"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

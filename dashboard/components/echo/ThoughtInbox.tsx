"use client";

import { useId, useState, type FormEvent } from "react";
import type { Thought } from "@/lib/echo/types";
import { useThoughts } from "@/lib/echo/thoughts/useThoughts";
import { useCreativeWorks } from "@/lib/echo/creative-works/useCreativeWorks";

export function ThoughtInbox() {
  const { thoughts, isLoading, isSaving, error, createThought, updateThought, deleteThought } =
    useThoughts();

  const { createFromThought } = useCreativeWorks();
  const [addedThoughtIds, setAddedThoughtIds] = useState<Set<string>>(new Set());
  const [pendingThoughtId, setPendingThoughtId] = useState<string | null>(null);

  // Guards against a second click landing before the first request
  // resolves — on top of the server-side duplicate-origin check.
  async function handleAddToTikTok(thoughtId: string) {
    if (pendingThoughtId) return;
    setPendingThoughtId(thoughtId);
    const success = await createFromThought(thoughtId);
    if (success) {
      setAddedThoughtIds((previous) => new Set(previous).add(thoughtId));
    }
    setPendingThoughtId(null);
  }

  const [rawThought, setRawThought] = useState("");
  const [context, setContext] = useState("");
  const [possibleFormat, setPossibleFormat] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editContext, setEditContext] = useState("");
  const [editFormat, setEditFormat] = useState("");

  const rawThoughtId = useId();
  const contextId = useId();
  const formatId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedThought = rawThought.trim();
    if (!trimmedThought) {
      return;
    }

    const success = await createThought({
      content: trimmedThought,
      context: context.trim() || undefined,
      possibleFormat: possibleFormat.trim() || undefined,
    });

    if (success) {
      setRawThought("");
      setContext("");
      setPossibleFormat("");
    }
  }

  function startEditing(thought: Thought) {
    setEditingId(thought.id);
    setEditContent(thought.content);
    setEditContext(thought.context ?? "");
    setEditFormat(thought.possibleFormat ?? "");
  }

  function cancelEditing() {
    setEditingId(null);
  }

  async function saveEditing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = editContent.trim();
    if (!trimmedContent || !editingId) {
      return;
    }

    const success = await updateThought(editingId, {
      content: trimmedContent,
      context: editContext.trim() || undefined,
      possibleFormat: editFormat.trim() || undefined,
    });

    if (success) {
      setEditingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
        Thought Inbox
      </h2>

      {error && <p className="text-sm text-accent">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={rawThoughtId} className="text-sm text-muted">
            What&rsquo;s on your mind?
          </label>
          <textarea
            id={rawThoughtId}
            value={rawThought}
            onChange={(event) => setRawThought(event.target.value)}
            required
            rows={3}
            className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={contextId} className="text-sm text-muted">
              Context (optional)
            </label>
            <input
              id={contextId}
              type="text"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={formatId} className="text-sm text-muted">
              Possible format (optional)
            </label>
            <input
              id={formatId}
              type="text"
              value={possibleFormat}
              onChange={(event) => setPossibleFormat(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="self-start rounded-md border border-foreground px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save thought"}
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted">Loading thoughts…</p>
      ) : thoughts.length === 0 ? (
        <p className="text-sm text-muted">No thoughts saved yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {thoughts.map((thought) =>
            editingId === thought.id ? (
              <li key={thought.id} className="py-4">
                <form onSubmit={saveEditing} className="flex flex-col gap-3">
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    required
                    rows={3}
                    aria-label="Edit thought"
                    className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={editContext}
                      onChange={(event) => setEditContext(event.target.value)}
                      aria-label="Edit context"
                      placeholder="Context (optional)"
                      className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      value={editFormat}
                      onChange={(event) => setEditFormat(event.target.value)}
                      aria-label="Edit possible format"
                      placeholder="Possible format (optional)"
                      className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-md border border-foreground px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="rounded-md px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:text-accent"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li
                key={thought.id}
                className="flex items-start justify-between gap-4 py-4"
              >
                <div className="flex flex-col gap-1">
                  <p className="max-w-prose text-base leading-relaxed text-foreground">
                    {thought.content}
                  </p>
                  {thought.context && (
                    <p className="text-sm text-muted">
                      Context: {thought.context}
                    </p>
                  )}
                  {thought.possibleFormat && (
                    <p className="text-sm text-muted">
                      Format: {thought.possibleFormat}
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    {new Date(thought.createdAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleAddToTikTok(thought.id)}
                    disabled={pendingThoughtId === thought.id || addedThoughtIds.has(thought.id)}
                    className="text-sm text-muted transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addedThoughtIds.has(thought.id)
                      ? "Added ✓"
                      : pendingThoughtId === thought.id
                        ? "Adding…"
                        : "Turn into TikTok idea"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(thought)}
                    className="text-sm text-muted transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteThought(thought.id)}
                    aria-label={`Delete thought: ${thought.content}`}
                    className="text-sm text-muted transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import {
  MAX_CREATIVE_WORK_REFLECTION_LENGTH,
  type CreativeWork,
  type CreativeWorkStatus,
} from "@/lib/echo/types";

const NEXT_STATUS: Partial<
  Record<CreativeWorkStatus, { status: CreativeWorkStatus; label: string }>
> = {
  ready: { status: "filming", label: "Mark as filming" },
  filming: { status: "editing", label: "Mark as editing" },
  editing: { status: "posted", label: "Mark as posted" },
};

interface CreativeWorkListItemProps {
  work: CreativeWork;
  isGenerating: boolean;
  onGenerate: (id: string, force: boolean) => void;
  onUpdateStatus: (id: string, status: CreativeWorkStatus) => void;
  onUpdateReflection: (id: string, reflection: string) => void;
}

export function CreativeWorkListItem({
  work,
  isGenerating,
  onGenerate,
  onUpdateStatus,
  onUpdateReflection,
}: CreativeWorkListItemProps) {
  const [reflectionDraft, setReflectionDraft] = useState(work.reflection ?? "");
  const nextStep = NEXT_STATUS[work.status];

  function handleReflectionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reflectionDraft.trim();
    if (!trimmed) return;
    onUpdateReflection(work.id, trimmed);
  }

  return (
    <li className="flex flex-col gap-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-accent">
          {work.status}
        </span>
        <span className="text-xs text-muted">{work.platform}</span>
      </div>

      {work.package ? (
        <PackageView packageContent={work.package} />
      ) : (
        <p className="text-sm text-muted">No package generated yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!work.package && (
          <button
            type="button"
            onClick={() => onGenerate(work.id, false)}
            disabled={isGenerating}
            className="rounded-md border border-foreground px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? "Generating…" : "Generate package"}
          </button>
        )}

        {work.package && (
          <button
            type="button"
            onClick={() => onGenerate(work.id, true)}
            disabled={isGenerating}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? "Regenerating…" : "Regenerate package"}
          </button>
        )}

        {nextStep && (
          <button
            type="button"
            onClick={() => onUpdateStatus(work.id, nextStep.status)}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            {nextStep.label}
          </button>
        )}
      </div>

      {work.status === "posted" && (
        <form onSubmit={handleReflectionSubmit} className="flex flex-col gap-2">
          <label htmlFor={`reflection-${work.id}`} className="text-sm text-muted">
            Reflection
          </label>
          <textarea
            id={`reflection-${work.id}`}
            value={reflectionDraft}
            onChange={(event) => setReflectionDraft(event.target.value)}
            maxLength={MAX_CREATIVE_WORK_REFLECTION_LENGTH}
            rows={2}
            placeholder="How did it go?"
            className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="self-start rounded-md border border-foreground px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            Save reflection
          </button>
        </form>
      )}
    </li>
  );
}

function PackageView({
  packageContent,
}: {
  packageContent: NonNullable<CreativeWork["package"]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold text-foreground">{packageContent.title}</h3>
      <p className="max-w-prose border-l-2 border-accent pl-4 text-base italic leading-relaxed text-foreground">
        {packageContent.hook}
      </p>
      <p className="max-w-prose text-base leading-relaxed text-foreground">
        {packageContent.concept}
      </p>

      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted transition-colors [&::-webkit-details-marker]:hidden hover:text-accent">
          <span
            aria-hidden="true"
            className="inline-block transition-transform group-open:rotate-45"
          >
            +
          </span>
          Full production details
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-foreground">
          <div>
            <span className="text-muted">Beats:</span>
            <ul className="ml-4 list-disc">
              {packageContent.beats.map((beat, index) => (
                <li key={index}>{beat}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-muted">Shot list:</span>
            <ul className="ml-4 list-disc">
              {packageContent.shotList.map((shot, index) => (
                <li key={index}>{shot}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-muted">Editing notes:</span>
            <ul className="ml-4 list-disc">
              {packageContent.editingNotes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </div>
          <p>
            <span className="text-muted">Caption: </span>
            {packageContent.caption}
          </p>
          <p>
            <span className="text-muted">Hashtags: </span>
            {packageContent.hashtags.join(" ")}
          </p>
          <p>
            <span className="text-muted">Estimated length: </span>
            {packageContent.estimatedSeconds}s
          </p>
          <p>
            <span className="text-muted">Why it fits: </span>
            {packageContent.whyItFits}
          </p>
        </div>
      </details>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCreativeWorks } from "@/lib/echo/creative-works/useCreativeWorks";
import { CreativeWorkListItem } from "@/components/echo/tiktok/CreativeWorkListItem";

export default function TikTokPage() {
  const {
    creativeWorks,
    isLoading,
    error,
    isBusy,
    isGenerating,
    generatePackage,
    updateStatus,
    updateReflection,
  } = useCreativeWorks();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12 sm:py-16 lg:max-w-4xl lg:px-12">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-accent">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          TikTok Ideas
        </h1>
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : creativeWorks.length === 0 ? (
        <p className="text-sm text-muted">
          No TikTok ideas yet. Turn a thought into one from the Thought Inbox.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {creativeWorks.map((work) => (
            <CreativeWorkListItem
              key={work.id}
              work={work}
              isBusy={isBusy(work.id)}
              isGenerating={isGenerating(work.id)}
              onGenerate={generatePackage}
              onUpdateStatus={updateStatus}
              onUpdateReflection={updateReflection}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

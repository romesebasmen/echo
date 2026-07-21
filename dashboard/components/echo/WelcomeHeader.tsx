import Link from "next/link";
import { creatorProfile } from "@/lib/echo/profile";

export function WelcomeHeader() {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Hi {creatorProfile.name}. Here&rsquo;s what you missed.
      </h1>
      <Link
        href="/chat"
        className="text-sm font-medium text-muted transition-colors hover:text-accent"
      >
        Talk to Echo →
      </Link>
    </header>
  );
}

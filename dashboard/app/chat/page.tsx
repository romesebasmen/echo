import Link from "next/link";
import { ChatPanel } from "@/components/echo/chat/ChatPanel";

export default function ChatPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12 sm:py-16 lg:max-w-4xl lg:px-12">
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          aria-label="Return to Echo home"
          className="fixed left-4 top-4 z-40 inline-flex items-center rounded-full border border-border bg-background/90 px-3 py-1.5 text-sm font-medium text-muted shadow-sm backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:left-6 sm:top-6"
        >
          ← Home
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Talk to Echo
        </h1>
      </div>
      <ChatPanel />
    </main>
  );
}

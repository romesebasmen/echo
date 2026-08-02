import Link from "next/link";
import { TasksPanel } from "@/components/echo/tasks/TasksPanel";

export default function TasksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12 sm:py-16 lg:max-w-4xl lg:px-12">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-accent">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Tasks
        </h1>
      </div>
      <TasksPanel />
    </main>
  );
}

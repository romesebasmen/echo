import {
  deleteMemory,
  MissingMemoriesTableError,
  updateMemory,
} from "@/lib/echo/memories/repository";
import type {
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
  MemoryStatus,
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
const STATUSES: MemoryStatus[] = ["active", "superseded", "archived"];

function pickEnum<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : undefined;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : undefined;
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : undefined;
    const category = pickEnum(body.category, CATEGORIES);
    const importance = pickEnum(body.importance, LEVELS) as MemoryImportance | undefined;
    const confidence = pickEnum(body.confidence, LEVELS) as MemoryConfidence | undefined;
    const status = pickEnum(body.status, STATUSES);

    if (!title && !description && !category && !importance && !confidence && !status) {
      return Response.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const memory = await updateMemory(id, {
      title,
      description,
      category,
      importance,
      confidence,
      status,
    });

    return Response.json({ memory });
  } catch (error) {
    if (error instanceof MissingMemoriesTableError) {
      console.error("PATCH /api/memories/[id] failed: memories table is missing.");
      return Response.json(
        {
          error:
            "The memories table doesn't exist yet. Run the setup SQL, then try again.",
        },
        { status: 500 },
      );
    }

    console.error("PATCH /api/memories/[id] failed:", error);
    return Response.json({ error: "Could not update memory." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteMemory(id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MissingMemoriesTableError) {
      console.error("DELETE /api/memories/[id] failed: memories table is missing.");
      return Response.json(
        {
          error:
            "The memories table doesn't exist yet. Run the setup SQL, then try again.",
        },
        { status: 500 },
      );
    }

    console.error("DELETE /api/memories/[id] failed:", error);
    return Response.json({ error: "Could not delete memory." }, { status: 500 });
  }
}

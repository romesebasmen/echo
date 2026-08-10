import {
  deleteMemory,
  MissingMemoriesTableError,
  updateMemory,
} from "@/lib/echo/memories/repository";
import {
  InvalidMemoryRequestError,
  parseMemoryUpdateRequest,
} from "@/lib/echo/memories/request";
import { formatError } from "@/lib/echo/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const input = parseMemoryUpdateRequest(body);
    const memory = await updateMemory(id, input);

    return Response.json({ memory });
  } catch (error) {
    if (error instanceof InvalidMemoryRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
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

    console.error("PATCH /api/memories/[id] failed:", formatError(error));
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

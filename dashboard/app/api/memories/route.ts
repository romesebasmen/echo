import { listMemories, MissingMemoriesTableError } from "@/lib/echo/memories/repository";

export async function GET() {
  try {
    const memories = await listMemories({ status: "active" });
    return Response.json({ memories });
  } catch (error) {
    if (error instanceof MissingMemoriesTableError) {
      console.error("GET /api/memories failed: memories table is missing.");
      return Response.json(
        {
          error:
            "The memories table doesn't exist yet. Run the setup SQL, then try again.",
        },
        { status: 500 },
      );
    }

    console.error("GET /api/memories failed:", error);
    return Response.json({ error: "Could not load memories." }, { status: 500 });
  }
}

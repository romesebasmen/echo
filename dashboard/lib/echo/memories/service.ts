import type { Memory } from "@/lib/echo/types";
import { memories } from "@/lib/echo/memories/mock";

export async function getMemories(): Promise<Memory[]> {
  return memories;
}

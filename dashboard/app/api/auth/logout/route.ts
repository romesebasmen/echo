import { handleEchoLogout } from "@/lib/echo/auth/server-auth";

export async function POST(request: Request) {
  return handleEchoLogout(request);
}

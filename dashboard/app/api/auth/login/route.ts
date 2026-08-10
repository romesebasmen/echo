import { handleEchoLogin } from "@/lib/echo/auth/server-auth";

export async function POST(request: Request) {
  return handleEchoLogin(request, {
    reportConfigurationError: () => {
      console.error(
        "Echo access authentication is not configured. Add the required server-only authentication environment variables.",
      );
    },
  });
}

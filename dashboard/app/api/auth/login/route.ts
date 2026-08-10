import { handleEchoLogin } from "@/lib/echo/auth/server-auth";
import { registerEchoLoginAttempt } from "@/lib/echo/auth/login-throttle-repository";

export async function POST(request: Request) {
  return handleEchoLogin(request, {
    registerLoginAttempt: registerEchoLoginAttempt,
    reportConfigurationError: () => {
      console.error(
        "Echo access authentication is not configured. Add the required server-only authentication environment variables.",
      );
    },
    reportLoginProtectionError: () => {
      console.error("Echo login protection is unavailable.");
    },
  });
}

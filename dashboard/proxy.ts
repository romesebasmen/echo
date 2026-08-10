import type { NextRequest } from "next/server.js";
import {
  gateEchoRequest,
  readEchoAuthConfiguration,
} from "./lib/echo/auth/server-auth.ts";

function reportConfigurationError(): void {
  console.error(
    "Echo access authentication is not configured. Add the required server-only authentication environment variables.",
  );
}

export async function proxy(request: NextRequest) {
  return gateEchoRequest(request, {
    getSessionSecret: () => readEchoAuthConfiguration().sessionSecret,
    reportConfigurationError,
  });
}

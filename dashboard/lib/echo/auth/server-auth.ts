import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server.js";
import {
  createEchoSessionToken,
  ECHO_SESSION_COOKIE,
  ECHO_SESSION_DURATION_SECONDS,
  verifyEchoSessionToken,
} from "./session.ts";

const MINIMUM_SESSION_SECRET_LENGTH = 32;
const MINIMUM_ACCESS_PASSWORD_LENGTH = 12;
const DUMMY_PASSWORD_COMPARISON_VALUE =
  "echo-auth-configuration-unavailable-comparison-value";

export class EchoAuthConfigurationError extends Error {
  constructor() {
    super(
      "Echo access authentication is not configured. Set ECHO_ACCESS_PASSWORD and a strong ECHO_SESSION_SECRET in the server environment.",
    );
    this.name = "EchoAuthConfigurationError";
  }
}

export type EchoAuthConfiguration = {
  accessPassword: string;
  sessionSecret: string;
};

type Environment = Partial<
  Record<"ECHO_ACCESS_PASSWORD" | "ECHO_SESSION_SECRET", string>
>;

export function readEchoAuthConfiguration(
  environment: Environment = {
    ECHO_ACCESS_PASSWORD: process.env.ECHO_ACCESS_PASSWORD,
    ECHO_SESSION_SECRET: process.env.ECHO_SESSION_SECRET,
  },
): EchoAuthConfiguration {
  const accessPassword = environment.ECHO_ACCESS_PASSWORD;
  const sessionSecret = environment.ECHO_SESSION_SECRET;

  if (
    !accessPassword ||
    accessPassword.length < MINIMUM_ACCESS_PASSWORD_LENGTH ||
    !sessionSecret ||
    sessionSecret.length < MINIMUM_SESSION_SECRET_LENGTH
  ) {
    throw new EchoAuthConfigurationError();
  }

  return { accessPassword, sessionSecret };
}

export function verifyEchoAccessPassword(
  candidate: string,
  expected: string,
): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();

  return timingSafeEqual(candidateDigest, expectedDigest);
}

function loginFailureResponse(request: Request): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "invalid");
  return NextResponse.redirect(loginUrl, 303);
}

export type LoginHandlerDependencies = {
  registerLoginAttempt: (passwordValid: boolean) => Promise<boolean>;
  getConfiguration?: () => EchoAuthConfiguration;
  now?: () => Date;
  isProduction?: boolean;
  reportConfigurationError?: () => void;
  reportLoginProtectionError?: () => void;
};

export async function handleEchoLogin(
  request: Request,
  dependencies: LoginHandlerDependencies,
): Promise<NextResponse> {
  let password = "";
  try {
    const formData = await request.formData();
    const value = formData.get("password");
    password = typeof value === "string" ? value : "";
  } catch {
    return loginFailureResponse(request);
  }

  let configuration: EchoAuthConfiguration;
  try {
    configuration =
      dependencies.getConfiguration?.() ?? readEchoAuthConfiguration();
  } catch (error) {
    if (error instanceof EchoAuthConfigurationError) {
      verifyEchoAccessPassword(password, DUMMY_PASSWORD_COMPARISON_VALUE);
      dependencies.reportConfigurationError?.();
      return loginFailureResponse(request);
    }
    throw error;
  }

  const passwordValid =
    Boolean(password) &&
    verifyEchoAccessPassword(password, configuration.accessPassword);

  let loginAllowed = false;
  try {
    loginAllowed = await dependencies.registerLoginAttempt(passwordValid);
  } catch {
    dependencies.reportLoginProtectionError?.();
    return loginFailureResponse(request);
  }

  if (!passwordValid || !loginAllowed) {
    return loginFailureResponse(request);
  }

  const now = dependencies.now?.() ?? new Date();
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set({
    name: ECHO_SESSION_COOKIE,
    value: createEchoSessionToken(configuration.sessionSecret, now),
    httpOnly: true,
    sameSite: "lax",
    secure: dependencies.isProduction ?? process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ECHO_SESSION_DURATION_SECONDS,
    expires: new Date(
      now.getTime() + ECHO_SESSION_DURATION_SECONDS * 1000,
    ),
  });

  return response;
}

export function handleEchoLogout(
  request: Request,
  isProduction = process.env.NODE_ENV === "production",
): NextResponse {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set({
    name: ECHO_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/favicon.ico",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
]);
const SAFE_REQUEST_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    (pathname.startsWith("/_next/") &&
      !pathname.startsWith("/_next/data/"))
  );
}

function isSameOriginMutation(request: NextRequest): boolean {
  if (SAFE_REQUEST_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export type AccessGateDependencies = {
  getSessionSecret?: () => string;
  now?: () => Date;
  reportConfigurationError?: () => void;
};

export async function gateEchoRequest(
  request: NextRequest,
  dependencies: AccessGateDependencies = {},
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let sessionSecret: string;
  try {
    sessionSecret =
      dependencies.getSessionSecret?.() ??
      readEchoAuthConfiguration().sessionSecret;
  } catch (error) {
    if (error instanceof EchoAuthConfigurationError) {
      dependencies.reportConfigurationError?.();
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Echo access is unavailable." },
          { status: 503 },
        );
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
    throw error;
  }

  const token = request.cookies.get(ECHO_SESSION_COOKIE)?.value;
  const session = verifyEchoSessionToken(
    token,
    sessionSecret,
    dependencies.now?.() ?? new Date(),
  );

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // SameSite=Lax is the first CSRF boundary for Echo's session cookie. The
  // explicit Origin check is defense in depth for every authenticated
  // mutation and runs here, before a Route Handler can reach Supabase or an
  // AI provider. Login remains public and reveals no privileged state.
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "Cross-site requests are not allowed." },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

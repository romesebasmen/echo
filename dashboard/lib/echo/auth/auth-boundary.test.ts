import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const dashboardRoot = resolve(import.meta.dirname, "../../..");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

test("auth secrets are server-only and never use NEXT_PUBLIC names", () => {
  const serverAuth = readFileSync(
    resolve(dashboardRoot, "lib/echo/auth/server-auth.ts"),
    "utf8",
  );
  const loginPage = readFileSync(
    resolve(dashboardRoot, "app/login/page.tsx"),
    "utf8",
  );

  assert.match(serverAuth, /process\.env/);
  assert.match(serverAuth, /ECHO_ACCESS_PASSWORD/);
  assert.match(serverAuth, /ECHO_SESSION_SECRET/);
  assert.doesNotMatch(serverAuth, /NEXT_PUBLIC_(?:ECHO_ACCESS_PASSWORD|ECHO_SESSION_SECRET)/);
  assert.doesNotMatch(loginPage, /ECHO_ACCESS_PASSWORD|ECHO_SESSION_SECRET/);

  const secretReferences = ["app", "components", "lib"]
    .flatMap((directory) => listSourceFiles(resolve(dashboardRoot, directory)))
    .filter((file) =>
      /ECHO_ACCESS_PASSWORD|ECHO_SESSION_SECRET/.test(
        readFileSync(file, "utf8"),
      ),
    );
  assert.deepEqual(secretReferences, [
    resolve(dashboardRoot, "lib/echo/auth/server-auth.ts"),
  ]);
});

test("the proxy runs globally so no API family can be omitted by a matcher", () => {
  const proxySource = readFileSync(resolve(dashboardRoot, "proxy.ts"), "utf8");
  const serverAuth = readFileSync(
    resolve(dashboardRoot, "lib/echo/auth/server-auth.ts"),
    "utf8",
  );

  assert.doesNotMatch(proxySource, /matcher/);
  assert.match(serverAuth, /pathname\.startsWith\("\/_next\/"\)/);
  assert.match(serverAuth, /!pathname\.startsWith\("\/_next\/data\/"\)/);
});

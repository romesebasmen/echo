import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSupabaseServerConfiguration } from "./server-client.ts";

test("server Supabase configuration uses the private service-role credential", () => {
  const configuration = resolveSupabaseServerConfiguration({
    SUPABASE_URL: "https://example.supabase.co/rest/v1/",
    SUPABASE_PUBLISHABLE_KEY: "publishable-must-not-be-used",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-value",
  });

  assert.deepEqual(configuration, {
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role-test-value",
  });
});

test("server Supabase configuration fails closed without the service-role credential", () => {
  assert.throws(
    () =>
      resolveSupabaseServerConfiguration({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable-must-not-be-used",
      }),
    /Missing SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test("privileged Supabase client has no public credential or browser session behavior", () => {
  const source = readFileSync(new URL("./server-client.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /process\.env\.SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
  assert.match(source, /typeof window !== "undefined"/);
  assert.match(source, /persistSession: false/);
  assert.match(source, /autoRefreshToken: false/);
  assert.match(source, /detectSessionInUrl: false/);
});

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_ROOTS = ["app", "components", "lib"];
const SERVER_ONLY_TARGETS = new Set([
  resolve(PROJECT_ROOT, "lib/echo/supabase/server-client.ts"),
  resolve(PROJECT_ROOT, "lib/echo/supabase/service-role-client.ts"),
]);

function listSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") ? [path] : [];
  });
}

function resolveLocalImport(importer: string, specifier: string): string | null {
  const unresolved = specifier.startsWith("@/")
    ? resolve(PROJECT_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : null;

  if (!unresolved) {
    return null;
  }

  const candidates = /\.(?:ts|tsx)$/.test(unresolved)
    ? [unresolved]
    : [
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        resolve(unresolved, "index.ts"),
        resolve(unresolved, "index.tsx"),
      ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function localImports(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const specifiers = [
    ...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);

  return specifiers
    .map((specifier) => resolveLocalImport(path, specifier))
    .filter((dependency): dependency is string => dependency !== null);
}

test("no Client Component can reach a privileged Supabase client", () => {
  const sourceFiles = SOURCE_ROOTS.flatMap((root) =>
    listSourceFiles(resolve(PROJECT_ROOT, root)),
  );
  const clientRoots = sourceFiles.filter((path) =>
    /^\s*["']use client["'];/m.test(readFileSync(path, "utf8")),
  );

  for (const clientRoot of clientRoots) {
    const pending: Array<{ path: string; chain: string[] }> = [
      { path: clientRoot, chain: [clientRoot] },
    ];
    const visited = new Set<string>();

    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || visited.has(current.path)) {
        continue;
      }
      visited.add(current.path);

      assert.equal(
        SERVER_ONLY_TARGETS.has(current.path),
        false,
        `Client import chain reached a privileged Supabase client:\n${current.chain.join("\n -> ")}`,
      );

      for (const dependency of localImports(current.path)) {
        pending.push({
          path: dependency,
          chain: [...current.chain, dependency],
        });
      }
    }
  }
});

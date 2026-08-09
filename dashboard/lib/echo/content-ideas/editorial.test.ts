import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { editorialIdeaOfTheDay } from "./editorial.ts";
import { editorialRadarItems } from "../daily-briefing/editorial-radar.ts";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

test("editorial home ideas contain hypotheses rather than claimed observations", () => {
  assert.ok(editorialIdeaOfTheDay.evidenceBasis.length > 0);
  assert.ok(
    editorialIdeaOfTheDay.evidenceBasis.every(
      (evidence) => evidence.kind === "hypothesis",
    ),
  );
  assert.ok(
    editorialRadarItems.every(
      (item) => item.source === "Editorial hypothesis",
    ),
  );
});

test("editorial copy does not claim current audience, performance, or events", () => {
  const copy = JSON.stringify({ editorialIdeaOfTheDay, editorialRadarItems });

  for (const unsupportedClaim of [
    /you(?:'ve| have) complained .*recently/i,
    /best-performing posts/i,
    /outperforming/i,
    /comments\s*(?:and|\/)\s*dms/i,
    /tiktok comments/i,
    /this week's parking chaos/i,
    /they closed two more lots/i,
  ]) {
    assert.doesNotMatch(copy, unsupportedClaim);
  }
});

test("production creative services no longer import mock modules", async () => {
  const productionFiles = [
    join(moduleDirectory, "service.ts"),
    join(moduleDirectory, "../daily-briefing/service.ts"),
  ];
  const sources = await Promise.all(
    productionFiles.map((file) => readFile(file, "utf8")),
  );

  assert.equal(sources.some((source) => source.includes(".mock")), false);
});

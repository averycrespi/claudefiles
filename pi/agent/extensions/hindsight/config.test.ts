import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { maskConfigValue } from "../_shared/config.ts";
import {
  loadHindsightConfig,
  normalizeConfig,
  readEnvSettings,
} from "./config.ts";

test("normalizes invalid optional config to defaults", () => {
  assert.deepEqual(
    normalizeConfig({
      baseUrl: "not a url",
      apiKey: " ",
      bankId: " bank ",
      defaultScope: "bad",
      defaultTags: [" one ", 3, ""],
      recallMaxTokens: -1,
      recallBudget: "bad",
      reflectBudget: "high",
      tagsMatch: "all",
    } as any),
    {
      baseUrl: "http://localhost:8888",
      apiKey: undefined,
      bankId: "bank",
      defaultScope: "repo",
      defaultTags: ["one"],
      recallMaxTokens: 1200,
      recallBudget: "mid",
      reflectBudget: "high",
      tagsMatch: "all",
    },
  );
});

test("reads environment overrides", () => {
  const old = { ...process.env };
  process.env.HINDSIGHT_BASE_URL = "https://hindsight.example.com/";
  process.env.HINDSIGHT_API_KEY = "secret";
  process.env.HINDSIGHT_BANK_ID = "main";
  process.env.HINDSIGHT_DEFAULT_TAGS = "one, two,,";
  process.env.HINDSIGHT_RECALL_MAX_TOKENS = "99";
  try {
    assert.deepEqual(readEnvSettings(), {
      baseUrl: "https://hindsight.example.com/",
      apiKey: "secret",
      bankId: "main",
      defaultTags: ["one", "two"],
      recallMaxTokens: 99,
    });
  } finally {
    process.env = old;
  }
});

test("masks apiKey", () => {
  const masked = maskConfigValue({ apiKey: "secret" }, ["apiKey"]);
  assert.equal((masked as { apiKey: unknown }).apiKey, "********");
});

test("loadHindsightConfig applies project settings and environment overrides", async () => {
  const old = { ...process.env };
  const cwd = mkdtempSync(join(tmpdir(), "hindsight-config-"));
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "settings.json"),
    JSON.stringify({
      "extension:hindsight": {
        baseUrl: "https://project.example.com",
        apiKey: "project-key",
        bankId: "project-bank",
        defaultScope: "global",
        recallBudget: "high",
      },
    }),
  );
  process.env = { ...old };
  delete process.env.HINDSIGHT_BASE_URL;
  delete process.env.HINDSIGHT_API_KEY;
  process.env.HINDSIGHT_BANK_ID = "env-bank";
  process.env.HINDSIGHT_DEFAULT_SCOPE = "repo";
  try {
    const config = await loadHindsightConfig(cwd);
    assert.equal(config.baseUrl, "https://project.example.com");
    assert.equal(config.apiKey, "project-key");
    assert.equal(config.bankId, "env-bank");
    assert.equal(config.defaultScope, "repo");
    assert.equal(config.recallBudget, "high");
  } finally {
    process.env = old;
  }
});

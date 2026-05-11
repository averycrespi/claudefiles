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
      apiUrl: "not a url",
      apiKey: " ",
      bankId: " ",
      defaultScope: "bad",
      defaultTags: [" one ", 3, ""],
      recallMaxTokens: -1,
      reflectMaxTokens: -2,
      recallBudget: "bad",
      reflectBudget: "high",
      tagsMatch: "all",
    } as any),
    {
      apiUrl: "http://localhost:8888",
      apiKey: undefined,
      bankId: "default",
      defaultScope: "repo",
      defaultTags: ["one"],
      recallMaxTokens: 1200,
      reflectMaxTokens: 1200,
      recallBudget: "mid",
      reflectBudget: "high",
      tagsMatch: "all",
    },
  );
});

test("trims configured bankId", () => {
  assert.equal(normalizeConfig({ bankId: " bank " }).bankId, "bank");
});

test("reads environment overrides", () => {
  const old = { ...process.env };
  process.env.HINDSIGHT_API_URL = "https://hindsight.example.com/";
  process.env.HINDSIGHT_API_KEY = "secret";
  process.env.HINDSIGHT_BANK_ID = "main";
  process.env.HINDSIGHT_DEFAULT_TAGS = "one, two,,";
  process.env.HINDSIGHT_DEFAULT_SCOPE = "global";
  process.env.HINDSIGHT_RECALL_MAX_TOKENS = "99";
  process.env.HINDSIGHT_REFLECT_MAX_TOKENS = "88";
  process.env.HINDSIGHT_RECALL_BUDGET = "high";
  process.env.HINDSIGHT_REFLECT_BUDGET = "mid";
  process.env.HINDSIGHT_TAGS_MATCH = "all";
  try {
    assert.deepEqual(readEnvSettings(), {
      apiUrl: "https://hindsight.example.com/",
      apiKey: "secret",
      bankId: "main",
      defaultScope: "global",
      defaultTags: ["one", "two"],
      recallMaxTokens: 99,
      reflectMaxTokens: 88,
      recallBudget: "high",
      reflectBudget: "mid",
      tagsMatch: "all",
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
        apiUrl: "https://project.example.com",
        apiKey: "project-key",
        bankId: "project-bank",
        defaultScope: "global",
        recallBudget: "high",
      },
    }),
  );
  process.env = { ...old };
  delete process.env.HINDSIGHT_API_URL;
  delete process.env.HINDSIGHT_API_KEY;
  process.env.HINDSIGHT_BANK_ID = "env-bank";
  process.env.HINDSIGHT_DEFAULT_SCOPE = "repo";
  try {
    const config = await loadHindsightConfig(cwd);
    assert.equal(config.apiUrl, "https://project.example.com");
    assert.equal(config.apiKey, "project-key");
    assert.equal(config.bankId, "env-bank");
    assert.equal(config.defaultScope, "repo");
    assert.equal(config.recallBudget, "high");
  } finally {
    process.env = old;
  }
});

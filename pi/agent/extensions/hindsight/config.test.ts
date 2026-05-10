import test from "node:test";
import assert from "node:assert/strict";
import { maskConfigValue } from "../_shared/config.ts";
import { normalizeConfig, readEnvSettings } from "./config.ts";

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

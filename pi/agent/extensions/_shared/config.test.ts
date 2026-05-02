import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeExtensionConfig,
  parseBooleanEnv,
  readExtensionSettings,
} from "./config.ts";

test("readExtensionSettings reads extension-scoped top-level object", () => {
  assert.deepEqual(
    readExtensionSettings(
      {
        model: "x",
        "extension:hindsight-memory": { apiUrl: "https://example.com" },
      },
      "hindsight-memory",
    ),
    { apiUrl: "https://example.com" },
  );
});

test("readExtensionSettings ignores missing or non-object config", () => {
  assert.deepEqual(readExtensionSettings({}, "missing"), {});
  assert.deepEqual(readExtensionSettings({ "extension:x": null }, "x"), {});
  assert.deepEqual(readExtensionSettings({ "extension:x": "bad" }, "x"), {});
});

test("mergeExtensionConfig applies defaults, global, project, env in order", () => {
  const result = mergeExtensionConfig({
    defaults: { enabled: true, apiUrl: "default", bankId: "a" },
    globalSettings: { enabled: false, apiUrl: "global" },
    projectSettings: { apiUrl: "project" },
    envSettings: { bankId: "env" },
  });

  assert.deepEqual(result, {
    enabled: false,
    apiUrl: "project",
    bankId: "env",
  });
});

test("parseBooleanEnv accepts common true and false values", () => {
  assert.equal(parseBooleanEnv("true"), true);
  assert.equal(parseBooleanEnv("1"), true);
  assert.equal(parseBooleanEnv("yes"), true);
  assert.equal(parseBooleanEnv("false"), false);
  assert.equal(parseBooleanEnv("0"), false);
  assert.equal(parseBooleanEnv("no"), false);
  assert.equal(parseBooleanEnv(""), undefined);
});

test("parseBooleanEnv reports invalid values without throwing", () => {
  const warnings: string[] = [];

  assert.equal(
    parseBooleanEnv("sometimes", "HINDSIGHT_ENABLED", warnings),
    undefined,
  );
  assert.deepEqual(warnings, [
    "Ignoring invalid boolean env HINDSIGHT_ENABLED=sometimes",
  ]);
});

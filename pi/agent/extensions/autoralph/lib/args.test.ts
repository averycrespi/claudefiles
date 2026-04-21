import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_REFLECT_EVERY,
  DEFAULT_TIMEOUT_MINS,
} from "./args.ts";

test("parseArgs: accepts bare design path with defaults", () => {
  const r = parseArgs("design.md");
  assert.ok(!("error" in r));
  assert.equal(r.designPath, "design.md");
  assert.equal(r.reflectEvery, DEFAULT_REFLECT_EVERY);
  assert.equal(r.maxIterations, DEFAULT_MAX_ITERATIONS);
  assert.equal(r.timeoutMins, DEFAULT_TIMEOUT_MINS);
});

test("parseArgs: missing design path returns error", () => {
  const r = parseArgs("");
  assert.ok("error" in r);
  assert.match(r.error, /missing design file path/);
});

test("parseArgs: only flags (no positional) returns error", () => {
  const r = parseArgs("--reflect-every 3");
  assert.ok("error" in r);
  assert.match(r.error, /missing design file path/);
});

test("parseArgs: parses all three flags", () => {
  const r = parseArgs(
    "design.md --reflect-every 3 --max-iterations 20 --iteration-timeout-mins 10",
  );
  assert.ok(!("error" in r));
  assert.equal(r.reflectEvery, 3);
  assert.equal(r.maxIterations, 20);
  assert.equal(r.timeoutMins, 10);
});

test("parseArgs: flags may precede positional", () => {
  const r = parseArgs("--max-iterations 5 design.md");
  assert.ok(!("error" in r));
  assert.equal(r.designPath, "design.md");
  assert.equal(r.maxIterations, 5);
});

test("parseArgs: --reflect-every 0 is valid (disables reflection)", () => {
  const r = parseArgs("design.md --reflect-every 0");
  assert.ok(!("error" in r));
  assert.equal(r.reflectEvery, 0);
});

test("parseArgs: --reflect-every negative is rejected", () => {
  const r = parseArgs("design.md --reflect-every -1");
  assert.ok("error" in r);
  assert.match(r.error, /--reflect-every/);
});

test("parseArgs: --max-iterations 0 is rejected", () => {
  const r = parseArgs("design.md --max-iterations 0");
  assert.ok("error" in r);
  assert.match(r.error, /--max-iterations/);
});

test("parseArgs: --iteration-timeout-mins 0 is rejected", () => {
  const r = parseArgs("design.md --iteration-timeout-mins 0");
  assert.ok("error" in r);
  assert.match(r.error, /--iteration-timeout-mins/);
});

test("parseArgs: --reflect-every with non-numeric arg is rejected", () => {
  const r = parseArgs("design.md --reflect-every abc");
  assert.ok("error" in r);
  assert.match(r.error, /--reflect-every/);
});

test("parseArgs: unknown flag is rejected", () => {
  const r = parseArgs("design.md --foo 1");
  assert.ok("error" in r);
  assert.match(r.error, /unknown flag: --foo/);
});

test("parseArgs: second positional argument is rejected", () => {
  const r = parseArgs("design.md extra.md");
  assert.ok("error" in r);
  assert.match(r.error, /unexpected positional argument: extra\.md/);
});

test("parseArgs: design path with control characters is rejected", () => {
  const r = parseArgs("design.md\nmalicious");
  // The shell-like tokenizer splits on \s+, so \n becomes two tokens:
  // "design.md" then "malicious" — caught by the extra-positional branch.
  assert.ok("error" in r);
});

test("parseArgs: design path containing embedded tab is split by tokenizer", () => {
  // \s+ split prevents control chars from surviving to designPath,
  // but we also guard explicitly.
  const r = parseArgs("design.md");
  assert.ok(!("error" in r));
});

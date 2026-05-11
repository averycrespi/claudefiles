import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMetadata,
  buildQueryTags,
  buildTags,
  deriveRepoName,
  normalizeTag,
  TAG_POLICY_VERSION,
} from "./tags.ts";

test("normalizes tags predictably", () => {
  assert.equal(normalizeTag(" Ticket ABC 123! "), "ticket-abc-123");
  assert.equal(normalizeTag("Repo:Agent Config"), "repo:agent-config");
});

test("builds deterministic scoped tags", () => {
  const dir = mkdtempSync(join(tmpdir(), "hindsight-tags-"));
  mkdirSync(join(dir, ".git"));
  assert.deepEqual(
    buildTags({
      cwd: dir,
      scope: "repo",
      source: "external",
      kind: "semantic",
      defaultTags: ["Default Tag"],
      tags: ["Ticket:ABC-123"],
    }),
    [
      "scope:repo",
      `repo:${normalizeTag(dir.split("/").pop() ?? "")}`,
      "source:external",
      "kind:semantic",
      "default-tag",
      "ticket:abc-123",
    ],
  );
});

test("builds deterministic origin tags", () => {
  const dir = mkdtempSync(join(tmpdir(), "hindsight-origin-tags-"));
  mkdirSync(join(dir, ".git"));
  const tags = buildTags({
    cwd: dir,
    scope: "repo",
    source: "external",
    kind: "semantic",
    origin: "Jira Importer",
  });
  assert.ok(tags.includes("origin:jira-importer"));

  const queryTags = buildQueryTags({
    cwd: dir,
    scope: "repo",
    origin: "Jira Importer",
  });
  assert.ok(queryTags.includes("origin:jira-importer"));
});

test("builds metadata with origin, document id, and policy version", () => {
  const dir = mkdtempSync(join(tmpdir(), "hindsight-metadata-"));
  mkdirSync(join(dir, ".git"));
  const metadata = buildMetadata({
    cwd: dir,
    scope: "repo",
    source: "external",
    kind: "procedural",
    origin: "docs importer",
    documentId: "repo:agent-config:convention:stow-editing",
    metadata: { x: "y" },
  });

  assert.equal(metadata.x, "y");
  assert.equal(metadata.hindsight_origin, "docs-importer");
  assert.equal(
    metadata.hindsight_document_id,
    "repo:agent-config:convention:stow-editing",
  );
  assert.equal(metadata.hindsight_tag_policy_version, TAG_POLICY_VERSION);
});

test("builds query tags without source filtering", () => {
  const dir = mkdtempSync(join(tmpdir(), "hindsight-query-tags-"));
  mkdirSync(join(dir, ".git"));
  const tags = buildQueryTags({
    cwd: dir,
    scope: "repo",
    defaultTags: ["Default Tag"],
    tags: ["Ticket:ABC-123"],
  });
  assert.ok(tags.includes("scope:repo"));
  assert.ok(!tags.some((tag) => tag.startsWith("source:")));
});

test("derives base repo name for worktrees", () => {
  const root = mkdtempSync(join(tmpdir(), "hindsight-worktree-"));
  const repo = join(root, "base-repo");
  const worktree = join(root, "feature-worktree");
  const gitdir = join(repo, ".git", "worktrees", "feature-worktree");
  mkdirSync(gitdir, { recursive: true });
  mkdirSync(worktree);
  writeFileSync(join(worktree, ".git"), `gitdir: ${gitdir}\n`);
  writeFileSync(join(gitdir, "commondir"), "../..\n");
  assert.equal(deriveRepoName(worktree), "base-repo");
});

test("falls back to basename outside git", () => {
  const dir = mkdtempSync(join(tmpdir(), "hindsight-nongit-"));
  assert.equal(deriveRepoName(dir), dir.split("/").pop());
});

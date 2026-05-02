import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommitLog } from "./git.ts";

test("parseCommitLog parses short hash and subject", () => {
  assert.deepEqual(
    parseCommitLog(
      "1a2b3c4 refine statusline footer\n9d8e7f6 add workflow mode widget",
    ),
    [
      { hash: "1a2b3c4", subject: "refine statusline footer" },
      { hash: "9d8e7f6", subject: "add workflow mode widget" },
    ],
  );
});

test("parseCommitLog ignores blank lines and limits to three commits", () => {
  assert.deepEqual(
    parseCommitLog("\n1111111 one\n2222222 two\n3333333 three\n4444444 four\n"),
    [
      { hash: "1111111", subject: "one" },
      { hash: "2222222", subject: "two" },
      { hash: "3333333", subject: "three" },
    ],
  );
});

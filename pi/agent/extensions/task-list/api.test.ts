import { test } from "node:test";
import assert from "node:assert/strict";
import { taskList } from "./api.ts";

test("taskList is a module-level singleton", async () => {
  taskList.clear();
  taskList.create([{ title: "a" }]);
  const reImport = (await import("./api.ts")).taskList;
  assert.equal(reImport.all().length, 1);
  taskList.clear();
});

test("subscribe fires on mutations and unsubscribe stops callbacks", () => {
  taskList.clear();
  let calls = 0;
  const unsubscribe = taskList.subscribe(() => {
    calls++;
  });
  taskList.create([{ title: "a" }]);
  assert.ok(calls >= 1);
  const before = calls;
  unsubscribe();
  taskList.start(1);
  assert.equal(calls, before);
  taskList.clear();
});

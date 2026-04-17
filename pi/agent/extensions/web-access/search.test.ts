import { test } from "node:test";
import assert from "node:assert/strict";
import { formatResults, type SearchResponse } from "./search.ts";

test("formatResults returns 'No results found.' for empty response", () => {
  const response: SearchResponse = { results: [], provider: "tavily" };
  assert.equal(formatResults(response), "No results found.");
});

test("formatResults numbers results starting from 1", () => {
  const response: SearchResponse = {
    provider: "tavily",
    results: [
      { title: "First", url: "https://a.example", snippet: "one" },
      { title: "Second", url: "https://b.example", snippet: "two" },
    ],
  };
  const out = formatResults(response);
  assert.match(out, /^1\. \*\*First\*\*/);
  assert.match(out, /\n\n2\. \*\*Second\*\*/);
});

test("formatResults includes date when present", () => {
  const response: SearchResponse = {
    provider: "tavily",
    results: [
      {
        title: "Dated",
        url: "https://a.example",
        snippet: "s",
        date: "2026-01-02",
      },
    ],
  };
  assert.equal(
    formatResults(response),
    "1. **Dated** · 2026-01-02\n   https://a.example\n   s",
  );
});

test("formatResults omits date separator when date is missing", () => {
  const response: SearchResponse = {
    provider: "tavily",
    results: [{ title: "NoDate", url: "https://a.example", snippet: "s" }],
  };
  assert.equal(
    formatResults(response),
    "1. **NoDate**\n   https://a.example\n   s",
  );
});

test("formatResults separates entries with a blank line", () => {
  const response: SearchResponse = {
    provider: "jina",
    results: [
      { title: "A", url: "https://a.example", snippet: "sa" },
      { title: "B", url: "https://b.example", snippet: "sb" },
    ],
  };
  const sections = formatResults(response).split("\n\n");
  assert.equal(sections.length, 2);
  assert.match(sections[0], /^1\. \*\*A\*\*/);
  assert.match(sections[1], /^2\. \*\*B\*\*/);
});

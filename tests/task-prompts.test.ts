import test from "node:test";
import assert from "node:assert/strict";
import { getBuiltInTaskPrompt } from "../src/lib/ai/task-prompts";

test("getBuiltInTaskPrompt returns defaults for implemented tasks", () => {
  const parsePrompt = getBuiltInTaskPrompt("PARSE_PDF");
  const summarizePrompt = getBuiltInTaskPrompt("SUMMARIZE");

  assert.ok(parsePrompt && parsePrompt.length > 0);
  assert.ok(summarizePrompt && summarizePrompt.length > 0);
});

test("getBuiltInTaskPrompt returns null for tasks without built-in defaults", () => {
  assert.equal(getBuiltInTaskPrompt("PEER_REVIEW"), null);
  assert.equal(getBuiltInTaskPrompt("CUSTOM"), null);
});

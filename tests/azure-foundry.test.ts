import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatParseBody,
  buildImageToTextParseBody,
  extractImageToTextContent,
  shouldUseImageToTextForParse,
  shouldRetryParseWithImageToText,
} from "../src/lib/ai/azure-foundry";
import { sanitizeProviderErrorText } from "../src/lib/ai/error-sanitizer";

test("buildImageToTextParseBody creates top-level document payload", () => {
  const body = buildImageToTextParseBody("mistral-document-ai-2512", "abc123==");
  const document = body.document as { type?: string; document_url?: string } | undefined;

  assert.equal(body.model, "mistral-document-ai-2512");
  assert.equal(document?.type, "document_url");
  assert.equal(document?.document_url, "data:application/pdf;base64,abc123==");
  assert.equal(body.messages, undefined);
});

test("buildChatParseBody creates chat completions parse payload", () => {
  const body = buildChatParseBody("mistral-document-ai-2512", "abc123==");
  const messages = body.messages as
    | Array<{
      role?: string;
      content?: unknown;
    }>
    | undefined;

  assert.ok(Array.isArray(messages));
  assert.equal(messages?.length, 2);
  assert.equal(messages?.[0]?.role, "system");
  assert.equal(messages?.[1]?.role, "user");

  const userContent = messages?.[1]?.content as Array<Record<string, unknown>> | undefined;
  assert.ok(Array.isArray(userContent));
  const documentPart = userContent?.find((part) => part.type === "document_url");
  const documentUrl = documentPart?.document_url as { url?: string } | undefined;
  assert.equal(documentUrl?.url, "data:application/pdf;base64,abc123==");
});

test("extractImageToTextContent joins markdown/text pages", () => {
  const content = extractImageToTextContent({
    pages: [
      { markdown: "# Page 1" },
      { text: "Page 2 text" },
      {},
    ],
  });

  assert.equal(content, "# Page 1\n\nPage 2 text");
});

test("sanitizeProviderErrorText redacts embedded PDF base64", () => {
  const message =
    "Azure failed: data:application/pdf;base64,JVBERi0xLjMKJcTl8uXrp/Og0MTGCjMgMCBvYmo= end";
  const sanitized = sanitizeProviderErrorText(message);

  assert.ok(!sanitized.includes("JVBERi0xLjMKJcTl8uXrp/Og0MTGCjMgMCBvYmo="));
  assert.ok(sanitized.includes("data:application/pdf;base64,[REDACTED]"));
});

test("sanitizeProviderErrorText truncates oversized payloads", () => {
  const sanitized = sanitizeProviderErrorText("x".repeat(200), 40);
  assert.ok(sanitized.includes("[truncated"));
});

test("shouldUseImageToTextForParse returns true for ocr invokePath even with chat style", () => {
  const useOcr = shouldUseImageToTextForParse({
    apiStyle: "AZURE_CHAT_COMPLETIONS",
    authStyle: "API_KEY",
    deploymentName: "mistral-document-ai-2512",
    baseUrl: "https://example.services.ai.azure.com",
    invokePath: "/v1/ocr",
  });

  assert.equal(useOcr, true);
});

test("shouldRetryParseWithImageToText detects missing body.document errors", () => {
  const retry = shouldRetryParseWithImageToText(
    new Error(
      "Azure AI Foundry parse failed (422): {\"details\":[{\"loc\":[\"body\",\"document\"],\"msg\":\"Field required\"}]}"
    )
  );

  assert.equal(retry, true);
});

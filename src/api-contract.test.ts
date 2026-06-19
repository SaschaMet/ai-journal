import { describe, expect, test } from "bun:test";
import {
  isLocalhostModelBaseUrl,
  localModelBaseUrlSchema,
  postEntriesRequestSchema,
} from "./api-contract";

describe("API contract validation", () => {
  test("accepts only loopback local model base URLs", () => {
    expect(isLocalhostModelBaseUrl("http://localhost:11434")).toBe(true);
    expect(isLocalhostModelBaseUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLocalhostModelBaseUrl("http://127.0.0.1:1234/v1")).toBe(true);
    expect(localModelBaseUrlSchema.safeParse("https://example.com/v1").success).toBe(false);
  });

  test("rejects guided prompts in free entries", () => {
    const parsed = postEntriesRequestSchema.safeParse({
      content: "Today I noticed a pattern.",
      mode: "free",
      guidingPrompts: ["What happened?"],
    });

    expect(parsed.success).toBe(false);
  });
});

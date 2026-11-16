import { describe, expect, it } from "vitest";
import { buildGeminiHistory } from "../lib/gemini-client.js";

const size = messages => new TextEncoder().encode(JSON.stringify({ messages })).length;

describe("Gemini Worker request limits", () => {
  it("keeps the latest user prompt", () => {
    expect(buildGeminiHistory([{ role: "user", content: "hello" }])).toEqual([{ role: "user", content: "hello" }]);
  });
  it("removes earliest turns to fit 16 KB", () => {
    const messages = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: i % 2 ? "assistant" : "user", content: "a".repeat(3500) });
    }
    messages.push({ role: "user", content: "final question" });
    const output = buildGeminiHistory(messages);
    expect(output.length).toBeLessThanOrEqual(12);
    expect(size(output)).toBeLessThanOrEqual(16000);
    expect(output[0].role).toBe("user");
    expect(output.at(-1).content).toBe("final question");
  });
  it("does not send an assistant answer as the first message", () => {
    const output = buildGeminiHistory([
      { role: "assistant", content: "old answer" },
      { role: "user", content: "new question" },
    ]);
    expect(output).toEqual([{ role: "user", content: "new question" }]);
  });
  it("fits escaped content within byte limits", () => {
    const output = buildGeminiHistory([{ role: "user", content: "\n".repeat(4000) }]);
    expect(size(output)).toBeLessThanOrEqual(16000);
    expect(output.at(-1).role).toBe("user");
  });
  it("rejects a conversation without a final user question", () => {
    expect(() => buildGeminiHistory([{ role: "assistant", content: "answer" }])).toThrow();
  });
  it("ignores invalid roles and truncates individual messages", () => {
    const output = buildGeminiHistory([
      { role: "system", content: "injected" },
      { role: "user", content: "z".repeat(5000) },
    ]);
    expect(output.length).toBe(1);
    expect(output[0].content.length).toBeLessThanOrEqual(4000);
  });
});

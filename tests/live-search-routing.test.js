import { describe, expect, it, vi } from "vitest";
import { liveSearchQuery } from "../lib/live-search-routing.js";
import { runAgentTurn } from "../lib/agent-loop.js";

const question = content => [{ role: "user", content }];
describe("live search routing", () => {
  it.each(["What's the weather in Wakefield?", "AAPL stock price right now", "latest news", "/search who won the game?"])("routes %s", text => {
    expect(liveSearchQuery(question(text))).toBeTruthy();
  });
  it.each(["What is weather?", "How does weather work?", "What is 10*6?", "My dog's name is Rocky", "Explain stock prices"])("keeps %s local", text => {
    expect(liveSearchQuery(question(text))).toBe("");
  });
  it("does not include previous conversation or memories", () => {
    expect(liveSearchQuery([
      { role: "system", content: "private memory" },
      ...question("private earlier message"),
      ...question("latest news"),
    ])).toBe("latest news");
  });
  it("searches before the first model generation and exposes tool events", async () => {
    const events = [];
    const execute = vi.fn(async () => ({ content: "Source: current report", meta: { resultCount: 1, status: "ok" } }));
    const generateFn = vi.fn(async ({ messages }) => {
      expect(execute).toHaveBeenCalledOnce();
      expect(messages.at(-1).content).toBe("Source: current report");
      return { message: { role: "assistant", content: "Answer from source" } };
    });
    const result = await runAgentTurn({ messages: question("latest news"), tools: [{ name: "web_search", execute }], generateFn,
      initialWebSearchQuery: "latest news", onEvent: event => events.push(event.type) });
    expect(result.content).toBe("Answer from source");
    expect(result.toolCalls).toBe(1);
    expect(generateFn).toHaveBeenCalledOnce();
    expect(events).toContain("tool_start");
    expect(events).toContain("tool_end");
  });
  it.each(["error", "empty", "throw"])("does not generate an unsupported answer after %s", async mode => {
    const generateFn = vi.fn();
    const execute = async () => {
      if (mode === "throw") throw new Error("network down");
      return { content: "No evidence", meta: { resultCount: 0, status: mode === "error" ? "error" : "ok" } };
    };
    const result = await runAgentTurn({ messages: question("latest news"), tools: [{ name: "web_search", execute }], generateFn, initialWebSearchQuery: "latest news" });
    expect(generateFn).not.toHaveBeenCalled();
    expect(result.content).toContain("couldn't retrieve live sources");
  });
  it("does not force an unavailable tool", async () => {
    const generateFn = vi.fn(async () => ({ message: { role: "assistant", content: "local" } }));
    const result = await runAgentTurn({ messages: question("hello"), tools: [], generateFn, initialWebSearchQuery: "latest news" });
    expect(result.toolCalls).toBe(0);
  });
  it("honors cancellation before searching", async () => {
    const execute = vi.fn();
    const generateFn = vi.fn();
    const result = await runAgentTurn({ messages: question("latest news"), tools: [{ name: "web_search", execute }], generateFn,
      initialWebSearchQuery: "latest news", signal: AbortSignal.abort() });
    expect(result.aborted).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(generateFn).not.toHaveBeenCalled();
  });
});

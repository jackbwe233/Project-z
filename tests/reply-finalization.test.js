import { describe, expect, it } from "vitest";
import { finalizeChatReply } from "../lib/reply-finalization.js";

describe("Project Z reply finalization", () => {
  it("preserves a complete normal answer", () => {
    expect(finalizeChatReply({ output: "The answer is 60.", raw: "The answer is 60." })).toBe("The answer is 60.");
  });
  it("does not expose thinking when the model produced no answer", () => {
    const text = finalizeChatReply({ thinking: "internal thoughts", raw: "internal thoughts" });
    expect(text).toContain("didn't produce an answer");
    expect(text).not.toContain("internal thoughts");
  });
  it("clearly identifies incomplete output after an error", () => {
    const text = finalizeChatReply({ output: "The first part", error: "GPU device lost" });
    expect(text).toContain("The first part");
    expect(text).toContain("may be incomplete");
  });
  it("shows an actionable message for empty errors", () => {
    const text = finalizeChatReply({ error: "GPU device lost" });
    expect(text).toContain("reload the model");
    expect(text).not.toContain("GPU device lost");
  });
  it("preserves partial output but marks stopped replies", () => {
    expect(finalizeChatReply({ output: "Partial", aborted: true })).toContain("Stopped before completion");
    expect(finalizeChatReply({ aborted: true })).toContain("Stopped");
  });
});

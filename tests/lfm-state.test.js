import { expect, it } from "vitest";
import { withFreshLfmState } from "../lib/lfm-adapter.js";

it("rebuilds from all supplied messages and clears partial GPU state after failure", async () => {
  let cache = "old weather reply";
  const received = [];
  const model = withFreshLfmState({
    reset() { cache = ""; },
    async *generate(messages) {
      expect(cache).toBe("");
      received.push(structuredClone(messages));
      cache = "partially advanced";
      if (received.length === 1) throw new Error("map async was not successful");
      yield { text: "Rocky" };
    },
  });
  const messages = [
    { role: "user", content: "My dogs name is rocky" },
    { role: "user", content: "Whats my dogs name" },
  ];
  await expect(async () => {
    for await (const chunk of model.generate(messages)) void chunk;
  }).rejects.toThrow("map async");
  expect(cache).toBe("");
  const chunks = [];
  for await (const chunk of model.generate(messages)) chunks.push(chunk);
  expect(received).toEqual([messages, messages]);
  expect(chunks).toEqual([{ text: "Rocky" }]);
  expect(cache).toBe("");
});

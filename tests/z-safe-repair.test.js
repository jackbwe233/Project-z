import { describe, expect, it } from "vitest";
import { recoverLinks } from "../scripts/z-safe-repair.mjs";

describe("strict automatic HTML link repair", () => {
  const known = ["index.html", "music.html", "paper.html", "music.js", "z-logo.png", "account.html"];
  it("repairs unique missing extensions and case typos without touching query strings", () => {
    const input = '<a href="./Music.html">Music</a><a href="./paper?foo=1">Paper</a>';
    const x = recoverLinks(input, "index.html", known);
    expect(x.fixed).toContain('href="./music.html"');
    expect(x.fixed).toContain('href="./paper.html?foo=1"');
    expect(x.changes).toBe(2);
  });
  it("does not rewrite remote URLs, credentials, or ambiguous links", () => {
    const input = '<a href="https://example.org/music">External</a><a href="./auth-secret">Auth</a><script src="./paper"></script>';
    const x = recoverLinks(input, "index.html", known);
    expect(x.fixed).toBe(input);
    expect(x.changes).toBe(0);
  });
  it("does not rewrite paths that use traversal", () => {
    const input = '<a href="../config">Config</a><script src="./../../paper"></script>';
    expect(recoverLinks(input,"index.html",known).changes).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { emptyStyle, updateStyle, learnCommunicationStyle, effectiveStyle, buildStyleContext, readStyle, writeStyle } from "../lib/z-style.js";

describe("Z adaptive communication style", () => {
  it("defaults off and never captures text or adapts without consent", () => {
    const s = emptyStyle();
    expect(s.learnEnabled).toBe(false);
    expect(learnCommunicationStyle(s, "yo bro i want a short answer")).toEqual(s);
    expect(buildStyleContext(s)).toBe("");
  });
  it("learns coarse writing style only after opt-in, without storing messages", () => {
    let s = updateStyle(emptyStyle(), { learnEnabled: true });
    for (const m of ["yo bro make it short", "lol quick answer", "idk just the answer", "nah i want it concise", "bro shorter"]) s = learnCommunicationStyle(s, m);
    expect(effectiveStyle(s).tone).toBe("casual");
    expect(effectiveStyle(s).length).toBe("short");
    expect(JSON.stringify(s)).not.toContain("bro");
    expect(buildStyleContext(s)).toContain("brief, direct");
  });
  it("user settings override learned signals and can disable further learning", () => {
    let s = updateStyle(emptyStyle(), { learnEnabled: true });
    for (let i = 0; i < 8; i++) s = learnCommunicationStyle(s, "yo lol keep it short please");
    s = updateStyle(s, { tone: "professional", length: "detailed", explanation: "thorough", learnEnabled: false });
    expect(effectiveStyle(s)).toMatchObject({ tone:"professional", length:"detailed", explanation:"thorough" });
    expect(learnCommunicationStyle(s, "yo yo yo lol")).toEqual(s);
  });
  it("ignores sensitive messages and supports clear/reset", () => {
    const s = updateStyle(emptyStyle(), { learnEnabled: true });
    expect(learnCommunicationStyle(s, "my password is abc123 and i want help")).toEqual(s);
    expect(learnCommunicationStyle(s, "email me at person@example.com")).toEqual(s);
    expect(emptyStyle().samples).toBe(0);
  });
  it("persists to the supplied storage only", () => {
    const data = new Map();
    const storage = { getItem:k=>data.get(k), setItem:(k,v)=>data.set(k,v) };
    const s = updateStyle(emptyStyle(), { tone:"casual", learnEnabled:true });
    expect(writeStyle(storage,s)).toBe(true);
    expect(readStyle(storage)).toEqual(s);
  });
});

import { describe, expect, it } from "vitest";
import { detectBrowser, isIOSDevice } from "../lib/browser.js";

describe("detectBrowser", () => {
  it("classifies common user agents", () => {
    expect(detectBrowser("Mozilla/5.0 Chrome/120.0.0.0")).toBe("chrome");
    expect(detectBrowser("Mozilla/5.0 Edg/120.0.0.0")).toBe("edge");
    expect(detectBrowser("Mozilla/5.0 Firefox/128.0")).toBe("firefox");
    expect(detectBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15"))
      .toBe("safari");
    expect(detectBrowser("CustomBot/1.0")).toBe("other");
  });
});

describe("iPhone/iPad startup safety", () => {
  it("defers GPU-heavy startup on iPhone and iPad browsers", () => {
    expect(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIOSDevice("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 5)).toBe(true);
  });

  it("preserves desktop automatic restoration and ignores Macs without touch", () => {
    expect(isIOSDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe(false);
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 0)).toBe(false);
    expect(isIOSDevice("Mozilla/5.0 (Linux; Android 15) Chrome/130")).toBe(false);
  });
});

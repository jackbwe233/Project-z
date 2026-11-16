import { describe, expect, it } from "vitest";
import { detectBrowser, isIOSDevice, graphicsProbeAttempts, iosStabilityProfile } from "../lib/browser.js";

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

describe("iPhone/iPad safe startup", () => {
  it("defers local GPU startup for iOS devices and iPadOS desktop UAs", () => {
    expect(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIOSDevice("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 5)).toBe(true);
    expect(isIOSDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe(false);
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 0)).toBe(false);
  });
});

describe("graphics probe retry budget", () => {
  it("tries once on iPhone or iPad instead of allocating GPU adapters repeatedly", () => {
    expect(graphicsProbeAttempts("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(1);
    expect(graphicsProbeAttempts("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe(1);
    expect(graphicsProbeAttempts("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 5)).toBe(1);
  });
  it("keeps the single automatic retry for non-iOS desktop environments", () => {
    expect(graphicsProbeAttempts("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe(2);
    expect(graphicsProbeAttempts("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 0)).toBe(2);
  });
});

describe("iPhone memory safety limits", () => {
  it("selects the smallest existing model and constrains GPU context / generation on iOS", () => {
    const iphone = iosStabilityProfile("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)");
    expect(iphone).toEqual({
      modelId: "lfm2",
      maxNewTokens: 192,
      maxContextTokens: 2048,
    });
    expect(iosStabilityProfile("Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)")).toBe(iphone);
    expect(iosStabilityProfile("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 5)).toBe(iphone);
    expect(Object.isFrozen(iphone)).toBe(true);
  });

  it("leaves desktop model choice, context, and output limits alone", () => {
    expect(iosStabilityProfile("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBeNull();
    expect(iosStabilityProfile("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1", 0)).toBeNull();
  });
});

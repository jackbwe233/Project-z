import { describe, expect, it, vi } from "vitest";
import { createGenerationWatchdog } from "../lib/generation-watchdog.js";

describe("generation watchdog", () => {
  it("aborts a silent generation after the timeout", () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const watchdog = createGenerationWatchdog({ timeoutMs: 1000, onTimeout });
      vi.advanceTimersByTime(999);
      expect(onTimeout).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(watchdog.timedOut).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("resets when output arrives and never fires after stopping", () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const watchdog = createGenerationWatchdog({ timeoutMs: 1000, onTimeout });
      vi.advanceTimersByTime(800);
      watchdog.activity();
      vi.advanceTimersByTime(800);
      expect(onTimeout).not.toHaveBeenCalled();
      watchdog.stop();
      vi.advanceTimersByTime(2000);
      expect(onTimeout).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("rejects invalid configurations", () => {
    expect(() => createGenerationWatchdog({ timeoutMs: 0, onTimeout() {} })).toThrow();
    expect(() => createGenerationWatchdog({ timeoutMs: 100, onTimeout: null })).toThrow();
  });
});

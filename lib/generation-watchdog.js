/** Keep a stalled local generation from leaving the chat permanently busy.
 * This is best-effort: an OS-level WebGPU process kill cannot be caught by JS.
 */
export function createGenerationWatchdog({ timeoutMs = 120_000, onTimeout, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!(timeoutMs > 0) || typeof onTimeout !== "function") {
    throw new TypeError("A positive timeout and timeout callback are required");
  }
  let timer = null;
  let stopped = false;
  let timedOut = false;
  const arm = () => {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (stopped) return;
      stopped = true;
      timedOut = true;
      onTimeout();
    }, timeoutMs);
  };
  arm();
  return {
    activity: arm,
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    get timedOut() { return timedOut; },
  };
}

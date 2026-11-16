/** @file Browser detection (UA parsing). */

export function detectBrowser(userAgent = "") {
  const ua = userAgent || "";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Chrome\//i.test(ua) || /CriOS/i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

/** iOS WebKit can terminate the entire page when local GPU models auto-load. */
export function isIOSDevice(userAgent = "", maxTouchPoints = 0) {
  const ua = String(userAgent || "");
  return /iPhone|iPad|iPod/i.test(ua)
    || (/Macintosh/i.test(ua) && Number(maxTouchPoints) > 1);
}

/** Do not automatically repeat expensive GPU initialization on iOS WebKit. */
export function graphicsProbeAttempts(userAgent = "", maxTouchPoints = 0) {
  return isIOSDevice(userAgent, maxTouchPoints) ? 1 : 2;
}

/**
 * Conservative limits for iOS WebKit. Safari may kill the page before JavaScript
 * can catch a WebGPU out-of-memory error. Do not apply these limits on desktop.
 */
const IOS_STABILITY_PROFILE = Object.freeze({
  modelId: "lfm2",
  maxNewTokens: 256,
  maxContextTokens: 4096,
});

/** Permit either compact LFM model on iPhone, not multi-GB desktop models. */
export function isIOSModelAllowed(modelId) {
  return modelId === "lfm2" || modelId === "lfm2_350";
}

export function iosSafeModelId(modelId) {
  return isIOSModelAllowed(modelId) ? modelId : "lfm2";
}

export function iosStabilityProfile(userAgent = "", maxTouchPoints = 0) {
  return isIOSDevice(userAgent, maxTouchPoints) ? IOS_STABILITY_PROFILE : null;
}

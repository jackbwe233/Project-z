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

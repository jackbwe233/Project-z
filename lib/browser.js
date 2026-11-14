/** @file Browser detection (UA parsing). */

export function detectBrowser(userAgent = "") {
  const ua = userAgent || "";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Chrome\//i.test(ua) || /CriOS/i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

/**
 * iOS WebKit (including home-screen apps and in-app browsers) can terminate the
 * entire page under GPU memory pressure. Keep startup read-only and let people
 * explicitly load the local model after their chats have appeared.
 */
export function isIOSDevice(userAgent = "", maxTouchPoints = 0) {
  const ua = String(userAgent || "");
  return /iPhone|iPad|iPod/i.test(ua)
    || (/Macintosh/i.test(ua) && Number(maxTouchPoints) > 1);
}

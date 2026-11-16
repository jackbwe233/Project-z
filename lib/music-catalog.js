/* Two independent public music catalogs. Both requests are bounded so iOS Safari cannot hang forever. */
import { normalizeSong } from "./music-finder.js";

function secureHttps(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

export async function catalogJson(url, { signal, fetchImpl = fetch, timeoutMs = 2500 } = {}) {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  const request = new AbortController();
  let timer;
  let abortHandler;
  const stopped = new Promise((_, reject) => {
    abortHandler = () => {
      request.abort();
      reject(new DOMException("Canceled", "AbortError"));
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      request.abort();
      reject(new Error("Catalog request timed out"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { signal: request.signal, cache: "default" })),
      stopped,
      timeout,
    ]);
    if (!response.ok) throw new Error("Catalog HTTP " + response.status);
    return await Promise.race([response.json(), stopped, timeout]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortHandler);
  }
}

export async function appleSongSearch(term, options = {}) {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("country", "US");
  url.searchParams.set("limit", "35");
  url.searchParams.set("explicit", "No");
  const data = await catalogJson(url, options);
  if (!Array.isArray(data?.results)) throw new Error("Apple catalog returned invalid data");
  return data.results.map(normalizeSong).filter(Boolean).map(song => ({
    ...song, sourceQuery: term, source: "apple",
  }));
}

export function normalizeAudiusSong(raw, term = "") {
  if (!raw || typeof raw !== "object" || !raw.id || raw.is_delete || raw.is_unlisted ||
      raw.is_stream_gated || raw.is_download_gated) return null;
  const id = String(raw.id).trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const title = String(raw.title || "").trim().slice(0, 180);
  const artist = String(raw.user?.name || raw.user?.handle || "").trim().slice(0, 180);
  if (!title || !artist || raw.is_explicit === true) return null;
  const permalink = String(raw.permalink || "");
  const link = permalink.startsWith("/") ? "https://audius.co" + permalink :
    (permalink.startsWith("https://audius.co/") ? permalink : "");
  const art = raw.artwork || {};
  return {
    id: "audius:" + id,
    title,
    artist,
    album: String(raw.album_name || "Audius").slice(0, 180),
    genre: String(raw.genre || "Other").slice(0, 70),
    artwork: secureHttps(art["480x480"] || art["150x150"] || art["1000x1000"]),
    preview: "", // Audius streams are full tracks, not 30-second previews.
    appleUrl: "",
    audiusUrl: secureHttps(link),
    source: "audius",
    sourceQuery: term,
  };
}

export async function audiusSongSearch(term, options = {}) {
  const url = new URL("https://api.audius.co/v1/tracks/search");
  url.searchParams.set("query", term);
  url.searchParams.set("limit", "35");
  const data = await catalogJson(url, options);
  if (!Array.isArray(data?.data)) throw new Error("Audius catalog returned invalid data");
  return data.data.map(song => normalizeAudiusSong(song, term)).filter(Boolean);
}

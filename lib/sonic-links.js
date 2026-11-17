/* Sound DNA link import. A service URL identifies a track, not playable audio.
 * Keep link metadata separate from actual audio-measured DNA. */
import { catalogJson, normalizeAudiusSong } from "./music-catalog.js";

export const SONIC_LINKS_STORAGE_KEY = "z-sonic-links-v1";
const MAX_LINKS = 50;
const songLabel = value => String(value || "").trim().slice(0, 140);

export function parseSonicLink(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.split("/").filter(Boolean);
  if (host === "open.spotify.com" && /^(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})$/.test(path.join("/"))) {
    const id = path[path.length - 1];
    return { provider: "Spotify", id, url: "https://open.spotify.com/track/" + id };
  }
  if (host === "music.apple.com" && path.length >= 2) {
    const id = u.searchParams.get("i") || (/^\d{5,20}$/.test(path[path.length - 1]) ? path[path.length - 1] : "");
    if (/^\d{5,20}$/.test(id)) return { provider: "Apple Music", id, url: u.origin + u.pathname + (u.searchParams.get("i") ? "?i=" + id : "") };
  }
  const youtubeId = host === "youtu.be" ? path[0] :
    (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host) && path[0] === "watch" ? u.searchParams.get("v") : "");
  if (/^[A-Za-z0-9_-]{11}$/.test(youtubeId || "")) return { provider: "YouTube", id: youtubeId, url: "https://www.youtube.com/watch?v=" + youtubeId };
  if (host === "soundcloud.com" && path.length >= 2 && !["discover", "you", "stations"].includes(path[0])) {
    return { provider: "SoundCloud", id: path.slice(0, 2).join("/"), url: "https://soundcloud.com/" + path.slice(0, 2).map(encodeURIComponent).join("/") };
  }
  if (host === "audius.co" && path.length >= 2) {
    return { provider: "Audius", id: path.slice(0, 2).join("/"), url: "https://audius.co/" + path.slice(0, 2).map(encodeURIComponent).join("/") };
  }
  return null;
}
export function normalizeSonicLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Map();
  for (const x of raw.slice(-MAX_LINKS)) {
    const link = parseSonicLink(x?.url);
    if (!link || typeof x.id !== "string" || !/^link-[a-zA-Z0-9-]{1,85}$/.test(x.id)) continue;
    seen.set(link.url, { id: x.id, url: link.url, provider: link.provider,
      title: songLabel(x.title) || "Linked track", artist: songLabel(x.artist) || "Unknown artist" });
  }
  return [...seen.values()].slice(-MAX_LINKS);
}
function splitVideoTitle(title) {
  const clean = songLabel(title).replace(/\s*[([]\s*(?:official\s*)?(?:music\s*)?(?:video|audio|visualizer|lyrics?|hd|4k)[^\])]*[\])]\s*$/i, "").trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  return parts.length >= 2 ? { artist: songLabel(parts.shift()), title: songLabel(parts.join(" - ")) } :
    { artist: "Unknown artist", title: clean };
}
async function getMetadata(endpoint, options) {
  return catalogJson(endpoint, { ...options, timeoutMs: 4000 });
}
export async function resolveSonicLink(input, options = {}) {
  const link = parseSonicLink(input);
  if (!link) throw new Error("Paste a Spotify track, Apple Music song, YouTube video, SoundCloud track, or Audius track link.");
  if (link.provider === "Apple Music") {
    const data = await getMetadata("https://itunes.apple.com/lookup?id=" + link.id + "&entity=song", options);
    const song = (data?.results || []).find(x => x.wrapperType === "track" && x.kind === "song" && String(x.trackId) === link.id);
    if (!song) throw new Error("That Apple Music link did not resolve to a song.");
    return { ...link, title: songLabel(song.trackName), artist: songLabel(song.artistName) };
  }
  if (link.provider === "Audius") {
    const data = await getMetadata("https://api.audius.co/v1/resolve?url=" + encodeURIComponent(link.url), options);
    const song = normalizeAudiusSong(data?.data);
    if (!song) throw new Error("This Audius link is unavailable or cannot be streamed.");
    return { ...link, title: songLabel(song.title), artist: songLabel(song.artist), audioUrl: song.preview };
  }
  let data;
  if (link.provider === "Spotify") {
    try { data = await getMetadata("https://open.spotify.com/oembed?url=" + encodeURIComponent(link.url), options); }
    catch { data = await getMetadata("https://noembed.com/embed?url=" + encodeURIComponent(link.url), options); }
  } else if (link.provider === "YouTube") {
    data = await getMetadata("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(link.url), options);
  } else {
    data = await getMetadata("https://noembed.com/embed?url=" + encodeURIComponent(link.url), options);
  }
  if (!data || data.error || !songLabel(data.title)) throw new Error("The music service did not provide details for this link.");
  const parsed = splitVideoTitle(data.title);
  const knownAuthor = songLabel(data.author_name);
  const artist = parsed.artist !== "Unknown artist" ? parsed.artist :
    (link.provider === "YouTube" ? "Unknown artist" : (knownAuthor || "Unknown artist"));
  return { ...link, title: parsed.title, artist };
}

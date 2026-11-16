/* Provider connections: explicit consent and user-initiated playlist writes only. */
const SPOTIFY_AUTH_KEY = "z-music-spotify-pkce";
const SPOTIFY_TOKEN_KEY = "z-music-spotify-session";
const SPOTIFY_CLIENT_ID_KEY = "z-music-spotify-client-id-v1";
const API = "https://api.spotify.com/v1";
const SPOTIFY_SCOPES = "playlist-modify-private playlist-modify-public";

function cfg() {
  return typeof window !== "undefined" && window.Z_MUSIC_CONFIG || {};
}

function safeName(s) {
  return String(s || "").trim().slice(0, 80) || "Discovered with Z";
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getSpotifyClientId() {
  // The public Client ID may be deployed by the app owner or supplied on this device.
  // Never ask for or persist a Spotify client secret.
  let local = "";
  try { local = localStorage.getItem(SPOTIFY_CLIENT_ID_KEY) || ""; }
  catch { /* storage unavailable */ }
  return String(local || cfg().spotifyClientId || "").trim();
}

export function setSpotifyClientId(value) {
  const clientId = String(value || "").trim();
  if (!/^[a-zA-Z0-9]{20,80}$/.test(clientId))
    throw new Error("Enter a valid public Spotify app Client ID (not a client secret).");
  try { localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, clientId); }
  catch { throw new Error("This browser could not save the Client ID. Check storage settings."); }
  disconnectSpotify();
  return clientId;
}

function spotifyClientId() {
  const clientId = getSpotifyClientId();
  if (!/^[a-zA-Z0-9]{20,80}$/.test(clientId))
    throw new Error("Spotify setup needed: save an app Client ID and register this page as its redirect URL.");
  return clientId;
}

export function hasSpotifySetup() {
  try { return !!spotifyClientId(); } catch { return false; }
}

export function hasAppleSetup() {
  return /^https:\/\//.test(String(cfg().appleDeveloperTokenEndpoint || ""));
}

export function spotifyIsConnected() {
  try { return !!JSON.parse(sessionStorage.getItem(SPOTIFY_TOKEN_KEY) || "null")?.refresh_token; }
  catch { return false; }
}

export function disconnectSpotify() {
  sessionStorage.removeItem(SPOTIFY_TOKEN_KEY);
  sessionStorage.removeItem(SPOTIFY_AUTH_KEY);
}

export async function connectSpotify() {
  const clientId = spotifyClientId();
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error("Spotify sign-in needs a secure HTTPS connection.");
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(random);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = base64url(crypto.getRandomValues(new Uint8Array(18)));
  const redirectUri = location.origin + location.pathname;
  sessionStorage.setItem(SPOTIFY_AUTH_KEY, JSON.stringify({ verifier, state, redirectUri, at: Date.now() }));
  const params = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES, state, code_challenge_method: "S256", code_challenge: challenge,
  });
  location.assign("https://accounts.spotify.com/authorize?" + params);
}

async function parseResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const description = typeof body.error?.message === "string" ? body.error.message :
      typeof body.error_description === "string" ? body.error_description : "";
    throw new Error("Music provider returned " + res.status + (description ? ": " + description.slice(0, 140) : "") + ".");
  }
  return body;
}

export async function handleSpotifyCallback() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (!code && !error) return false;
  const record = JSON.parse(sessionStorage.getItem(SPOTIFY_AUTH_KEY) || "null");
  url.searchParams.delete("code"); url.searchParams.delete("state"); url.searchParams.delete("error");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  sessionStorage.removeItem(SPOTIFY_AUTH_KEY);
  if (error) throw new Error("Spotify connection was canceled or declined.");
  if (!record || !state || state !== record.state || Date.now() - record.at > 600000)
    throw new Error("Spotify sign-in expired. Try connecting again.");
  const data = await parseResponse(await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: spotifyClientId(), grant_type: "authorization_code",
      code, redirect_uri: record.redirectUri, code_verifier: record.verifier,
    }),
  }));
  sessionStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify({
    access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000 - 60000,
  }));
  return true;
}

async function spotifyToken() {
  const stored = JSON.parse(sessionStorage.getItem(SPOTIFY_TOKEN_KEY) || "null");
  if (!stored?.refresh_token) throw new Error("Connect Spotify from My taste first.");
  if (stored.access_token && Date.now() < stored.expires_at) return stored.access_token;
  const data = await parseResponse(await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: stored.refresh_token,
      client_id: spotifyClientId(),
    }),
  }));
  const updated = {
    access_token: data.access_token, refresh_token: data.refresh_token || stored.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000 - 60000,
  };
  sessionStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify(updated));
  return updated.access_token;
}

async function spotifyRequest(path, { method = "GET", body } = {}) {
  const access = await spotifyToken();
  const res = await fetch(API + path, {
    method, headers: { Authorization: "Bearer " + access, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return parseResponse(res);
}

function words(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
}
export function matchScore(song, candidate) {
  const targetTitle = words(song.title);
  const title = new Set(words(candidate.name || candidate.attributes?.name));
  const artists = words((candidate.artists || []).map(x => x.name).join(" ") || candidate.attributes?.artistName);
  const originalArtist = words(song.artist);
  const titleOverlap = targetTitle.filter(w => title.has(w)).length / (targetTitle.length || 1);
  const artistOverlap = originalArtist.filter(w => artists.includes(w)).length / (originalArtist.length || 1);
  return .62 * titleOverlap + .38 * artistOverlap;
}

async function findSpotifyTrack(song) {
  const q = encodeURIComponent(song.title + " " + song.artist);
  const response = await spotifyRequest("/search?type=track&limit=10&q=" + q);
  const tracks = response.tracks?.items || [];
  const eligible = tracks.filter(x => x?.uri?.startsWith("spotify:track:") && !x.is_local && !x.explicit);
  const best = [...eligible].sort((a, b) => matchScore(song, b) - matchScore(song, a))[0];
  return best && matchScore(song, best) >= .72 ? best.uri : null;
}

export async function createSpotifyPlaylist(songs, name, notify = () => {}) {
  if (!Array.isArray(songs) || !songs.length) throw new Error("Save some songs first.");
  const tracks = [], unmatched = [];
  for (let i = 0; i < songs.length; i++) {
    notify("Matching song " + (i + 1) + " of " + songs.length + " in Spotify…");
    try {
      const uri = await findSpotifyTrack(songs[i]);
      if (uri) tracks.push(uri);
      else unmatched.push(songs[i].title);
    } catch (error) {
      if (/401|403|429/.test(error.message)) throw error;
      unmatched.push(songs[i].title);
    }
  }
  if (!tracks.length) throw new Error("None of these songs could be matched on Spotify. Your Z playlist is still saved.");
  notify("Creating your private Spotify playlist…");
  const created = await spotifyRequest("/me/playlists", {
    method: "POST", body: { name: safeName(name), public: false, description: "Songs discovered with Project Z" },
  });
  if (!created?.id) throw new Error("Spotify did not return a playlist ID.");
  for (let i = 0; i < tracks.length; i += 100) {
    await spotifyRequest("/playlists/" + encodeURIComponent(created.id) + "/items", {
      method: "POST", body: { uris: tracks.slice(i, i + 100) },
    });
  }
  return { url: created.external_urls?.spotify || "https://open.spotify.com/playlist/" + created.id, matched: tracks.length, unmatched: unmatched.length };
}

let appleInstance = null;
let developerToken = "";
async function appleToken() {
  const endpoint = String(cfg().appleDeveloperTokenEndpoint || "");
  if (!hasAppleSetup()) throw new Error("Apple Music is not configured yet. The Z app owner needs to set a secure MusicKit token endpoint.");
  const res = await fetch(endpoint, { credentials: "omit" });
  const data = await parseResponse(res);
  if (!data?.developerToken) throw new Error("Apple developer-token endpoint did not return a token.");
  developerToken = data.developerToken;
  return developerToken;
}
async function loadMusicKit() {
  if (window.MusicKit) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Apple MusicKit. Check your internet connection."));
    document.head.append(script);
  });
}
export async function connectApple() {
  const token = await appleToken();
  await loadMusicKit();
  if (!window.MusicKit) throw new Error("Apple MusicKit failed to load.");
  if (!appleInstance) {
    await window.MusicKit.configure({ developerToken: token, app: { name: "Project Z", build: "1.0.0" } });
    appleInstance = window.MusicKit.getInstance();
  }
  await appleInstance.authorize();
  return !!appleInstance.musicUserToken;
}

export function appleIsConnected() {
  return !!appleInstance?.musicUserToken;
}

async function appleRequest(path, { method = "GET", body } = {}) {
  const userToken = appleInstance?.musicUserToken;
  if (!userToken) throw new Error("Connect Apple Music from My taste first.");
  const res = await fetch("https://api.music.apple.com" + path, {
    method,
    headers: { Authorization: "Bearer " + developerToken, "Music-User-Token": userToken, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return parseResponse(res);
}

async function findAppleTrack(song) {
  const term = encodeURIComponent(song.title + " " + song.artist);
  const resp = await appleRequest("/v1/catalog/us/search?types=songs&limit=10&term=" + term);
  const candidates = resp.results?.songs?.data || [];
  const best = [...candidates].sort((a, b) => matchScore(song, b) - matchScore(song, a))[0];
  return best && matchScore(song, best) >= .72 ? best.id : null;
}

export async function createApplePlaylist(songs, name, notify = () => {}) {
  if (!Array.isArray(songs) || !songs.length) throw new Error("Save some songs first.");
  const ids = [];
  let unmatched = 0;
  for (let i = 0; i < songs.length; i++) {
    notify("Matching song " + (i + 1) + " of " + songs.length + " in Apple Music…");
    try {
      const id = await findAppleTrack(songs[i]);
      if (id) ids.push({ id, type: "songs" }); else unmatched++;
    } catch (error) {
      if (/401|403|429/.test(error.message)) throw error;
      unmatched++;
    }
  }
  if (!ids.length) throw new Error("None of these songs could be matched on Apple Music. Your Z playlist is still saved.");
  notify("Creating your Apple Music playlist…");
  const created = await appleRequest("/v1/me/library/playlists", {
    method: "POST",
    body: {
      attributes: { name: safeName(name), description: "Songs discovered with Project Z" },
      relationships: { tracks: { data: ids.slice(0, 100) } },
    },
  });
  const playlist = created.data?.[0];
  if (!playlist?.id) throw new Error("Apple Music did not return a playlist ID.");
  for (let i = 100; i < ids.length; i += 100) {
    await appleRequest("/v1/me/library/playlists/" + encodeURIComponent(playlist.id) + "/tracks", {
      method: "POST", body: { data: ids.slice(i, i + 100) },
    });
  }
  return { url: "", matched: ids.length, unmatched, id: playlist.id };
}

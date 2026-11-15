/* Browser-independent song discovery logic. Taste data stays on this device. */
export const MUSIC_STORAGE_KEY = "z-music-finder-v1";
const MAX_HISTORY = 750;
const MAX_SAVED = 300;
const MAX_BOOSTS = 50;

function secureUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function normalizeSong(raw) {
  if (!raw || raw.kind !== "song" || !Number.isSafeInteger(Number(raw.trackId))) return null;
  const title = String(raw.trackName || "").trim().slice(0, 180);
  const artist = String(raw.artistName || "").trim().slice(0, 180);
  if (!title || !artist || raw.trackExplicitness === "explicit") return null;
  const artwork = secureUrl(raw.artworkUrl100 || "");
  return {
    id: String(raw.trackId),
    title,
    artist,
    album: String(raw.collectionName || "").trim().slice(0, 180),
    genre: String(raw.primaryGenreName || "Other").trim().slice(0, 70),
    artwork: artwork.replace("100x100bb", "600x600bb"),
    preview: secureUrl(raw.previewUrl || ""),
    appleUrl: secureUrl(raw.trackViewUrl || ""),
  };
}

export function blankMusicProfile() {
  return { version: 1, likes: [], skips: [], skippedSongs: [], seen: [], boosts: [], genre: "All" };
}

const validSong = (song) =>
  song && typeof song.id === "string" && typeof song.title === "string" &&
  typeof song.artist === "string" && typeof song.genre === "string";

export function normalizeMusicProfile(input) {
  const empty = blankMusicProfile();
  if (!input || typeof input !== "object" || Array.isArray(input)) return empty;
  const ids = (value, max) => Array.isArray(value)
    ? [...new Set(value.filter(x => typeof x === "string" && /^\d{1,20}$/.test(x)))].slice(-max)
    : [];
  const likes = Array.isArray(input.likes)
    ? input.likes.filter(validSong).slice(-MAX_SAVED).map(x => ({
      id: x.id.slice(0, 20),
      title: x.title.slice(0, 180),
      artist: x.artist.slice(0, 180),
      album: String(x.album || "").slice(0, 180),
      genre: x.genre.slice(0, 70),
      artwork: secureUrl(x.artwork),
      preview: secureUrl(x.preview),
      appleUrl: secureUrl(x.appleUrl),
    }))
    : [];
  return {
    version: 1,
    likes: [...new Map(likes.map(x => [x.id, x])).values()],
    skips: ids(input.skips, MAX_HISTORY),
    skippedSongs: Array.isArray(input.skippedSongs)
      ? input.skippedSongs.filter(validSong).slice(-MAX_HISTORY).map(song => ({
        id: song.id.slice(0, 20), title: song.title.slice(0, 180),
        artist: song.artist.slice(0, 180), genre: song.genre.slice(0, 70),
      })) : [],
    seen: ids(input.seen, MAX_HISTORY),
    boosts: Array.isArray(input.boosts) ? input.boosts.filter(x => x && typeof x.artist === "string" &&
      typeof x.genre === "string").slice(-MAX_BOOSTS).map(x => ({
      artist: x.artist.slice(0, 180), genre: x.genre.slice(0, 70),
    })) : [],
    genre: typeof input.genre === "string" && input.genre.length < 50 ? input.genre : "All",
  };
}

export function recordMusicAction(input, song, action) {
  const state = normalizeMusicProfile(input);
  if (!validSong(song) || !["like", "skip", "similar"].includes(action)) return state;
  const id = song.id;
  state.seen = [...new Set([...state.seen, id])].slice(-MAX_HISTORY);
  if (action === "like") {
    state.likes = [...state.likes.filter(x => x.id !== id), song].slice(-MAX_SAVED);
    state.skips = state.skips.filter(x => x !== id);
    state.skippedSongs = state.skippedSongs.filter(x => x.id !== id);
  }
  if (action === "skip") {
    if (!state.likes.some(x => x.id === id))
      state.skips = [...new Set([...state.skips, id])].slice(-MAX_HISTORY);
    state.skippedSongs = [...state.skippedSongs.filter(x => x.id !== id), {
      id, title: song.title, artist: song.artist, genre: song.genre,
    }].slice(-MAX_HISTORY);
  }
  if (action === "similar") {
    state.boosts = [...state.boosts, { artist: song.artist, genre: song.genre }].slice(-MAX_BOOSTS);
  }
  return state;
}

export function removeLikedSong(input, id) {
  const state = normalizeMusicProfile(input);
  state.likes = state.likes.filter(x => x.id !== String(id));
  return state;
}

export function rankMusicResults(results, profile, { genre = "All", exclude = [] } = {}) {
  const state = normalizeMusicProfile(profile);
  const excluded = new Set([...state.seen, ...state.likes.map(x => x.id), ...exclude]);
  const seenInBatch = new Set();
  const genreVotes = new Map();
  const artistVotes = new Map();
  const vote = (map, name, n) => map.set(name.toLowerCase(), (map.get(name.toLowerCase()) || 0) + n);
  for (const song of state.likes) {
    vote(genreVotes, song.genre, 1);
    vote(artistVotes, song.artist, 1);
  }
  for (const boost of state.boosts) {
    vote(genreVotes, boost.genre, 0.5);
    vote(artistVotes, boost.artist, 0.5);
  }
  const scored = [];
  for (const raw of results) {
    const song = raw?.id ? raw : normalizeSong(raw);
    if (!song || excluded.has(song.id) || seenInBatch.has(song.id)) continue;
    seenInBatch.add(song.id);
    const score = (genreVotes.get(song.genre.toLowerCase()) || 0) * 3 +
      (artistVotes.get(song.artist.toLowerCase()) || 0) * 5 +
      (genre !== "All" && song.genre.toLowerCase().includes(genre.toLowerCase()) ? 5 : 0);
    scored.push({ song, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.song.id.localeCompare(b.song.id)).map(x => x.song);
}

export function musicTasteSummary(input) {
  const profile = normalizeMusicProfile(input);
  const counts = (items) => [...items.reduce((map, item) => {
    const k = item.trim();
    if (k) map.set(k, (map.get(k) || 0) + 1);
    return map;
  }, new Map())].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name);
  return {
    likes: profile.likes.length,
    skipped: profile.skips.length,
    genres: counts(profile.likes.map(s => s.genre)),
    artists: counts(profile.likes.map(s => s.artist)),
  };
}

export function musicSearchTerms(input, genre = "All", query = "") {
  const profile = normalizeMusicProfile(input);
  const needle = String(query || "").trim().slice(0, 100);
  if (needle) return [needle];
  const recent = [...profile.likes].reverse();
  const boosted = [...profile.boosts].reverse();
  const terms = [];
  for (const b of boosted.slice(0, 2)) terms.push(b.artist, b.genre);
  for (const song of recent.slice(0, 3)) terms.push(song.artist, song.genre);
  if (genre !== "All") terms.unshift(genre);
  const defaults = ["indie rock", "alternative pop", "hip hop", "electronic music", "r&b", "jazz"];
  return [...new Set([...terms, ...defaults].filter(Boolean).map(x => String(x).trim()))].slice(0, 10);
}

/* Music discovery planner. Uses public song metadata and local swipe feedback,
   never trains a model on third-party streaming service data. */
import { sonicSimilarity, validSonicFeatures } from "./sonic-dna.js";

export const GENRE_SEEDS = Object.freeze({
  All: ["alternative pop", "indie rock", "hip hop", "dream pop", "neo soul", "indie folk"],
  Indie: ["indie rock", "bedroom pop", "dream pop", "indie folk", "shoegaze", "slowcore"],
  "Hip-Hop": ["hip hop", "alternative rap", "cloud rap", "underground hip hop", "melodic rap", "jazz rap"],
  Rock: ["alternative rock", "post rock", "psychedelic rock", "garage rock", "soft rock", "post punk"],
  "R&B": ["neo soul", "alternative r&b", "soul", "indie r&b", "funk soul", "quiet storm"],
  Pop: ["indie pop", "art pop", "synth pop", "dream pop", "electropop", "chamber pop"],
  Electronic: ["ambient electronic", "downtempo", "house", "trip hop", "electronica", "synthwave"],
  Country: ["americana", "alt country", "country folk", "country", "bluegrass", "country rock"],
  Jazz: ["jazz fusion", "nu jazz", "cool jazz", "spiritual jazz", "jazz", "bossa nova"],
});
export const VIBE_SEEDS = Object.freeze({
  any: [],
  dreamy: ["dream pop", "ethereal", "shoegaze", "ambient", "hazy", "slowcore"],
  hype: ["high energy", "upbeat", "dance", "trap", "energetic", "fast"],
  chill: ["mellow", "lofi", "acoustic", "downtempo", "soft", "laid back"],
  sad: ["melancholy", "sad", "slowcore", "emotional", "moody", "heartbreak"],
  nostalgic: ["nostalgic", "retro", "vintage", "soft rock", "old school", "indie folk"],
  underground: ["underground", "independent", "experimental", "alternative", "deep cuts", "indie"],
});

const punctuation = /[^\p{L}\p{N} ]/gu;
function canonical(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(punctuation, " ").replace(/\s+/g, " ").trim();
}
export function genreFamily(value) {
  const v = canonical(value);
  if (!v) return "Other";
  if (/\b(rap|hip hop|trap|drill)\b/.test(v)) return "Hip-Hop";
  if (/\b(r b|soul|funk|motown)\b/.test(v)) return "R&B";
  if (/\b(jazz|bossa nova|bebop)\b/.test(v)) return "Jazz";
  if (/\b(country|americana|bluegrass)\b/.test(v)) return "Country";
  if (/\b(electronic|dance|house|techno|ambient|trance|edm|downtempo)\b/.test(v)) return "Electronic";
  if (/\b(indie|alternative|shoegaze|slowcore|bedroom)\b/.test(v)) return "Indie";
  if (/\b(rock|punk|metal|grunge)\b/.test(v)) return "Rock";
  if (/\b(pop)\b/.test(v)) return "Pop";
  return "Other";
}

function counts(values) {
  const map = new Map();
  values.forEach(value => {
    const k = canonical(value);
    if (k) map.set(k, (map.get(k) || 0) + 1);
  });
  return map;
}

export function discoveryQueries(profile, {
  genre = "All", vibe = "any", exploration = "balanced", cycle = 0, query = "",
} = {}) {
  const requested = String(query || "").trim().slice(0, 100);
  if (requested) return [requested];
  const g = GENRE_SEEDS[genre] || GENRE_SEEDS.All;
  const v = VIBE_SEEDS[vibe] || [];
  const liked = Array.isArray(profile?.likes) ? profile.likes : [];
  const boosted = Array.isArray(profile?.boosts) ? profile.boosts : [];
  const seeds = [];
  const slot = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
  if (v.length) {
    seeds.push(v[cycle % v.length] + (genre !== "All" ? " " + slot(g, cycle) : ""));
    seeds.push(slot(v, cycle + 2));
  }
  if (exploration !== "explore") {
    for (const s of boosted.slice(-3).reverse()) if (s?.artist) seeds.push(s.artist);
    for (const s of liked.slice(-3).reverse()) {
      if (s?.artist) seeds.push(s.artist);
    }
  }
  seeds.push(slot(g, cycle), slot(g, cycle + 2));
  if (exploration === "explore") seeds.push(slot(g, cycle + 3), slot(g, cycle + 4));
  if (genre === "All" && !liked.length && !v.length) seeds.push(slot(GENRE_SEEDS.All, cycle + 4));
  return [...new Set(seeds.filter(Boolean).map(s => s.slice(0, 100)))].slice(0, exploration === "explore" ? 5 : 4);
}

function trackKey(song) { return canonical(song?.artist) + "|" + canonical(song?.title); }
function shuffleTie(song, cycle) {
  const text = trackKey(song) + "|" + cycle;
  let h=2166136261;
  for (let i=0;i<text.length;i++) { h ^= text.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0)/4294967295;
}
function valid(song) {
  return !!(song && typeof song.id === "string" && song.title && song.artist && song.genre);
}
function relatedGenre(requested, actual) {
  return requested === actual ||
    ((requested === "Indie" || requested === "Rock") && (actual === "Indie" || actual === "Rock"));
}

export function smartRankSongs(rawSongs, profile, {
  genre = "All", vibe = "any", exploration = "balanced", cycle = 0,
  sonicLibrary = [], referenceSonic = null,
} = {}) {
  const likes = Array.isArray(profile?.likes) ? profile.likes : [];
  const skips = Array.isArray(profile?.skippedSongs) ? profile.skippedSongs : [];
  const seen = new Set([
    ...(Array.isArray(profile?.seen) ? profile.seen : []),
    ...likes.map(s => s.id),
  ]);
  const likeArtists = counts(likes.map(x => x.artist));
  const likeGenres = counts(likes.map(x => genreFamily(x.genre)));
  const boostArtists = counts((profile?.boosts || []).map(x => x.artist));
  const avoidArtists = counts(skips.map(x => x.artist));
  const avoidGenres = counts(skips.map(x => genreFamily(x.genre)));
  const cached = [], already = new Set();
  const fingerprints = new Map(Array.isArray(sonicLibrary)
    ? sonicLibrary.filter(s => s && validSonicFeatures(s.features)).map(s => [trackKey(s), s.features])
    : []);

  for (const s of rawSongs) {
    if (!valid(s) || seen.has(s.id)) continue;
    const signature = canonical(s.artist) + "|" + canonical(s.title.replace(/\\s*\\((?:remaster|deluxe|live|radio edit|reissue)[^)]*\\)/gi, ""));
    if (already.has(signature)) continue;
    already.add(signature);
    const family = genreFamily(s.genre);
    const artist = canonical(s.artist);
    const artistLikes = likeArtists.get(artist) || 0;
    const artistBoosts = boostArtists.get(artist) || 0;
    const artistSkips = avoidArtists.get(artist) || 0;
    const genreLikes = likeGenres.get(canonical(family)) || 0;
    const genreSkips = avoidGenres.get(canonical(family)) || 0;
    const query = canonical(s.sourceQuery);
    const artistQuery = !!query && (query === artist ||
      (artist.length >= 5 && query.includes(artist)));
    // A catalog's search result is not proof of genre or audio similarity.
    // Reject objectively mismatched category tags rather than padding the feed.
    if (genre !== "All" && !relatedGenre(genre, family) &&
        !(family === "Other" && (artistLikes || artistBoosts || artistQuery))) continue;
    const queryGenre = genreFamily(query);
    if (genre === "All" && query && queryGenre !== "Other" && family !== "Other" &&
        !relatedGenre(queryGenre, family) && !(queryGenre === "Pop" && family === "Indie") &&
        !(queryGenre === "Indie" && family === "Pop") && !artistQuery && !artistLikes) continue;
    // Repeated skips must have a real consequence for recommendations.
    if (artistSkips >= 3 && !artistLikes && !artistQuery) continue;

    let score = genre !== "All" && relatedGenre(genre, family) ? 14 : 0;
    score += Math.min(5, genreLikes) * 2;
    score += Math.min(3, artistLikes) * (exploration === "explore" ? -3 : exploration === "familiar" ? 12 : 7);
    score += Math.min(3, artistBoosts) * (exploration === "explore" ? 1 : 8);
    score -= Math.min(4, artistSkips) * 6;
    score -= Math.min(3, genreSkips) * 0.7;
    if (exploration === "explore" && !artistLikes && !artistBoosts) score += 6;
    if (exploration === "familiar" && (artistLikes || artistBoosts)) score += 6;
    if (/\\b(karaoke|tribute|instrumental cover|sped up|nightcore|8d audio)\\b/i.test(s.title)) score -= 20;

    if (artistQuery) score += 11;
    else if (query && genreFamily(query) !== "Other" && relatedGenre(genreFamily(query), family)) score += 4;
    if (vibe !== "any" && query) {
      const matchingTag = (VIBE_SEEDS[vibe] || []).some(v => query.includes(canonical(v)));
      if (matchingTag) score += 3; // Search intent, not a claim to have heard the audio.
    }
    // Rank using measured sound only for tracks explicitly analyzed by the listener.
    const measured = fingerprints.get(trackKey(s));
    if (measured && validSonicFeatures(referenceSonic?.features)) {
      const similarity = sonicSimilarity(referenceSonic.features, measured);
      if (similarity !== null) score += similarity * 0.4;
    }
    cached.push({ song:s, score, artist, tie:shuffleTie(s, cycle) });
  }
  cached.sort((a, b) => b.score - a.score || a.tie - b.tie);
  const result = [];
  const artistCount = new Map();
  // Spread artists through the feed, especially when multiple searches hit one artist.
  while (cached.length && result.length < 200) {
    let pick = 0, topScore = -Infinity;
    for (let i = 0; i < cached.length; i++) {
      const item = cached[i];
      const n = artistCount.get(item.artist) || 0;
      const adjacent = result.length && canonical(result[result.length - 1].artist) === item.artist;
      const adjusted = item.score - n * (exploration === "familiar" ? 5 : 15) - (adjacent ? 10 : 0);
      if (adjusted > topScore) { topScore = adjusted; pick = i; }
    }
    const chosen = cached.splice(pick, 1)[0];
    artistCount.set(chosen.artist, (artistCount.get(chosen.artist) || 0) + 1);
    result.push(chosen.song);
  }
  return result;
}

export function reasonForSong(song, profile, { genre = "All", exploration = "balanced" } = {}) {
  if (!valid(song)) return "";
  const likes = Array.isArray(profile?.likes) ? profile.likes : [];
  const sameArtist = likes.find(x => canonical(x.artist) === canonical(song.artist));
  if (sameArtist) return "artist connection · actual audio not analyzed";
  const family = genreFamily(song.genre);
  const sameGenre = likes.find(x => genreFamily(x.genre) === family);
  if (sameGenre) return "Related " + family + " catalog tag · audio not analyzed";
  if (genre !== "All" && genreFamily(genre) === family) return "Matches " + genre + " catalog tag · audio not analyzed";
  if (exploration === "explore") return "different artist to explore · audio not analyzed";
  return "Catalog discovery · audio not analyzed";
}

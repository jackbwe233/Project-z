import { MUSIC_STORAGE_KEY, blankMusicProfile, normalizeMusicProfile, recordMusicAction, removeLikedSong, musicTasteSummary } from "./lib/music-finder.js";
import { SONIC_STORAGE_KEY, MAX_SONIC_TRACKS, analyzeSonicSamples, normalizeSonicLibrary, rankSonicLibrary, sonicMoodHints, sonicSimilarity, sonicReasons, normalizeFeelings, parseLocalTrackName } from "./lib/sonic-dna.js";
import { connectSpotify, handleSpotifyCallback, spotifyIsConnected, disconnectSpotify, hasSpotifySetup, getSpotifyClientId, setSpotifyClientId, createSpotifyPlaylist, connectApple, appleIsConnected, createApplePlaylist } from "./lib/music-providers.js";
import { discoveryQueries, smartRankSongs, reasonForSong, genreFamily } from "./lib/music-intelligence.js";
import { appleSongSearch, audiusSongSearch } from "./lib/music-catalog.js";

const $ = id => document.getElementById(id);
const card = $("swipe-card");
const audio = $("music-audio");
let profile;
try { profile = normalizeMusicProfile(JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY) || "null")); }
catch { profile = blankMusicProfile(); }
let genre = profile.genre || "All", vibe = "any", exploration = "balanced", queue = [], current = null, loadCycle = 0, sequence = 0, exporting = false, gesture = null;
let controller = null;
let filterTimer = null;
const sessionRecommended = new Set();
function scheduleFilterLoad() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => { filterTimer = null; void loadSongs(); }, 260);
}
let sonicLibrary = [];
try { sonicLibrary = normalizeSonicLibrary(JSON.parse(localStorage.getItem(SONIC_STORAGE_KEY) || "[]")); }
catch { sonicLibrary = []; }
const SONIC_SELECTED_KEY = "z-sonic-selected-v1";
let selectedSonicId = null, sonicBusy = false;
try { selectedSonicId = localStorage.getItem(SONIC_SELECTED_KEY); } catch { /* private browsing may block storage */ }

const actions = [$("skip-song"), $("like-song"), $("similar-song")];
function status(s) { $("discovery-status").textContent = s; }
function playlistStatus(s) { $("playlist-status").textContent = s; }
function connectionStatus(s) { $("connection-help").textContent = s; }
function persist() {
  profile.genre = genre;
  try { localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(profile)); }
  catch { status("Your browser could not save music preferences."); }
  $("saved-count").textContent = profile.likes.length;
}
function evidenceForSong(song) {
  const ref=sonicLibrary.find(item => item.id===selectedSonicId);
  const identity=value=>String(value || "").trim().toLowerCase();
  const measured=sonicLibrary.find(item => identity(item.artist)===identity(song.artist) && identity(item.title)===identity(song.title));
  if (ref && measured) {
    const score=sonicSimilarity(ref.features,measured.features);
    const factors=sonicReasons(ref.features,measured.features);
    return "Measured Sound DNA match: " + score + "% · " + factors.slice(0,2).join(" & ");
  }
  return reasonForSong(song, profile, { genre, exploration });
}
function placeholder() {
  const s = document.createElement("span");
  s.className = "art-placeholder";
  s.textContent = "Z";
  return s;
}
function playLabel(song = current) { return song?.source === "audius" ? "▶ Play track" : "▶ Preview"; }
function display(song) {
  current = song || null;
  if (song) {
    sessionRecommended.add(song.id);
    if (sessionRecommended.size > 750) sessionRecommended.delete(sessionRecommended.values().next().value);
  }
  audio.pause();
  if (audio.getAttribute("src")) {
    audio.removeAttribute("src");
    audio.load(); // Only reset playback when a clip was actually loaded.
  }
  $("preview-button").textContent = playLabel(song);
  $("preview-button").disabled = !song?.preview;
  $("preview-note").textContent = !song?.preview ? "No playable audio for this song" :
    song.source === "audius" ? "Listen to the track on Audius" : "Listen to a short preview";
  const art = $("card-art");
  art.replaceChildren();
  if (song?.artwork) {
    const img = document.createElement("img");
    img.src = song.artwork;
    img.alt = "Cover art for " + song.title;
    img.loading = "eager";
    img.onerror = () => art.replaceChildren(placeholder());
    art.append(img);
  } else art.append(placeholder());
  $("card-genre").textContent = song?.genre || "DISCOVER";
  $("card-title").textContent = song?.title || "Find your sound";
  $("card-artist").textContent = song?.artist || "Pick a genre, vibe, or search an artist.";
  $("card-album").textContent = song?.album || "Your next favorite is out there.";
  $("card-reason").textContent = song ? evidenceForSong(song) : "Explore music by genre and mood.";
  const storeLink = $("apple-store-link");
  storeLink.hidden = !song?.appleUrl;
  if (song?.appleUrl) storeLink.href = song.appleUrl; else storeLink.removeAttribute("href");
  for (const [id, url] of [
    ["spotify-song-link", song ? "https://open.spotify.com/search/" + encodeURIComponent(song.title + " " + song.artist) : ""],
    ["soundcloud-song-link", song ? "https://soundcloud.com/search?q=" + encodeURIComponent(song.title + " " + song.artist) : ""],
  ]) {
    const link = $(id);
    if (!link) continue;
    link.hidden = !song;
    if (song) link.href = url; else link.removeAttribute("href");
  }
  const audiusLink = $("audius-song-link");
  if (audiusLink) {
    audiusLink.hidden = !song?.audiusUrl;
    if (song?.audiusUrl) audiusLink.href = song.audiusUrl;
    else audiusLink.removeAttribute("href");
  }
  actions.forEach(button => { button.disabled = !song; });
  $("discovery-count").textContent = song ? (queue.length + 1) + " SONGS TO EXPLORE" : "DISCOVER";
  card.classList.remove("out", "dragging");
  card.style.transform = "";
  card.style.opacity = "";
  card.querySelectorAll(".swipe-stamp").forEach(x => { x.style.opacity = "0"; });
}
function nextSong() {
  if (queue.length) {
    display(queue.shift());
    status(current?.source === "audius" ? "Discovering with Audius while Apple's catalog is unavailable." : "");
  }
  else { display(null); loadSongs(); }
}
function makeChoice(action) {
  if (!current || card.classList.contains("out")) return;
  const song = current;
  profile = recordMusicAction(profile, song, action);
  persist();
  // Rebuilding hundreds of hidden playlist cards on every swipe freezes iPhones.
  if (!$("music-saved").hidden) renderSaved();
  if (!$("music-taste").hidden) renderTaste();
  if (action === "similar") { queue = []; $("music-search").value = ""; }
  const finish = () => {
    if (action === "similar") loadSongs("", song);
    else nextSong();
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
  card.classList.add("out");
  card.style.transform = action === "skip" ? "translateX(-110%) rotate(-16deg)" :
    action === "like" ? "translateX(110%) rotate(16deg)" : "translateY(-90px)";
  card.style.opacity = "0";
  setTimeout(finish, 215);
}
function terms(query = "", seedSong = null) {
  const sourceFamily = seedSong ? genreFamily(seedSong.genre) : genre;
  const targetGenre = sourceFamily === "Other" ? "All" : sourceFamily;
  const terms = discoveryQueries(profile, {
    genre: targetGenre, vibe, exploration: seedSong ? "balanced" : exploration,
    cycle: loadCycle, query,
  });
  // 'More like this' must actually use the chosen song's artist as its first
  // reference. A genre-only search is not a same-song recommendation.
  if (seedSong?.artist && !query) return [...new Set([seedSong.artist, ...terms])].slice(0, 4);
  return terms;
}
const catalogCache = new Map();
const catalogCalls = [];
let appleCooldownUntil = 0;
async function searchCatalog(term, signal) {
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
  const key = term.trim().toLowerCase();
  const cached = catalogCache.get(key);
  if (cached && Date.now() - cached.at < (cached.source === "apple" ? 12 : 2) * 60 * 1000)
    return cached.songs;
  const now = Date.now();
  while (catalogCalls.length && now - catalogCalls[0] > 60000) catalogCalls.shift();
  let appleFailure = null;
  if (now >= appleCooldownUntil && catalogCalls.length < 12) {
    catalogCalls.push(now);
    try {
      const songs = await appleSongSearch(term, { signal, timeoutMs: 2400 });
      if (songs.length) {
        if (catalogCache.size >= 50) catalogCache.delete(catalogCache.keys().next().value);
        catalogCache.set(key, { at: Date.now(), songs, source: "apple" });
        return songs;
      }
      appleFailure = new Error("No Apple matches");
    } catch (error) {
      if (signal.aborted) throw error;
      appleFailure = error;
      // Do not repeatedly call an already-limited endpoint after HTTP 429.
      if (/HTTP 429|rate limit/i.test(String(error?.message))) appleCooldownUntil = Date.now() + 65000;
    }
  } else {
    appleFailure = new Error("Temporarily rate-limited; retry later");
  }
  try {
    const songs = await audiusSongSearch(term, { signal, timeoutMs: 2400 });
    if (songs.length) {
      if (catalogCache.size >= 50) catalogCache.delete(catalogCache.keys().next().value);
      catalogCache.set(key, { at: Date.now(), songs, source: "audius" });
      return songs;
    }
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Music discovery is unavailable. Apple: " +
      (appleFailure?.message || "No results") + "; Audius: " + (error?.message || "Request failed") + ".");
  }
  throw new Error("Music discovery is unavailable. Apple: " +
    (appleFailure?.message || "No results") + "; Audius returned no results.");
}
async function loadSongs(query = "", seedSong = null) {
  clearTimeout(filterTimer);
  filterTimer = null;
  // Restarting discovery must not be blocked by a previous Safari request.
  controller?.abort();
  const request = new AbortController();
  controller = request;
  const task = ++sequence;
  const selected = terms(query, seedSong);
  loadCycle++;
  queue = [];
  display(null);
  $("music-discover").setAttribute("aria-busy", "true");
  $("start-discovery").disabled = false;
  $("start-discovery").textContent = "↻ Retry discovery";
  $("start-hint").textContent = "Searching now. Tap Retry if you want to restart.";
  status("Searching for songs…");

  // Some iOS WebKit versions leave fetch unresolved even after abort().
  // A separate rejecting watchdog guarantees that the UI returns to Retry.
  let watchdogId;
  const watchdog = new Promise((_, reject) => {
    watchdogId = setTimeout(() => {
      request.abort();
      reject(new Error("Music search timed out. Tap Retry or try another genre."));
    }, 7500);
  });
  const search = async () => {
    const found = [];
    let lastError = null;
    // The first provider batch is not always relevant. Check actual ranked
    // matches, and search a second seed when the batch is narrow or from Audius.
    const selectedGenre = seedSong ? (genreFamily(seedSong.genre) === "Other" ? "All" : genreFamily(seedSong.genre)) : genre;
    const selectedMode = seedSong ? "balanced" : exploration;
    for (const [index, term] of selected.slice(0, 3).entries()) {
      if (task !== sequence || request.signal.aborted) return [];
      try {
        const songs = await searchCatalog(term, request.signal);
        found.push(...songs);
        const usable = smartRankSongs(found, profile, {
          genre: selectedGenre, vibe, exploration: selectedMode,
          cycle: loadCycle, sonicLibrary,
          referenceSonic: sonicLibrary.find(item => item.id===selectedSonicId) || null,
        });
        // A strong Apple batch is quick; otherwise diversify across two searches.
        if (usable.length >= 14 &&
            (songs.some(s => s.source === "apple") || index >= 1)) break;
        // Avoid waiting through three slow catalog fallbacks on an iPhone.
        if (index >= 1 && usable.length) break;
      } catch (error) {
        if (request.signal.aborted) throw error;
        lastError = error;
      }
    }
    if (found.length) return found;
    if (lastError) throw lastError;
    return [];
  };
  try {
    const found = await Promise.race([search(), watchdog]);
    if (task !== sequence) return;
    if (request.signal.aborted) throw new Error("Music search timed out. Tap Retry.");
    if (!found.length) throw new Error("No songs loaded. Check your connection or try a different genre.");
    queue = smartRankSongs(found, { ...profile, seen: [...(profile.seen || []), ...sessionRecommended] }, {
      genre: seedSong ? (genreFamily(seedSong.genre) === "Other" ? "All" : genreFamily(seedSong.genre)) : genre,
      vibe, exploration: seedSong ? "balanced" : exploration,
      cycle: loadCycle, sonicLibrary,
      referenceSonic: sonicLibrary.find(item => item.id===selectedSonicId) || null,
    });
    if (!queue.length) throw new Error("No new songs in this search. Tap Retry or change your genre.");
    display(queue.shift());
    const backup = current?.source === "audius";
    status(backup ? "Apple's song catalog is unavailable. Discovering with Audius instead." : "");
    $("start-discovery").textContent = "↻ New songs";
    $("start-hint").textContent = backup
      ? "Tap Play track to stream from Audius, or swipe to save."
      : "Listen to a preview, then swipe left to skip or right to save.";
  } catch (error) {
    if (task !== sequence) return;
    status(request.signal.aborted ? "Music search timed out. Tap Retry." :
      (error?.message || "Music discovery is unavailable. Tap Retry."));
    $("start-discovery").textContent = "▶ Try again";
    $("start-hint").textContent = "Try again or choose another genre. Your saved songs are safe.";
  } finally {
    clearTimeout(watchdogId);
    if (task === sequence) {
      controller = null;
      $("music-discover").setAttribute("aria-busy", "false");
    }
  }
}

function renderSaved() {
  const list = $("saved-tracks");
  list.replaceChildren();
  if (!profile.likes.length) {
    const li = document.createElement("li");
    li.className = "empty-list";
    li.textContent = "No songs yet. Swipe right on songs you love.";
    list.append(li);
    return;
  }
  for (const song of [...profile.likes].reverse()) {
    const li = document.createElement("li");
    if (song.artwork) {
      const img = document.createElement("img");
      img.src = song.artwork;
      img.alt = "";
      img.loading = "lazy";
      li.append(img);
    }
    const meta = document.createElement("div");
    meta.className = "saved-meta";
    const heading = document.createElement("strong");
    heading.textContent = song.title;
    const sub = document.createElement("small");
    sub.textContent = song.artist;
    meta.append(heading, sub);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + song.title);
    remove.addEventListener("click", () => {
      profile = removeLikedSong(profile, song.id);
      persist(); renderSaved(); renderTaste();
    });
    li.append(meta, remove);
    list.append(li);
  }
}
function renderTaste() {
  const summary = musicTasteSummary(profile);
  const chosenArtists = [...(profile.boosts || [])].reverse().map(x => x.artist).filter(Boolean);
  const displayedArtists = [...new Set([...chosenArtists, ...summary.artists])].slice(0, 4);
  $("taste-likes").textContent = summary.likes;
  $("taste-skips").textContent = summary.skipped;
  for (const [id, names] of [["taste-genres", summary.genres], ["taste-artists", displayedArtists]]) {
    const parent = $(id);
    parent.replaceChildren();
    if (!names.length) { parent.textContent = "Like some songs to discover your favorites."; continue; }
    names.forEach(name => {
      const s = document.createElement("span");
      s.textContent = name;
      parent.append(s);
    });
  }
}

function persistSonic() {
  try { localStorage.setItem(SONIC_STORAGE_KEY, JSON.stringify(sonicLibrary)); }
  catch { $("sonic-status").textContent = "Could not save sound measurements. Check available phone storage."; }
}
function addSonicText(parent, tag, content, className = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = content;
  parent.append(el);
  return el;
}
function renderSonic() {
  const root = $("sonic-library"), matches = $("sonic-results");
  root.replaceChildren(); matches.replaceChildren();
  $("sonic-count").textContent = sonicLibrary.length + (sonicLibrary.length === 1 ? " track" : " tracks");
  if (!sonicLibrary.length) {
    $("sonic-feelings").value = "";
    addSonicText(root,"p","No analyzed songs yet. Add two audio files to compare them.","sonic-empty");
    addSonicText(matches,"p","Upload at least two audio files to find sound-alike matches.","sonic-empty");
    return;
  }
  if (!sonicLibrary.some(x=>x.id===selectedSonicId)) selectedSonicId = sonicLibrary[0].id;
  try { localStorage.setItem(SONIC_SELECTED_KEY, selectedSonicId); } catch { /* optional local persistence */ }
  for (const song of [...sonicLibrary].reverse()) {
    const item=document.createElement("button");
    item.type="button";
    item.className="sonic-track" + (song.id===selectedSonicId ? " selected" : "");
    item.setAttribute("aria-pressed",String(song.id===selectedSonicId));
    addSonicText(item,"strong",song.title);
    addSonicText(item,"small",song.artist);
    item.addEventListener("click",()=>{selectedSonicId=song.id;renderSonic();});
    root.append(item);
  }
  const reference=sonicLibrary.find(x=>x.id===selectedSonicId);
  $("sonic-feelings").value = (reference.feelings || []).join(", ");
  const candidates=rankSonicLibrary(reference,sonicLibrary);
  addSonicText(matches,"h3","Closest sound to " + reference.title);
  const f=reference.features;
  addSonicText(matches,"p",
    "Measured: " + (f.brightness>0.5 ? "bright" : "soft/dark") + " tone · " +
    (f.bass>0.5 ? "bass-forward" : "light low end") + " · " +
    (f.movement>0.5 ? "active texture" : "gentler motion") +
    (f.tempo ? " · rough pulse " + f.tempo + " BPM" : ""),
    "sonic-summary");
  addSonicText(matches,"p","Possible feel: " + sonicMoodHints(f).join(", ") + " (not a measured emotion)","sonic-hints");
  if (!candidates.length) {
    addSonicText(matches,"p","Analyze another track to see real audio-based matches.","sonic-empty");
    return;
  }
  for (const found of candidates.slice(0,10)) {
    const row=document.createElement("div");row.className="sonic-match";
    const details=document.createElement("div");details.className="sonic-match-details";
    addSonicText(details,"strong",found.title + " — " + found.artist);
    addSonicText(details,"small","Similar: " + found.reasons.join(", "));
    if (found.sharedFeelings?.length) addSonicText(details,"small","You felt: " + found.sharedFeelings.join(", "),"sonic-shared-feelings");
    row.append(details);
    addSonicText(row,"span",found.similarity + "%","sonic-match-score");
    matches.append(row);
  }
  addSonicText(matches,"p","These are descriptor similarities in your local library, not a scientific probability that you will like the songs.","sonic-footnote");
}
async function analyzeLocalFiles(input) {
  if (sonicBusy) return;
  const files=Array.from(input.files || []).slice(0,5);
  if (!files.length) return;
  sonicBusy=true; input.disabled=true;
  let added=0;
  const AudioContextType=window.AudioContext || window.webkitAudioContext;
  try {
    if (!AudioContextType) throw new Error("Your browser does not support local sound analysis.");
    for (const file of files) {
      if (file.size > 16 * 1024 * 1024) {
        $("sonic-status").textContent=file.name + " is over the 16 MB limit; choose a shorter audio file.";
        continue;
      }
      $("sonic-status").textContent="Analyzing " + file.name + " (" + (added + 1) + " of " + files.length + ")…";
      // Give Safari a paint opportunity before decoding a potentially large file.
      await new Promise(resolve=>setTimeout(resolve,30));
      let context;
      try {
        context=new AudioContextType();
        const data=await file.arrayBuffer();
        const audioBuffer=await context.decodeAudioData(data);
        if (!audioBuffer || audioBuffer.duration < 1 || audioBuffer.duration > 600)
          throw new Error("Use an audio file between 1 second and 10 minutes.");
        const features=analyzeSonicSamples(audioBuffer.getChannelData(0),audioBuffer.sampleRate);
        const parsed=parseLocalTrackName(file.name);
        const id="local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10);
        sonicLibrary=[...sonicLibrary,{id,...parsed,features}].slice(-MAX_SONIC_TRACKS);
        selectedSonicId=id; added++;
        persistSonic(); renderSonic();
      } catch (error) {
        $("sonic-status").textContent="Could not analyze " + file.name + ": " + (error?.message || "unsupported audio");
      } finally {
        if (context) try { await context.close(); } catch { /* Safari may already close it. */ }
      }
    }
    if (added) $("sonic-status").textContent="Analyzed " + added + " track" + (added===1?"":"s") + ". Tap a track to hear how its sound profile compares.";
  } catch (error) {
    $("sonic-status").textContent=error.message || "Audio analysis isn't available on this device.";
  } finally {
    sonicBusy=false; input.disabled=false; input.value="";
  }
}

function updateConnections() {
  $("spotify-state").textContent = spotifyIsConnected() ? "Connected for this session" : hasSpotifySetup() ? "Ready to connect" : "Setup needed";
  $("apple-state").textContent = appleIsConnected() ? "Connected" : "Not connected";
  $("spotify-connect").textContent = spotifyIsConnected() ? "Disconnect" : "Connect";
  $("apple-connect").textContent = appleIsConnected() ? "Connected" : "Connect";
  $("apple-connect").disabled = appleIsConnected();
}
function showTab(target) {
  for (const key of ["discover", "saved", "taste", "sonic"]) {
    $("tab-" + key).setAttribute("aria-selected", String(target === key));
    $("music-" + key).hidden = target !== key;
  }
  if (target === "saved") renderSaved();
  if (target === "taste") { renderTaste(); updateConnections(); }
  if (target === "sonic") renderSonic();
  if (target !== "discover") { audio.pause(); $("preview-button").textContent = playLabel(); }
}
for (const key of ["discover", "saved", "taste", "sonic"]) $("tab-" + key).addEventListener("click", () => showTab(key));
$("sonic-files").addEventListener("change", event => { void analyzeLocalFiles(event.target); });
$("sonic-save-feelings").addEventListener("click", () => {
  const selected=sonicLibrary.find(item=>item.id===selectedSonicId);
  if (!selected) { $("sonic-status").textContent="Analyze a track before adding feelings."; return; }
  selected.feelings=normalizeFeelings($("sonic-feelings").value);
  persistSonic(); renderSonic();
  $("sonic-status").textContent="Saved your feelings for " + selected.title + ". They now help sort close audio matches.";
});

$("sonic-clear").addEventListener("click", () => {
  if (!confirm("Delete the saved Sound DNA measurements on this device?")) return;
  sonicLibrary=[];selectedSonicId=null;
  try {
    localStorage.removeItem(SONIC_STORAGE_KEY);
    localStorage.removeItem(SONIC_SELECTED_KEY);
  } catch { /* storage may be unavailable */ }
  renderSonic();
  $("sonic-status").textContent="Local Sound DNA measurements cleared.";
});
$("skip-song").addEventListener("click", () => makeChoice("skip"));
$("like-song").addEventListener("click", () => makeChoice("like"));
$("similar-song").addEventListener("click", () => makeChoice("similar"));
$("refresh-songs").addEventListener("click", () => { queue = []; loadSongs(); });
$("start-discovery")?.addEventListener("click", () => {
  $("start-hint").textContent = "Starting music discovery…";
  status("Starting music discovery…");
  void loadSongs($("music-search").value.trim());
});
$("music-search-form").addEventListener("submit", e => { e.preventDefault(); queue = []; loadSongs($("music-search").value.trim()); });
$("preview-button").addEventListener("click", async () => {
  if (!current?.preview) return;
  const requestedSong = current;
  if (audio.paused) {
    if (audio.src !== requestedSong.preview) audio.src = requestedSong.preview;
    try {
      await audio.play();
      if (current === requestedSong) $("preview-button").textContent = "❚❚ Pause";
    } catch {
      if (current !== requestedSong) return;
      $("preview-button").textContent = playLabel();
      $("preview-note").textContent = requestedSong.source === "audius"
        ? "Could not stream here. Use Listen on Audius below."
        : "This preview could not play. Open the song in Apple Music.";
      status("Audio playback failed on this device. You can still save or open the track.");
    }
  } else { audio.pause(); $("preview-button").textContent = playLabel(); }
});
audio.addEventListener("ended", () => { $("preview-button").textContent = playLabel(); });
audio.addEventListener("error", () => {
  $("preview-button").textContent = playLabel();
  if (current?.preview) $("preview-note").textContent = current.source === "audius"
    ? "Stream unavailable here. Try Listen on Audius below."
    : "Preview unavailable. Open the song in Apple Music.";
});
$("seed-artists-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("seed-artists");
  const names = [...new Set(input.value.split(",").map(x => x.trim()).filter(x => x.length >= 2 && x.length <= 80))].slice(0, 5);
  if (!names.length) {
    $("seed-artists-feedback").textContent = "Enter at least one artist, separated by commas.";
    return;
  }
  const chosen = new Set(names.map(x => x.toLowerCase()));
  profile.boosts = [...(profile.boosts || []).filter(x => !chosen.has(x.artist.toLowerCase())),
    ...names.map(artist => ({ artist, genre: "Other" }))].slice(-50);
  persist();
  renderTaste();
  input.value = "";
  $("seed-artists-feedback").textContent = "Saved " + names.length + " favorite artist" + (names.length === 1 ? "" : "s") + ". Z will use them to find music.";
  $("music-search").value = "";
  void loadSongs();
});
for (const button of document.querySelectorAll("[data-genre]")) button.addEventListener("click", () => {
  genre = button.dataset.genre;
  document.querySelectorAll("[data-genre]").forEach(x => x.setAttribute("aria-pressed", String(x === button)));
  $("music-search").value = ""; queue = []; persist(); scheduleFilterLoad();
});
for (const button of document.querySelectorAll("[data-vibe]")) button.addEventListener("click", () => {
  vibe = button.dataset.vibe;
  document.querySelectorAll("[data-vibe]").forEach(x => x.setAttribute("aria-pressed", String(x === button)));
  $("music-search").value = ""; queue = []; scheduleFilterLoad();
});
document.querySelectorAll("[data-genre]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.genre === genre)));
for (const button of document.querySelectorAll("[data-exploration]")) button.addEventListener("click", () => {
  exploration = button.dataset.exploration;
  document.querySelectorAll("[data-exploration]").forEach(x => x.setAttribute("aria-pressed", String(x === button)));
  queue = []; scheduleFilterLoad();
});

card.addEventListener("pointerdown", e => {
  if (!current || e.target.closest("button") || card.classList.contains("out")) return;
  gesture = { x: e.clientX, y: e.clientY, pointer: e.pointerId, horizontal: false };
});
card.addEventListener("pointermove", e => {
  if (!gesture || gesture.pointer !== e.pointerId || !current) return;
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  if (!gesture.horizontal && Math.abs(dx) > 13 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    gesture.horizontal = true; card.classList.add("dragging");
    try { card.setPointerCapture(e.pointerId); } catch { /* optional */ }
  }
  if (!gesture.horizontal) return;
  card.style.transform = "translate(" + dx + "px," + Math.min(0, dy * .25) + "px) rotate(" + (dx / 18) + "deg)";
  card.querySelector(".swipe-stamp-left").style.opacity = String(Math.max(0, Math.min(1, -dx / 95)));
  card.querySelector(".swipe-stamp-right").style.opacity = String(Math.max(0, Math.min(1, dx / 95)));
});
card.addEventListener("pointerup", e => {
  if (!gesture || gesture.pointer !== e.pointerId) return;
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  const horizontal = gesture.horizontal;
  gesture = null; card.classList.remove("dragging");
  card.style.transform = "";
  card.querySelectorAll(".swipe-stamp").forEach(s => { s.style.opacity = "0"; });
  if (horizontal && dx > 78) makeChoice("like");
  else if (horizontal && dx < -78) makeChoice("skip");
  else if (dy < -85 && Math.abs(dx) < 65) makeChoice("similar");
});
card.addEventListener("pointercancel", () => { gesture = null; card.classList.remove("dragging"); card.style.transform = ""; });
document.addEventListener("keydown", e => {
  if (document.activeElement?.closest("input,button,textarea,select") || $("music-discover").hidden) return;
  if (e.key === "ArrowLeft") makeChoice("skip");
  if (e.key === "ArrowRight") makeChoice("like");
  if (e.key === "ArrowUp") makeChoice("similar");
});

function csv(s) { return '"' + String(s || "").replace(/"/g, '""') + '"'; }
$("csv-export").addEventListener("click", () => {
  if (!profile.likes.length) { playlistStatus("Save some songs first."); return; }
  const rows = [["Title", "Artist", "Album", "Genre", "Apple Music link"].map(csv).join(",")];
  for (const song of profile.likes) rows.push([song.title, song.artist, song.album, song.genre, song.appleUrl].map(csv).join(","));
  const url = URL.createObjectURL(new Blob([rows.join("\r\n")], { type:"text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "z-music-playlist.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  playlistStatus("Exported your song list.");
});
$("save-spotify-client-id").addEventListener("click", () => {
  try {
    setSpotifyClientId($("spotify-client-id").value);
    updateConnections();
    connectionStatus("Spotify app ID saved on this device. Tap Connect to authorize your Spotify account.");
  } catch (error) { connectionStatus(error.message); }
});
$("spotify-connect").addEventListener("click", async () => {
  if (spotifyIsConnected()) { disconnectSpotify(); updateConnections(); connectionStatus("Spotify disconnected from this session."); return; }
  if (!hasSpotifySetup()) {
    $("spotify-setup").open = true;
    $("spotify-client-id").focus();
    connectionStatus("First, add a Spotify app Client ID below, then tap Connect.");
    return;
  }
  try { connectionStatus("Opening secure Spotify sign-in…"); await connectSpotify(); }
  catch (e) { connectionStatus(e.message); }
});
$("apple-connect").addEventListener("click", async () => {
  try { connectionStatus("Connecting Apple Music…"); await connectApple(); connectionStatus("Apple Music connected."); updateConnections(); }
  catch (e) { connectionStatus(e.message); }
});
async function sendPlaylist(service) {
  if (exporting) return;
  if (!profile.likes.length) { playlistStatus("Save some songs with the heart first."); return; }
  if (service === "spotify" && !spotifyIsConnected()) { showTab("taste"); connectionStatus("Connect Spotify first."); return; }
  if (service === "apple" && !appleIsConnected()) { showTab("taste"); connectionStatus("Connect Apple Music first."); return; }
  exporting = true;
  $("spotify-export").disabled = $("apple-export").disabled = true;
  playlistStatus("Matching your saved songs…");
  try {
    const result = service === "spotify" ?
      await createSpotifyPlaylist(profile.likes, $("playlist-name").value, playlistStatus) :
      await createApplePlaylist(profile.likes, $("playlist-name").value, playlistStatus);
    const output = $("playlist-status");
    output.replaceChildren();
    output.append(document.createTextNode("Playlist created with " + result.matched + " songs. " + (result.unmatched ? result.unmatched + " were not matched. " : "")));
    if (result.url) {
      const a = document.createElement("a");
      a.href = result.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "Open playlist ↗"; output.append(a);
    }
  } catch (e) { playlistStatus("Playlist could not be fully exported: " + (e.message || "Unknown error")); }
  finally { exporting = false; $("spotify-export").disabled = $("apple-export").disabled = false; }
}
$("spotify-export").addEventListener("click", () => sendPlaylist("spotify"));
$("apple-export").addEventListener("click", () => sendPlaylist("apple"));
$("clear-music").addEventListener("click", () => {
  if (!confirm("Clear all likes, skips, and saved tracks on this device?")) return;
  localStorage.removeItem(MUSIC_STORAGE_KEY); profile = blankMusicProfile(); genre = "All"; vibe = "any";
  $("music-search").value = "";
  document.querySelectorAll("[data-genre]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.genre === genre)));
  document.querySelectorAll("[data-vibe]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.vibe === vibe)));
  persist(); renderSaved(); renderTaste(); queue = []; loadSongs();
  connectionStatus("Your music preferences were cleared.");
});
async function init() {
  persist(); renderSaved(); renderTaste(); renderSonic(); updateConnections();
  $("spotify-client-id").value = getSpotifyClientId();
  $("spotify-redirect-uri").textContent = location.origin + location.pathname;
  window.__Z_MUSIC_READY__ = true;
  if (!hasSpotifySetup()) connectionStatus("Spotify setup needed. Open Set up Spotify connection below to connect your account.");
  try { if (await handleSpotifyCallback()) { connectionStatus("Spotify connected. You can now export playlists."); showTab("taste"); } }
  catch (e) { connectionStatus(e.message); showTab("taste"); }
  updateConnections();
  display(null);
  status("Ready. Tap Start discovering to find your first song.");
}
init();

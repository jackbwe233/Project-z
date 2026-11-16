import { MUSIC_STORAGE_KEY, blankMusicProfile, normalizeMusicProfile, normalizeSong, recordMusicAction, removeLikedSong, musicTasteSummary } from "./lib/music-finder.js";
import { connectSpotify, handleSpotifyCallback, spotifyIsConnected, disconnectSpotify, hasSpotifySetup, createSpotifyPlaylist, connectApple, appleIsConnected, hasAppleSetup, createApplePlaylist } from "./lib/music-providers.js";
import { discoveryQueries, smartRankSongs, reasonForSong, genreFamily } from "./lib/music-intelligence.js";

const $ = id => document.getElementById(id);
const card = $("swipe-card");
const audio = $("music-audio");
let profile;
try { profile = normalizeMusicProfile(JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY) || "null")); }
catch { profile = blankMusicProfile(); }
let genre = profile.genre || "All", vibe = "any", exploration = "balanced", queue = [], current = null, loadCycle = 0, sequence = 0, exporting = false, gesture = null;
let controller = null;
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
function placeholder() {
  const s = document.createElement("span");
  s.className = "art-placeholder";
  s.textContent = "Z";
  return s;
}
function display(song) {
  current = song || null;
  audio.pause();
  if (audio.getAttribute("src")) {
    audio.removeAttribute("src");
    audio.load(); // Only reset playback when a clip was actually loaded.
  }
  $("preview-button").textContent = "▶ Preview";
  $("preview-button").disabled = !song?.preview;
  $("preview-note").textContent = song?.preview ? "Listen to a short preview" : "Preview unavailable";
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
  $("card-reason").textContent = song ? reasonForSong(song, profile, { genre, exploration }) : "Explore music by genre and mood.";
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
  actions.forEach(button => { button.disabled = !song; });
  $("discovery-count").textContent = song ? (queue.length + 1) + " SONGS TO EXPLORE" : "DISCOVER";
  card.classList.remove("out", "dragging");
  card.style.transform = "";
  card.style.opacity = "";
  card.querySelectorAll(".swipe-stamp").forEach(x => { x.style.opacity = "0"; });
}
function nextSong() {
  if (queue.length) { display(queue.shift()); status(""); }
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
  const targetGenre = seedSong ? genreFamily(seedSong.genre) : genre;
  return discoveryQueries(profile, {
    genre: targetGenre, vibe, exploration: seedSong ? "explore" : exploration,
    cycle: loadCycle, query,
  });
}
const catalogCache = new Map();
const catalogCalls = [];
async function searchCatalog(term, signal) {
  const key = term.toLowerCase();
  const cached = catalogCache.get(key);
  if (cached && Date.now() - cached.at < 12 * 60 * 1000) return cached.songs;
  // Apple's iTunes search service is limited to approximately 20 calls/minute.
  const now = Date.now();
  while (catalogCalls.length && now - catalogCalls[0] > 60000) catalogCalls.shift();
  if (catalogCalls.length >= 16) throw new Error("Song search limit reached. Try again shortly.");
  catalogCalls.push(now);
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("country", "US");
  url.searchParams.set("limit", "35");
  url.searchParams.set("explicit", "No");
  const response = await fetch(url, { signal, cache: "default" });
  if (!response.ok) throw new Error("Music catalog error (" + response.status + ").");
  const data = await response.json();
  const songs = (data.results || []).map(normalizeSong).filter(Boolean).map(song => ({ ...song, sourceQuery: term }));
  if (catalogCache.size >= 40) catalogCache.delete(catalogCache.keys().next().value);
  catalogCache.set(key, { at: Date.now(), songs });
  return songs;
}
async function loadSongs(query = "", seedSong = null) {
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
    for (const term of selected.slice(0, 3)) {
      if (task !== sequence || request.signal.aborted) return [];
      try {
        const found = await searchCatalog(term, request.signal);
        if (found.length) return found;
      } catch (error) {
        if (request.signal.aborted) throw error;
        // Fall back to a different search when this catalog term fails.
      }
    }
    return [];
  };
  try {
    const found = await Promise.race([search(), watchdog]);
    if (task !== sequence) return;
    if (request.signal.aborted) throw new Error("Music search timed out. Tap Retry.");
    if (!found.length) throw new Error("No songs loaded. Check your connection or try a different genre.");
    queue = smartRankSongs(found, profile, {
      genre: seedSong ? genreFamily(seedSong.genre) : genre,
      vibe, exploration: seedSong ? "explore" : exploration,
    });
    if (!queue.length) throw new Error("No new songs in this search. Tap Retry or change your genre.");
    display(queue.shift());
    status("");
    $("start-discovery").textContent = "↻ New songs";
    $("start-hint").textContent = "Listen to a preview, then swipe left to skip or right to save.";
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
  $("taste-likes").textContent = summary.likes;
  $("taste-skips").textContent = summary.skipped;
  for (const [id, names] of [["taste-genres", summary.genres], ["taste-artists", summary.artists]]) {
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
function updateConnections() {
  $("spotify-state").textContent = spotifyIsConnected() ? "Connected for this session" : "Not connected";
  $("apple-state").textContent = appleIsConnected() ? "Connected" : "Not connected";
  $("spotify-connect").textContent = spotifyIsConnected() ? "Disconnect" : "Connect";
  $("apple-connect").textContent = appleIsConnected() ? "Connected" : "Connect";
  $("apple-connect").disabled = appleIsConnected();
}
function showTab(target) {
  for (const key of ["discover", "saved", "taste"]) {
    $("tab-" + key).setAttribute("aria-selected", String(target === key));
    $("music-" + key).hidden = target !== key;
  }
  if (target === "saved") renderSaved();
  if (target === "taste") { renderTaste(); updateConnections(); }
  if (target !== "discover") { audio.pause(); $("preview-button").textContent = "▶ Preview"; }
}
for (const key of ["discover", "saved", "taste"]) $("tab-" + key).addEventListener("click", () => showTab(key));
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
  if (audio.paused) {
    if (audio.src !== current.preview) audio.src = current.preview;
    try { await audio.play(); $("preview-button").textContent = "❚❚ Pause"; }
    catch { status("This preview is unavailable, but you can still save the song."); }
  } else { audio.pause(); $("preview-button").textContent = "▶ Preview"; }
});
audio.addEventListener("ended", () => { $("preview-button").textContent = "▶ Preview"; });
audio.addEventListener("error", () => { $("preview-button").textContent = "▶ Preview"; $("preview-note").textContent = "Preview not available"; });
for (const button of document.querySelectorAll("[data-genre]")) button.addEventListener("click", () => {
  genre = button.dataset.genre;
  document.querySelectorAll("[data-genre]").forEach(x => x.setAttribute("aria-pressed", String(x === button)));
  $("music-search").value = ""; queue = []; persist(); loadSongs();
});
for (const button of document.querySelectorAll("[data-vibe]")) button.addEventListener("click", () => {
  vibe = button.dataset.vibe;
  document.querySelectorAll("[data-vibe]").forEach(x => x.setAttribute("aria-pressed", String(x === button)));
  $("music-search").value = ""; queue = []; loadSongs();
});
document.querySelectorAll("[data-genre]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.genre === genre)));
for (const button of document.querySelectorAll("[data-exploration]")) button.addEventListener("click", () => {
  exploration = button.dataset.exploration;
  document.querySelectorAll("[data-exploration]").forEach(x => x.setAttribute("aria-pressed", String(x === button)));
  queue = []; loadSongs();
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
$("spotify-connect").addEventListener("click", async () => {
  if (spotifyIsConnected()) { disconnectSpotify(); updateConnections(); connectionStatus("Spotify disconnected from this session."); return; }
  try { connectionStatus("Opening Spotify sign-in…"); await connectSpotify(); }
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
  persist(); renderSaved(); renderTaste(); updateConnections();
  window.__Z_MUSIC_READY__ = true;
  if (!hasSpotifySetup() && !hasAppleSetup()) connectionStatus("Music accounts require the app owner to configure developer access. Discovery and CSV playlists already work.");
  try { if (await handleSpotifyCallback()) { connectionStatus("Spotify connected. You can now export playlists."); showTab("taste"); } }
  catch (e) { connectionStatus(e.message); showTab("taste"); }
  updateConnections();
  display(null);
  status("Ready. Tap Start discovering to find your first song.");
}
init();

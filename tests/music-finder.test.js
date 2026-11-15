import { describe, expect, it } from "vitest";
import {
  blankMusicProfile, normalizeSong, normalizeMusicProfile, recordMusicAction,
  removeLikedSong, rankMusicResults, musicTasteSummary, musicSearchTerms,
} from "../lib/music-finder.js";
import { matchScore } from "../lib/music-providers.js";

function song(id, genre = "Indie", artist = "An Artist") {
  return {
    id: String(id), title: "Track " + id, artist, album: "Album", genre,
    artwork: "https://example.com/a.jpg", preview: "", appleUrl: "https://music.apple.com/us",
  };
}
describe("Z Music Finder", () => {
  it("normalizes public iTunes songs and excludes explicit tracks", () => {
    expect(normalizeSong({
      kind: "song", trackId: 4819, trackName: "Song", artistName: "Artist",
      primaryGenreName: "Alternative", artworkUrl100: "https://a.example/100x100bb.jpg",
      previewUrl: "http://unsafe.example/song.mp3", trackViewUrl: "https://music.apple.com/us/song",
    })).toMatchObject({ id: "4819", title: "Song", genre: "Alternative", preview: "" });
    expect(normalizeSong({kind:"song",trackId:4,trackName:"X",artistName:"Y",trackExplicitness:"explicit"})).toBeNull();
    expect(normalizeSong({ kind: "podcast", trackId: 5 })).toBeNull();
  });
  it("remembers likes, skips, boosts and prevents duplicate saved songs", () => {
    let state = blankMusicProfile();
    state = recordMusicAction(state, song(1), "like");
    state = recordMusicAction(state, song(1), "like");
    state = recordMusicAction(state, song(2), "skip");
    state = recordMusicAction(state, song(3), "similar");
    expect(state.likes).toHaveLength(1);
    expect(state.skips).toEqual(["2"]);
    expect(state.seen).toEqual(["1", "2", "3"]);
    expect(state.boosts).toEqual([{ artist: "An Artist", genre: "Indie" }]);
    state = removeLikedSong(state, "1");
    expect(state.likes).toHaveLength(0);
  });
  it("scores the listener's artists and genres ahead of others", () => {
    const state = recordMusicAction(blankMusicProfile(), song(1), "like");
    const list = rankMusicResults([
      song(1), song(2, "Pop", "Different"),
      song(3, "Indie", "An Artist"), song(4, "Rock", "Another"),
    ], state);
    expect(list.map(x => x.id)).toEqual(["3", "2", "4"]);
  });
  it("safely restores malformed persistent data", () => {
    const state = normalizeMusicProfile({
      likes: [{ ...song(1), artwork: "javascript:alert(1)" }, null, { id: 5 }],
      skips: ["3", "3", "invalid"], seen: ["2"], boosts: [],
    });
    expect(state.likes).toHaveLength(1);
    expect(state.likes[0].artwork).toBe("");
    expect(state.skips).toEqual(["3"]);
  });
  it("summarizes taste and chooses terms from recent preferences", () => {
    const state = recordMusicAction(blankMusicProfile(), song(1, "Jazz", "Miles"), "like");
    expect(musicTasteSummary(state)).toMatchObject({ likes:1, genres:["Jazz"], artists:["Miles"] });
    expect(musicSearchTerms(state, "Jazz")).toContain("Jazz");
    expect(musicSearchTerms(state, "Jazz", "dream pop")).toEqual(["dream pop"]);
  });
  it("matches a provider's correct artist and song before a wrong artist", () => {
    const original = { title: "Midnight Drives", artist: "Green Valley" };
    const right = { name: "Midnight Drives", artists: [{ name: "Green Valley" }] };
    const wrong = { name: "Midnight Drives", artists: [{ name: "Other Band" }] };
    expect(matchScore(original, right)).toBe(1);
    expect(matchScore(original, wrong)).toBeLessThan(.72);
  });
});

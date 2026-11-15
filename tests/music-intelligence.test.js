import { describe, it, expect } from "vitest";
import { GENRE_SEEDS, VIBE_SEEDS, discoveryQueries, smartRankSongs, genreFamily, reasonForSong } from "../lib/music-intelligence.js";

const track = (id, artist, genre = "Alternative", title = "Song " + id) => ({ id:String(id), title, artist, genre, preview:"" });
describe("music discovery intelligence", () => {
  it("recognizes representative genre families from public music tags", () => {
    expect(genreFamily("Hip-Hop/Rap")).toBe("Hip-Hop");
    expect(genreFamily("R&B/Soul")).toBe("R&B");
    expect(genreFamily("Alternative")).toBe("Indie");
    expect(genreFamily("Jazz")).toBe("Jazz");
    expect(genreFamily("Dance")).toBe("Electronic");
    expect(genreFamily("indie pop")).toBe("Indie");
    expect(GENRE_SEEDS.Indie).toContain("shoegaze");
    expect(VIBE_SEEDS.dreamy).toContain("dream pop");
  });
  it("builds diverse queries from vibes and known artists, respecting explicit artist searches", () => {
    const profile = { likes:[track(1, "Slow River", "Alternative")], boosts:[] };
    expect(discoveryQueries(profile, {genre:"Indie", vibe:"dreamy", cycle:0})).toContain("Slow River");
    expect(discoveryQueries(profile, {genre:"Rock", vibe:"hype", cycle:1})[0]).toContain("upbeat");
    expect(discoveryQueries(profile, {genre:"Indie", vibe:"dreamy", query:"Dreamy guitar" })).toEqual(["Dreamy guitar"]);
    const explore = discoveryQueries(profile, {genre:"Indie", vibe:"dreamy", exploration:"explore", cycle:0});
    expect(explore).not.toContain("Slow River");
  });
  it("filters previously heard songs and duplicate versions across album editions", () => {
    const results = smartRankSongs([
      track(1,"A"),track(2,"B"),track(3,"B","Alternative","Song 2 (Remastered)"),track(4,"A"),
    ], { likes:[], seen:["1"], skippedSongs:[] });
    expect(results.map(x => x.id)).not.toContain("1");
    expect(results).toHaveLength(2);
  });
  it("prioritizes liked music and balances artists in familiar and exploration modes", () => {
    const profile = { likes: [track(1,"Great Artist","Rock")], seen:["1"], skippedSongs:[] };
    const choices = [
      track(2,"Great Artist","Rock"),track(3,"Great Artist","Rock"),
      track(4,"New Artist","Rock"),track(5,"Another Artist","Pop"),
    ];
    const familiar = smartRankSongs(choices,profile,{ genre:"Rock",exploration:"familiar" });
    expect(familiar[0].artist).toBe("Great Artist");
    const exploration = smartRankSongs(choices,profile,{genre:"Rock",exploration:"explore"});
    expect(exploration[0].artist).not.toBe("Great Artist");
    expect(new Set(exploration.map(s => s.id)).size).toBe(exploration.length);
  });
  it("uses previous skips as negative preference signals", () => {
    const result = smartRankSongs([
      track(3,"Often Skipped", "Rock"), track(4,"New Artist","Rock"),
    ], {likes:[],seen:[],skippedSongs:[track(1,"Often Skipped","Rock"),track(2,"Often Skipped","Rock")]}, {genre:"Rock"});
    expect(result[0].artist).toBe("New Artist");
  });
  it("gives reasons tied only to actual saved metadata", () => {
    const profile = {likes:[track(1,"Lumen","Jazz")]};
    expect(reasonForSong(track(2,"Lumen","Jazz"),profile)).toContain("artist");
    expect(reasonForSong(track(3,"Other","Jazz"),profile)).toContain("Jazz");
    expect(reasonForSong(track(4,"Unknown","Country"),profile,{exploration:"explore"})).toContain("different");
  });
});

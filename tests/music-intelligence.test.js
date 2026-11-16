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
  it("never uses popularity, streams or cover art as a ranking signal", () => {
    const a={...track(101,"A","Jazz"),popularity:100000,plays:99999,artwork:"https://example.com/a.jpg"};
    const b={...track(202,"B","Jazz"),popularity:1,plays:0,artwork:""};
    const opts={genre:"Jazz",exploration:"explore",cycle:7};
    const order1=smartRankSongs([a,b],{likes:[],seen:[]},opts).map(s=>s.id);
    const order2=smartRankSongs([{...a,popularity:0,plays:0,artwork:""},{...b,popularity:99999,plays:99999,artwork:"https://example.com/b.jpg"}],{likes:[],seen:[]},opts).map(s=>s.id);
    expect(order1).toEqual(order2);
  });
  it("gives reasons tied only to actual saved metadata", () => {
    const profile = {likes:[track(1,"Lumen","Jazz")]};
    expect(reasonForSong(track(2,"Lumen","Jazz"),profile)).toContain("artist");
    expect(reasonForSong(track(3,"Other","Jazz"),profile)).toContain("Jazz");
    expect(reasonForSong(track(4,"Unknown","Country"),profile,{exploration:"explore"})).toContain("different");
  });
  it("rejects unrelated Audius genres instead of presenting off-target songs", () => {
    const songs = [
      {...track("1", "Random Rapper", "Hip-Hop/Rap"), source:"audius", sourceQuery:"dream pop"},
      {...track("2", "Dream Band", "Alternative"), source:"apple", sourceQuery:"dream pop"},
      {...track("3", "Another Band", "Indie Rock"), source:"audius", sourceQuery:"shoegaze"},
    ];
    const ranked = smartRankSongs(songs, {likes:[],seen:[],skippedSongs:[]}, {genre:"Indie", vibe:"dreamy"});
    expect(ranked.map(x => x.id)).toEqual(expect.arrayContaining(["2","3"]));
    expect(ranked.map(x => x.id)).not.toContain("1");
  });
  it("takes multiple artist seeds and learns from repeated skips", () => {
    const profile = {
      likes:[],seen:[],skippedSongs:[
        track("11","Unwanted","Rock"),track("12","Unwanted","Rock"),track("13","Unwanted","Rock"),
      ],
      boosts:[
        {artist:"Favorite A",genre:"Other"},{artist:"Favorite B",genre:"Other"},{artist:"Favorite C",genre:"Other"},
      ],
    };
    const terms = discoveryQueries(profile, {genre:"Rock",exploration:"balanced"});
    expect(terms).toContain("Favorite C");
    const matches = smartRankSongs([
      track("21","Unwanted","Rock"),track("22","Favorite C","Rock"),
    ], profile,{genre:"Rock",exploration:"balanced"});
    expect(matches.map(x=>x.id)).toEqual(["22"]);
  });
  it("does not let a nonmatching fallback genre overpower an explicit genre choice", () => {
    const results = smartRankSongs([
      {...track("2","A","Jazz"),source:"audius",sourceQuery:"hip hop"},
      {...track("3","B","Hip-Hop/Rap"),source:"audius",sourceQuery:"hip hop"},
    ],{likes:[],seen:[],skippedSongs:[]},{genre:"Hip-Hop"});
    expect(results.map(x=>x.id)).toEqual(["3"]);
  });

});

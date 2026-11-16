import { describe, expect, it } from "vitest";
import {
  analyzeSonicSamples, normalizeSonicLibrary, sonicSimilarity,
  rankSonicLibrary, sonicMoodHints, parseLocalTrackName, normalizeFeelings,
} from "../lib/sonic-dna.js";

const rate = 22050;
const sine = (hz, amp = .5) => {
  const result = new Float32Array(rate * 8);
  for (let i = 0; i < result.length; i++) result[i] = amp * Math.sin(2 * Math.PI * hz * i / rate);
  return result;
};
const track = (id, features) => ({ id, title:"Track "+id, artist:"Artist", features });

describe("Sound DNA measures audio instead of relying on popularity or catalog rank", () => {
  it("extracts repeatable sound measurements and distinguishes bass from brightness", () => {
    const low = analyzeSonicSamples(sine(110), rate);
    const high = analyzeSonicSamples(sine(3000), rate);
    expect(low.bass).toBeGreaterThan(high.bass);
    expect(high.brightness).toBeGreaterThan(low.brightness);
    expect(sonicSimilarity(low, low)).toBe(100);
    expect(sonicSimilarity(low, high)).toBeLessThan(90);
    expect(sonicMoodHints(low).length).toBeGreaterThan(0);
  });
  it("ranks actual acoustic resemblance, not artist name or song popularity", () => {
    const low = analyzeSonicSamples(sine(120), rate);
    const similar = analyzeSonicSamples(sine(125), rate);
    const different = analyzeSonicSamples(sine(3600), rate);
    const library = [track("reference", low), track("not-like",different),track("sounds-close",similar)];
    const ranked = rankSonicLibrary(library[0],library);
    expect(ranked.map(t=>t.id)).toEqual(["sounds-close","not-like"]);
    expect(ranked[0].reasons.length).toBeGreaterThan(0);
  });
  it("keeps personal emotion language separate from measured features", () => {
    const f = analyzeSonicSamples(sine(250), rate);
    const library = normalizeSonicLibrary([
      {...track("ref",f),feelings:["majestic","hypnotic"]},
      {...track("a",f),feelings:["hypnotic","dreamy"]},
      {...track("b",f),feelings:["happy"]},
    ]);
    const ranked=rankSonicLibrary(library[0],library);
    expect(ranked[0].id).toBe("a");
    expect(ranked[0].sharedFeelings).toEqual(["hypnotic"]);
    expect(normalizeFeelings("Majestic, hypnotic, majestic")).toEqual(["majestic","hypnotic"]);
    expect(ranked[0].similarity).toBe(100);
  });
  it("only keeps valid local sonic profiles and correctly parses file names", () => {
    const f = analyzeSonicSamples(sine(200),rate);
    expect(normalizeSonicLibrary([track("a",f),track("b",{...f,energy:Infinity})])).toHaveLength(1);
    expect(parseLocalTrackName("Indie Artist - Deep Blue.wav")).toEqual({artist:"Indie Artist",title:"Deep Blue"});
    expect(() => analyzeSonicSamples(new Float32Array(40),rate)).toThrow();
  });
});

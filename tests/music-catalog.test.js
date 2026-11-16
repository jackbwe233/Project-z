import { describe, expect, it } from "vitest";
import { appleSongSearch, audiusSongSearch, catalogJson, normalizeAudiusSong } from "../lib/music-catalog.js";

const respond = value => Promise.resolve({
  ok: true, status: 200, json: async () => value,
});

describe("music catalog reliability", () => {
  it("normalizes Apple results without relying on popularity", async () => {
    let requested;
    const songs = await appleSongSearch("dream pop", {
      fetchImpl: async url => {
        requested = String(url);
        return respond({ results: [{
          kind: "song", trackId: 1234, trackName: "A Quiet Song", artistName: "A Band",
          primaryGenreName: "Indie", trackExplicitness: "notExplicit",
          artworkUrl100: "https://example.com/cover100x100bb.jpg",
          previewUrl: "https://example.com/sample.m4a",
        }] });
      },
    });
    expect(requested).toContain("itunes.apple.com/search");
    expect(requested).toContain("term=dream+pop");
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ id: "1234", source: "apple", sourceQuery: "dream pop" });
  });

  it("maps Audius results to swipable tracks with a trustworthy link", async () => {
    const songs = await audiusSongSearch("shoegaze", {
      fetchImpl: async url => {
        expect(String(url)).toContain("api.audius.co/v1/tracks/search");
        return respond({ data: [{
          id: "abc_123", title: "Clouds", user: { name: "New Artist" },
          genre: "Electronic", permalink: "/newartist/clouds",
          artwork: { "480x480": "https://example.com/art.jpg" },
        }] });
      },
    });
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      id: "audius:abc_123", source: "audius", title: "Clouds",
      audiusUrl: "https://audius.co/newartist/clouds",
      preview: "https://api.audius.co/v1/tracks/abc_123/stream",
    });
  });

  it("does not surface explicit or invalid Audius tracks and rejects unsafe URLs", () => {
    expect(normalizeAudiusSong({ id: "1", title: "X", user: { name: "Y" }, is_explicit: true })).toBeNull();
    expect(normalizeAudiusSong({ id: "1", title: "X", user: { name: "Y" }, is_stream_gated: true })).toBeNull();
    const track = normalizeAudiusSong({
      id: "3", title: "X", user: { name: "Y" },
      permalink: "javascript:alert(1)", artwork: { "480x480": "http://example.com/insecure.png" },
    });
    expect(track).not.toBeNull();
    expect(track.audiusUrl).toBe("");
    expect(track.artwork).toBe("");
  });

  it("does not offer playback for gated or unstreamable Audius songs", () => {
    const basic = { id: "valid_1", title: "Song", user: { name: "Artist" } };
    expect(normalizeAudiusSong({ ...basic, is_stream_gated: true })).toBeNull();
    expect(normalizeAudiusSong({ ...basic, is_streamable: false })).toBeNull();
    expect(normalizeAudiusSong({ ...basic, isStreamable: false })).toBeNull();
    expect(normalizeAudiusSong({ ...basic, id: "../../unsafe" })).toBeNull();
  });

  it("times out even when a broken iPhone fetch never settles after abort", async () => {
    let capturedSignal;
    await expect(catalogJson("https://itunes.apple.com/search", {
      timeoutMs: 15,
      fetchImpl: (_url, options) => {
        capturedSignal = options.signal;
        return new Promise(() => {});
      },
    })).rejects.toThrow("timed out");
    expect(capturedSignal.aborted).toBe(true);
  });

  it("cancels an in-flight backup request on a new search", async () => {
    const controller = new AbortController();
    const pending = catalogJson("https://api.audius.co/v1/tracks/search", {
      signal: controller.signal, timeoutMs: 1000,
      fetchImpl: () => new Promise(() => {}),
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

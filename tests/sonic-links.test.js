import { describe, expect, it } from "vitest";
import { parseSonicLink, normalizeSonicLinks, resolveSonicLink } from "../lib/sonic-links.js";

const jsonFetch = payload => async () => ({ ok: true, json: async () => payload });

describe("Sound DNA song links", () => {
  it("accepts only supported HTTPS track links and strips tracking parameters", () => {
    expect(parseSonicLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abcd")).toEqual({
      provider: "Spotify", id: "4uLU6hMCjMI75M1A2tKUQC",
      url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    });
    expect(parseSonicLink("https://music.apple.com/us/album/track/1450?i=987654321")).toMatchObject({
      provider: "Apple Music", id: "987654321",
    });
    expect(parseSonicLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=abc")).toEqual({
      provider: "YouTube", id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(parseSonicLink("https://soundcloud.com/artist/song?utm_source=chat")).toMatchObject({
      provider: "SoundCloud", url: "https://soundcloud.com/artist/song",
    });
    expect(parseSonicLink("javascript:alert(1)")).toBeNull();
    expect(parseSonicLink("https://open.spotify.com.fake-site.org/track/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
  });
  it("resolves Apple Music's exact track ID without inventing acoustic features", async () => {
    const result = await resolveSonicLink("https://music.apple.com/us/album/test/123456?i=987654321", {
      fetchImpl: jsonFetch({ results: [
        { wrapperType: "collection", collectionId: 123456 },
        { wrapperType: "track", kind: "song", trackId: 987654321, trackName: "Dream Song", artistName: "Artist" },
      ] }),
    });
    expect(result).toMatchObject({ provider: "Apple Music", title: "Dream Song", artist: "Artist" });
    expect(result).not.toHaveProperty("features");
    expect(result).not.toHaveProperty("audioUrl");
  });
  it("resolves Spotify track metadata without claiming Spotify audio access", async () => {
    const result = await resolveSonicLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", {
      fetchImpl: jsonFetch({ title: "Never Gonna Give You Up", author_name: "Rick Astley" }),
    });
    expect(result.title).toBe("Never Gonna Give You Up");
    expect(result.artist).toBe("Rick Astley");
    expect(result.audioUrl).toBeUndefined();
  });
  it("recognizes YouTube song names without using the video's uploader as a verified artist", async () => {
    const result = await resolveSonicLink("https://youtu.be/dQw4w9WgXcQ", {
      fetchImpl: jsonFetch({ title: "Artist - The Song (Official Video)", author_name: "Random upload channel" }),
    });
    expect(result.title).toBe("The Song");
    expect(result.artist).toBe("Artist");
  });
  it("keeps stored linked songs separate from actual measured Sound DNA", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    const items = normalizeSonicLinks([
      { id: "link-abc123", url, title: "A track", artist: "A person", features: { energy: 1 } },
      { id: "link-xyz123", url, title: "A newer track", artist: "A person" },
      { id: "bad", url: "https://bad.example.com/", title: "Unsupported" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("A newer track");
    expect(items[0]).not.toHaveProperty("features");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchModelFile } from "../lib/model-fetch.js";

const url = "https://huggingface.co/example/resolve/main/model.gguf";
afterEach(() => vi.unstubAllGlobals());

describe("model file download", () => {
  it("retries a failed range request without cached redirects", async () => {
    const response = new Response(null, { status: 206 });
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetch);
    const options = { headers: { Range: "bytes=0-7" }, signal: new AbortController().signal };

    expect(await fetchModelFile(url, options)).toBe(response);
    expect(fetch.mock.calls).toEqual([
      [url, options],
      [url, { ...options, cache: "no-store" }],
    ]);
  });

  it("retries a denied redirected file request", async () => {
    const denied = { status: 403, redirected: true, body: null };
    const fetch = vi.fn().mockResolvedValueOnce(denied).mockResolvedValueOnce(new Response());
    vi.stubGlobal("fetch", fetch);
    await fetchModelFile(url, { method: "HEAD" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("identifies the source host after two network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchModelFile(url)).rejects.toThrow("huggingface.co or its file server after retrying");
  });

  it("does not retry a cancelled download", async () => {
    const controller = new AbortController();
    const error = new DOMException("Aborted", "AbortError");
    const fetch = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetch);
    controller.abort();
    await expect(fetchModelFile(url, { signal: controller.signal })).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry rate limiting", async () => {
    const limited = new Response(null, { status: 429 });
    const fetch = vi.fn().mockResolvedValue(limited);
    vi.stubGlobal("fetch", fetch);
    expect(await fetchModelFile(url)).toBe(limited);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

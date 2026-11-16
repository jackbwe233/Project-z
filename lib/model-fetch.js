/** Retry safe model downloads once without reusing a cached response or redirect. */
export async function fetchModelFile(input, options = {}) {
  const method = (options.method ?? input.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetch(input, options);

  const signal = options.signal ?? input.signal;
  try {
    const response = await fetch(input, options);
    const retryable = response.status >= 500 || (response.redirected && response.status === 403);
    if (!retryable || signal?.aborted) return response;
    await response.body?.cancel().catch(() => {});
  } catch (error) {
    if (signal?.aborted || error.name !== "TypeError") throw error;
  }

  try {
    return await fetch(input, { ...options, cache: "no-store" });
  } catch (error) {
    if (signal?.aborted || error.name !== "TypeError") throw error;
    const host = new URL(input.url ?? input, globalThis.location?.href).hostname;
    throw new Error(`Could not download model files from ${host} or its file server after retrying. Check that your network allows model downloads.`, { cause: error });
  }
}

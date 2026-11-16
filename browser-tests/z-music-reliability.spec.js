import { test, expect } from "@playwright/test";

const catalog = {
  resultCount: 3,
  results: Array.from({length:3},(_,i)=>({
    wrapperType:"track", kind:"song", trackId:45000+i,
    trackName:"Fast Preview "+i, artistName:"Test Artist",
    collectionName:"Test Album", primaryGenreName:"Indie Rock",
    trackExplicitness:"notExplicit", artworkUrl100:"https://example.com/cover100x100bb.jpg",
    previewUrl:"https://example.com/preview.m4a",
    trackViewUrl:"https://music.apple.com/us/song/fast-"+i,
  })),
};

test("Music Start stays responsive during a stalled network request; Retry cancels and loads",async({page})=>{
  await page.addInitScript(data=>{
    const original=window.fetch.bind(window);
    let count=0;
    window.__musicFetchCount=()=>count;
    window.fetch=(url,options={})=>{
      if(!String(url).includes("itunes.apple.com/search"))return original(url,options);
      count++;
      if(count===1){
        return new Promise((_resolve,reject)=>{
          options.signal?.addEventListener("abort",()=>reject(new DOMException("Canceled","AbortError")),{once:true});
        });
      }
      return Promise.resolve(new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}}));
    };
  },catalog);
  await page.setViewportSize({width:390,height:844});
  await page.goto("/music.html");
  await expect(page.locator("#discovery-status")).toContainText("Tap Start");
  expect(await page.evaluate(()=>window.__musicFetchCount())).toBe(0);
  const start=page.locator("#start-discovery");
  await start.click();
  await expect(page.locator("#discovery-status")).toContainText("Searching");
  await expect(start).toBeEnabled();
  await expect(start).toContainText("Retry");
  await start.click();
  await expect(page.locator("#card-title")).toContainText("Fast Preview");
  await expect(page.locator("#preview-button")).toBeEnabled();
  await expect(start).toBeEnabled();
  expect(await page.evaluate(()=>getComputedStyle(document.querySelector("#swipe-card")).touchAction)).toBe("pan-y");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test("Music Finder reports offline errors without disabling Start or freezing the UI",async({page})=>{
  await page.route("https://itunes.apple.com/search**",route=>route.abort("internetdisconnected"));
  await page.route("https://api.audius.co/v1/tracks/search**",route=>route.abort("internetdisconnected"));
  await page.goto("/music.html");
  await page.locator("#start-discovery").click();
  await expect(page.locator("#discovery-status")).toContainText(/No songs loaded|Music discovery is unavailable/);
  await expect(page.locator("#start-discovery")).toBeEnabled();
  await page.locator("#tab-saved").click();
  await expect(page.locator("#music-saved")).toBeVisible();
  await page.locator("#tab-discover").click();
  await expect(page.locator("#start-discovery")).toBeEnabled();
});


test("Music Start returns to Retry even if iPhone fetch never resolves after abort", async ({page}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (url, options) => {
      if (String(url).includes("itunes.apple.com/search") ||
          String(url).includes("api.audius.co/v1/tracks/search")) return new Promise(() => {});
      return original(url, options);
    };
  });
  await page.goto("/music.html");
  const start = page.locator("#start-discovery");
  await start.click();
  await expect(page.locator("#discovery-status")).toContainText("Searching");
  await page.clock.fastForward(7600);
  await expect(page.locator("#discovery-status")).toContainText("timed out");
  await expect(start).toBeEnabled();
  await expect(start).toContainText("Try again");
});

test("Music Start explains when its main script fails to initialize", async ({page}) => {
  await page.clock.install();
  await page.route("**/music.js?v=9", route => route.abort("failed"));
  await page.goto("/music.html");
  await page.locator("#start-discovery").click();
  await expect(page.locator("#discovery-status")).toContainText("still loading");
  await page.clock.fastForward(3700);
  await expect(page.locator("#discovery-status")).toContainText("could not initialize");
  await expect(page.locator("#start-discovery")).toContainText("Reload music");
});

test("When Apple is rate-limited, Music Finder uses Audius and saves the track", async ({page}) => {
  await page.route("https://itunes.apple.com/search**", route => route.fulfill({
    status: 429, contentType: "application/json", body: '{"error":"rate limited"}',
  }));
  await page.route("https://api.audius.co/v1/tracks/search**", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      data: [
        { id: "new_001", title: "Hidden Sound One", user: { name: "Independent One" },
          genre: "Indie", permalink: "/independent-one/hidden-sound-one",
          artwork: { "480x480": "https://example.com/art1.jpg" } },
        { id: "new_002", title: "Hidden Sound Two", user: { name: "Independent Two" },
          genre: "Indie", permalink: "/independent-two/hidden-sound-two" },
      ],
    }),
  }));
  await page.goto("/music.html");
  await page.locator("#start-discovery").click();
  await expect(page.locator("#card-title")).toContainText("Hidden Sound");
  await expect(page.locator("#discovery-status")).toContainText("Audius");
  await expect(page.locator("#audius-song-link")).toBeVisible();
  await expect(page.locator("#audius-song-link")).toHaveAttribute("href", /audius.co/);
  await expect(page.locator("#preview-button")).toBeEnabled();
  await expect(page.locator("#preview-button")).toContainText("Play track");
  await page.locator("#like-song").click();
  await expect(page.locator("#saved-count")).toHaveText("1");
  await page.reload();
  await page.locator("#tab-saved").click();
  await expect(page.locator("#saved-tracks")).toContainText("Hidden Sound");
});


test("Spotify connection setup accepts a public Client ID and begins PKCE sign-in", async ({ page }) => {
  await page.route("https://accounts.spotify.com/authorize**", route => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><title>Spotify sign-in mock</title>",
  }));
  await page.goto("/music.html");
  await page.locator("#tab-taste").click();
  await expect(page.locator("#spotify-state")).toContainText("Setup needed");
  await page.locator("#spotify-connect").click();
  await expect(page.locator("#spotify-setup")).toHaveAttribute("open", "");
  const redirect = await page.locator("#spotify-redirect-uri").textContent();
  expect(redirect).toBe(new URL(page.url()).origin + "/music.html");
  await page.locator("#spotify-client-id").fill("0123456789abcdef0123456789abcdef");
  await page.locator("#save-spotify-client-id").click();
  await expect(page.locator("#connection-help")).toContainText("saved on this device");
  await expect(page.locator("#spotify-state")).toHaveText("Ready to connect");
  await page.locator("#spotify-connect").click();
  await expect(page).toHaveURL(/^https:\/\/accounts\.spotify\.com\/authorize\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("client_id")).toBe("0123456789abcdef0123456789abcdef");
  expect(params.get("redirect_uri")).toBe(redirect);
  expect(params.get("code_challenge_method")).toBe("S256");
  expect(params.get("code_challenge")).toBeTruthy();
});

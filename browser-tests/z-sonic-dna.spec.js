import { test, expect } from "@playwright/test";

// Mocks only the browser audio decoder. The real DSP analyzer processes the samples.
// No third-party music previews are downloaded and no user accounts are touched.
test("Sound DNA: two locally supplied audio files are measured and compared, even after reload", async ({page}) => {
  await page.addInitScript(() => {
    class FakeAudioContext {
      async decodeAudioData(buffer) {
        const freq = new Uint8Array(buffer)[0] === 1 ? 110 : 3000;
        const sampleRate = 22050, samples = new Float32Array(sampleRate * 8);
        for(let i=0;i<samples.length;i++) samples[i]=0.5*Math.sin(2*Math.PI*freq*i/sampleRate);
        return {duration:8,sampleRate,getChannelData:()=>samples};
      }
      async close() {}
    }
    Object.defineProperty(window,"AudioContext",{configurable:true,value:FakeAudioContext});
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto("/music.html");
  await page.locator("#tab-sonic").click();
  const input=page.locator("#sonic-files");
  await input.setInputFiles({name:"Low Artist - Bass Song.wav",mimeType:"audio/wav",buffer:Buffer.from([1,2])});
  await expect(page.locator("#sonic-count")).toContainText("1 track");
  await expect(input).toBeEnabled();
  await input.setInputFiles({name:"High Artist - Bright Song.wav",mimeType:"audio/wav",buffer:Buffer.from([2,3])});
  await expect(page.locator("#sonic-count")).toContainText("2 tracks");
  await expect(page.locator(".sonic-match")).toHaveCount(1);
  await expect(page.locator(".sonic-match-score")).toContainText("%");
  await expect(page.locator("#sonic-results")).toContainText("Similar:");
  await page.locator("#sonic-feelings").fill("dreamy, majestic, nostalgic");
  await page.locator("#sonic-save-feelings").click();
  await expect(page.locator("#sonic-status")).toContainText("Saved your feelings");

  await page.reload();
  await page.locator("#tab-sonic").click();
  await expect(page.locator("#sonic-library .sonic-track")).toHaveCount(2);
  await expect(page.locator("#sonic-feelings")).toHaveValue("dreamy, majestic, nostalgic");

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#sonic-clear").click();
  await expect(page.locator("#sonic-count")).toContainText("0 tracks");
});


test("Sound DNA: a linked Apple Music song waits for audio, then becomes measured", async ({page}) => {
  await page.addInitScript(() => {
    class FakeAudioContext {
      async decodeAudioData() {
        const rate = 22050, samples = new Float32Array(rate * 8);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * 0.07) * 0.4;
        return { duration: 8, sampleRate: rate, getChannelData: () => samples };
      }
      async close() {}
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
  });
  await page.route("https://itunes.apple.com/lookup?*", route => route.fulfill({
    status: 200,
    headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
    body: JSON.stringify({ results: [{
      wrapperType: "track", kind: "song", trackId: 987654321,
      trackName: "The Wave", artistName: "Example Artist",
    }] }),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/music.html");
  await page.locator("#tab-sonic").click();
  await page.locator("#sonic-link").fill("https://music.apple.com/us/album/the-wave/123456789?i=987654321");
  await page.locator("#sonic-link-submit").click();
  await expect(page.locator("#sonic-links .sonic-linked-row")).toHaveCount(1);
  await expect(page.locator("#sonic-links")).toContainText("The Wave");
  await expect(page.locator("#sonic-count")).toContainText("0 tracks");
  await expect(page.locator("#sonic-status")).toContainText("link alone cannot provide audio");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", {name:"Add audio file for The Wave"}).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name:"example.wav", mimeType:"audio/wav", buffer:Buffer.from([1,2]) });
  await expect(page.locator("#sonic-count")).toContainText("1 track");
  await expect(page.locator("#sonic-library")).toContainText("The Wave");
  await expect(page.locator("#sonic-links .sonic-linked-row")).toHaveCount(0);
  await page.reload();
  await page.locator("#tab-sonic").click();
  await expect(page.locator("#sonic-library")).toContainText("Example Artist");
});

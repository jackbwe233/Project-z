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
  await input.setInputFiles({name:"High Artist - Bright Song.wav",mimeType:"audio/wav",buffer:Buffer.from([2,3])});
  await expect(page.locator("#sonic-count")).toContainText("2 tracks");
  await expect(page.locator(".sonic-match")).toHaveCount(1);
  await expect(page.locator(".sonic-match-score")).toContainText("%");
  await expect(page.locator("#sonic-results")).toContainText("Similar:");
  await page.reload();
  await page.locator("#tab-sonic").click();
  await expect(page.locator("#sonic-library .sonic-track")).toHaveCount(2);
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#sonic-clear").click();
  await expect(page.locator("#sonic-count")).toContainText("0 tracks");
});

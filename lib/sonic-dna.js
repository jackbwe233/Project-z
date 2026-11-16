/* Z Sound DNA — local, opt-in acoustic measurements from user-provided audio.
 * Never downloads or decodes Apple/Spotify previews. No recording bytes are stored.
 * Descriptors are measurable; perceived emotions are personal, not ground truth. */
export const SONIC_STORAGE_KEY = "z-sonic-dna-v1";
export const MAX_SONIC_TRACKS = 75;
const N = 1024;
const FIELDS = ["energy", "brightness", "bass", "texture", "movement", "dynamics", "pulse"];
const LABELS = {
  energy: "overall intensity",
  brightness: "treble brightness",
  bass: "low-end weight",
  texture: "tonal / noisy texture",
  movement: "sound changes and motion",
  dynamics: "dynamic contrast",
  pulse: "rhythmic regularity",
};
const clamp = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

function spectrum(frame) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let len = 2; len <= N; len *= 2) {
    const angle = -2 * Math.PI / len, cos = Math.cos(angle), sin = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = wr * re[b] - wi * im[b], ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const next = wr * cos - wi * sin;
        wi = wr * sin + wi * cos; wr = next;
      }
    }
  }
  const bins = new Float64Array(N / 2);
  for (let i = 1; i < bins.length; i++) bins[i] = Math.hypot(re[i], im[i]);
  return bins;
}

function estimatePulse(samples, sampleRate, seconds) {
  const hop = Math.max(1, Math.floor(sampleRate * 0.075));
  const size = Math.max(1, Math.floor(sampleRate * 0.065));
  const count = Math.min(1000, Math.floor(seconds * sampleRate / hop));
  if (count < 65) return {tempo:null, pulse:0};
  const env = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * hop, stride = Math.max(1, Math.floor(size / 80));
    let sum = 0, n = 0;
    for (let j = 0; j < size && base + j < samples.length; j += stride) {
      const v = samples[base + j]; sum += v * v; n++;
    }
    env[i] = Math.sqrt(sum / Math.max(1, n));
  }
  const onsets = new Float64Array(count);
  let total = 0;
  for (let i = 1; i < count; i++) {
    onsets[i] = Math.max(0, env[i] - env[i - 1]);
    total += onsets[i] * onsets[i];
  }
  if (total < 0.000001) return {tempo:null, pulse:0};
  let best = 0, bestLag = 0;
  const minLag = Math.ceil(60 / (195 * 0.075));
  const maxLag = Math.floor(60 / (60 * 0.075));
  for (let lag = minLag; lag <= maxLag; lag++) {
    let numerator = 0, a = 0, b = 0;
    for (let i = 0; i < count - lag; i++) {
      const x = onsets[i], y = onsets[i + lag];
      numerator += x * y; a += x * x; b += y * y;
    }
    const corr = numerator / (Math.sqrt(a * b) + 1e-10);
    if (corr > best) { best = corr; bestLag = lag; }
  }
  return { tempo: best > 0.17 ? Math.round(60 / (0.075 * bestLag)) : null, pulse:clamp(best) };
}

/* Pure function, accepts mono Float32Array and sample rate. Analyzes at most
 * 75 seconds and 56 FFT windows to remain practical on mobile devices. */
export function analyzeSonicSamples(samples, sampleRate) {
  if (!samples || samples.length < 8192 || !Number.isFinite(sampleRate) || sampleRate < 8000)
    throw new Error("This recording is too short or unsupported.");
  const seconds = Math.min(75, samples.length / sampleRate);
  const step = Math.max(1, Math.floor(sampleRate / 18000));
  const effectiveRate = sampleRate / step;
  const frames = Math.min(56, Math.max(16, Math.floor(seconds * 1.5)));
  const rmsValues = [];
  let totalCentroid=0, totalBass=0, totalFlatness=0, totalMovement=0, prev=null;
  const binsMax = N / 2;
  for (let k = 0; k < frames; k++) {
    const center = Math.floor(((k + 0.5) / frames) * seconds * sampleRate);
    const start = Math.max(0, Math.min(samples.length - N * step, center - Math.floor(N * step / 2)));
    const frame = new Float32Array(N);
    let power = 0;
    for (let i = 0; i < N; i++) {
      const value = samples[start + i * step] || 0;
      frame[i] = value; power += value * value;
    }
    rmsValues.push(Math.sqrt(power / N));
    const bins = spectrum(frame);
    let sum=0, weighted=0, low=0, logs=0, active=0;
    for (let i = 1; i < binsMax; i++) {
      const value=bins[i], hz=i * effectiveRate / N;
      sum += value; weighted += hz * value;
      if (hz < 230) low += value;
      logs += Math.log(value + 1e-9); active++;
    }
    // Use normalized spectra to compare change without caring about recording gain.
    if (prev) {
      let dist = 0;
      for (let i = 1; i < binsMax; i++) dist += Math.abs(bins[i] / (sum + 1e-9) - prev[i]);
      totalMovement += Math.min(1, dist / 2);
    }
    prev = bins.map(value => value / (sum + 1e-9));
    totalCentroid += weighted / (sum + 1e-9);
    totalBass += low / (sum + 1e-9);
    totalFlatness += Math.exp(logs / Math.max(active,1)) / ((sum / Math.max(active,1)) + 1e-9);
  }
  const mean = rmsValues.reduce((a,b)=>a+b,0)/frames;
  const variance = rmsValues.reduce((a,b)=>a+(b-mean)**2,0)/frames;
  const rhythmic = estimatePulse(samples,sampleRate,seconds);
  return {
    version:1,
    energy:clamp(mean * 2.6),
    brightness:clamp((totalCentroid / frames) / 6000),
    bass:clamp(totalBass / frames * 1.9),
    texture:clamp(totalFlatness / frames * 2.5),
    movement:clamp(totalMovement / Math.max(1,frames-1) * 1.9),
    dynamics:clamp(Math.sqrt(variance) / (mean + 0.035) * 1.25),
    pulse:rhythmic.pulse,
    tempo:rhythmic.tempo,
  };
}

export function validSonicFeatures(s) {
  return !!s && typeof s === "object" && FIELDS.every(key =>
    typeof s[key] === "number" && Number.isFinite(s[key]) && s[key] >= 0 && s[key] <= 1)
    && (s.tempo === null || s.tempo === undefined ||
      (Number.isFinite(s.tempo) && s.tempo >= 50 && s.tempo <= 210));
}
export function normalizeSonicLibrary(raw) {
  if (!Array.isArray(raw)) return [];
  const unique = new Map();
  for (const item of raw.slice(-MAX_SONIC_TRACKS)) {
    if (!item || typeof item.id !== "string" || !validSonicFeatures(item.features)) continue;
    unique.set(item.id, {
      id:item.id.slice(0,100),
      title:String(item.title || "Untitled").slice(0,140),
      artist:String(item.artist || "Unknown artist").slice(0,140),
      features:Object.fromEntries(FIELDS.map(key => [key,item.features[key]]).concat([["tempo",item.features.tempo ?? null],["version",1]])),
    });
  }
  return [...unique.values()].slice(-MAX_SONIC_TRACKS);
}
export function sonicSimilarity(a,b) {
  if (!validSonicFeatures(a) || !validSonicFeatures(b)) return null;
  const weights={energy:2.2,brightness:1.9,bass:1.9,texture:1.8,movement:2.0,dynamics:1.3,pulse:1.0};
  let distance=0, weight=0;
  for (const key of FIELDS) { distance += weights[key] * (a[key]-b[key]) ** 2; weight += weights[key]; }
  if (a.tempo && b.tempo && a.pulse > 0.2 && b.pulse > 0.2) {
    // Half-time and double-time readings are often musically equivalent.
    const d=Math.min(Math.abs(a.tempo-b.tempo),Math.abs(2*a.tempo-b.tempo),Math.abs(a.tempo-2*b.tempo));
    distance += Math.min(1,d / 90) ** 2 * 0.7; weight += 0.7;
  }
  return Math.round(100 * (1 - Math.sqrt(distance / weight)));
}
export function sonicReasons(a,b) {
  if (!validSonicFeatures(a) || !validSonicFeatures(b)) return [];
  return FIELDS.map(key=>({key,delta:Math.abs(a[key]-b[key])}))
    .sort((x,y)=>x.delta-y.delta)
    .slice(0,3).map(x=>LABELS[x.key]);
}
export function sonicMoodHints(s) {
  if (!validSonicFeatures(s)) return [];
  const result=[];
  if (s.energy < .32 && s.movement < .45) result.push("calm / spacious");
  if (s.movement < .35 && s.pulse < .55) result.push("hypnotic / drifting");
  if (s.brightness < .34 && s.energy < .55) result.push("soft / muted");
  if (s.energy > .48 && s.movement > .48) result.push("driving / animated");
  if (s.texture > .40) result.push("textured / rough-edged");
  if (s.bass > .50) result.push("warm / bass-heavy");
  if (s.dynamics > .38) result.push("swelling / contrasting");
  return result.slice(0,3).length ? result.slice(0,3) : ["mixed / nuanced"];
}
export function rankSonicLibrary(reference, library) {
  if (!reference || !validSonicFeatures(reference.features)) return [];
  return normalizeSonicLibrary(library).filter(s=>s.id!==reference.id)
    .map(song=>({...song, similarity:sonicSimilarity(reference.features,song.features), reasons:sonicReasons(reference.features,song.features)}))
    .sort((a,b)=>b.similarity-a.similarity || a.id.localeCompare(b.id));
}
export function parseLocalTrackName(filename) {
  const stem=String(filename || "").replace(/\.[a-z0-9]{1,6}$/i,"").replace(/[_]+/g," ").trim().slice(0,200);
  const parts=stem.split(/\s+-\s+/);
  return parts.length >= 2 ? {artist:parts.shift().trim().slice(0,140),title:parts.join(" - ").trim().slice(0,140)}
    : {artist:"Unknown artist",title:stem || "Untitled"};
}

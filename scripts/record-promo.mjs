// Renders the promotional film (/promo) to an MP4, frame by frame.
// Requires the dev server (npm run dev) and ffmpeg with libx264.
//
// Usage:
//   node scripts/record-promo.mjs [baseUrl] [out.mp4] [fps]
//   node scripts/record-promo.mjs --frames 1,12.5,40   (writes sample PNGs)
import { createRequire } from "node:module";

// Playwright is preinstalled globally in this environment; locally run
// `npx playwright install chromium` and `npm i -D playwright` if needed.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const sampleIndex = args.indexOf("--frames");
const samples = sampleIndex >= 0 ? args[sampleIndex + 1].split(",").map(Number) : null;
const positional = args.filter((a, i) => !a.startsWith("--") && (sampleIndex < 0 || i !== sampleIndex + 1));
const baseUrl = positional[0] ?? "http://localhost:3000";
const out = positional[1] ?? "staerk50-praesentation.mp4";
const fps = Number(positional[2] ?? 30);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${baseUrl}/promo?record`, { waitUntil: "networkidle", timeout: 180_000 });
await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => typeof window.__setFilmTime === "function");
const duration = await page.evaluate(() => window.__filmDuration);

async function frameAt(seconds) {
  await page.evaluate((s) => window.__setFilmTime(s), seconds);
  return page.screenshot({ type: "png" });
}

if (samples) {
  mkdirSync("promo-frames", { recursive: true });
  for (const s of samples) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`promo-frames/frame-${String(s).replace(".", "_")}.png`, await frameAt(s));
    console.log(`frame ${s}s`);
  }
} else {
  const total = Math.round(duration * fps);
  const ffmpeg = spawn(
    "ffmpeg",
    ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  for (let i = 0; i < total; i++) {
    const png = await frameAt(i / fps);
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    if (i % (fps * 5) === 0) console.log(`${Math.round((i / total) * 100)}% (${(i / fps).toFixed(0)}s / ${duration}s)`);
  }
  ffmpeg.stdin.end();
  await new Promise((r) => ffmpeg.on("close", r));
  console.log(`Wrote ${out} (${duration}s, ${fps} fps)`);
}
await browser.close();

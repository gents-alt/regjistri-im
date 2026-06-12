// Rasterizes assets-src/icon.svg into the PNG icons the PWA + Android packaging need.
// Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = readFileSync(resolve(root, "assets-src/icon.svg"));
const pub = resolve(root, "public");
mkdirSync(pub, { recursive: true });

// "any" / launcher icons — full-bleed art is fine.
const square = [
  ["pwa-192x192.png", 192],
  ["pwa-512x512.png", 512],
  ["apple-touch-icon.png", 180],
  ["favicon-32x32.png", 32],
];

// Maskable icon: Android crops to a circle/squircle, so pad ~10% around the art.
async function maskable() {
  const size = 512;
  const inner = Math.round(size * 0.8);
  const art = await sharp(src).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#07101E" },
  })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toFile(resolve(pub, "maskable-512x512.png"));
  console.log("maskable-512x512.png");
}

for (const [name, size] of square) {
  await sharp(src).resize(size, size).png().toFile(resolve(pub, name));
  console.log(name);
}
await maskable();
console.log("Done.");

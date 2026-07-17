const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const source = path.join(root, "public", "Leeward-Launcher-Icon-Source-v3.png");
const res = path.join(root, "android", "app", "src", "main", "res");

if (!fs.existsSync(source)) {
  throw new Error(`Missing source icon: ${source}`);
}

const legacy = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const adaptiveForeground = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

async function writeIcon(folder, filename, size) {
  const outDir = path.join(res, folder);
  fs.mkdirSync(outDir, { recursive: true });

  await sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 95 })
    .toFile(path.join(outDir, filename));
}

async function main() {
  for (const [folder, size] of Object.entries(legacy)) {
    await writeIcon(folder, "ic_launcher.webp", size);
    await writeIcon(folder, "ic_launcher_round.webp", size);
  }

  for (const [folder, size] of Object.entries(adaptiveForeground)) {
    await writeIcon(folder, "ic_launcher_foreground.webp", size);
    await writeIcon(folder, "ic_launcher_monochrome.webp", size);
  }

  await sharp(source)
    .resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(path.join(root, "android", "app", "src", "main", "ic_launcher-playstore.png"));

  console.log("Leeward Android launcher icons regenerated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

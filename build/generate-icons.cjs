// Generátor ikon — z vektorového SVG vyrenderuje icon.png (512) a multi-size icon.ico.
// "M" je kreslené jako cesta (ne font), aby render nezávisel na nainstalovaném Inter.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = __dirname;

// Tmavé pozadí, fialový kruh, bílé "M"
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0d0d1a"/>
  <circle cx="256" cy="256" r="200" fill="#7C3AED"/>
  <path d="M176,340 L176,172 L256,284 L336,172 L336,340"
        fill="none" stroke="#ffffff" stroke-width="36"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Sestaví .ico kontejner s PNG-kódovanými obrázky (Windows Vista+ podporuje PNG v ICO)
function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // rezervováno
  header.writeUInt16LE(1, 2);      // typ 1 = ikona
  header.writeUInt16LE(count, 4);  // počet obrázků

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const bodies = [];

  images.forEach((img, i) => {
    const b = 16 * i;
    const dim = img.size >= 256 ? 0 : img.size;  // 256 se zapisuje jako 0
    dir.writeUInt8(dim, b);          // šířka
    dir.writeUInt8(dim, b + 1);      // výška
    dir.writeUInt8(0, b + 2);        // počet barev palety
    dir.writeUInt8(0, b + 3);        // rezervováno
    dir.writeUInt16LE(1, b + 4);     // barevné roviny
    dir.writeUInt16LE(32, b + 6);    // bitů na pixel
    dir.writeUInt32LE(img.data.length, b + 8);   // velikost dat
    dir.writeUInt32LE(offset, b + 12);           // offset dat
    offset += img.data.length;
    bodies.push(img.data);
  });

  return Buffer.concat([header, dir, ...bodies]);
}

async function main() {
  const svgBuf = Buffer.from(SVG);

  // icon.png 512×512
  await sharp(svgBuf).resize(512, 512).png().toFile(path.join(BUILD_DIR, 'icon.png'));

  // icon.ico — 16, 32, 48, 256
  const sizes = [16, 32, 48, 256];
  const images = [];
  for (const size of sizes) {
    const data = await sharp(svgBuf).resize(size, size).png().toBuffer();
    images.push({ size, data });
  }
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), buildIco(images));

  console.log('Ikony vygenerovány: build/icon.png, build/icon.ico');
}

main().catch((err) => {
  console.error('Generování ikon selhalo:', err);
  process.exit(1);
});

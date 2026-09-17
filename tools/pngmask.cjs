// Декодер PNG (grayscale+alpha / RGBA, без интерлейса) и запись PNG.
// Нужен только инструментам обводки — в игру не попадает.
const fs = require('fs');
const zlib = require('zlib');

function readMask(file) {
  const buf = fs.readFileSync(file);
  let p = 8, w, h, bd, ct;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); bd = buf[p + 16]; ct = buf[p + 17]; }
    if (type === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('bit depth ' + bd + ' не поддержан');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!ch) throw new Error('color type ' + ct + ' не поддержан');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += Math.floor((a + b) / 2);
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  const alphaIdx = ch === 2 ? 1 : ch === 4 ? 3 : -1;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mask[i] = alphaIdx < 0 ? 255 : out[i * ch + alphaIdx];
  }
  return { w, h, mask };
}

// Буфер на три байта в пикселе пишется как RGB, на четыре — как RGBA:
// круглой иконке нужна прозрачность за пределами круга.
function writePNG(file, w, h, rgb) {
  const ch = rgb.length / (w * h);
  if (ch !== 3 && ch !== 4) throw new Error('ожидалось 3 или 4 байта на пиксель, вышло ' + ch);
  const stride = w * ch;
  const rawOut = Buffer.alloc(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    rawOut[y * (1 + stride)] = 0;
    rgb.copy(rawOut, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const T = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    let crc = 0xffffffff;
    for (const b of td) crc = T[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const cb = Buffer.alloc(4); cb.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, td, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rawOut)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

module.exports = { readMask, writePNG };

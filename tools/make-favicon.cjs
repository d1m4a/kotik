// Круглые иконки вкладки из силуэта самого кота.
//
// Берётся сидящий анфас: на шестнадцати пикселях узнаётся только голова
// с ушами, и именно этот вид её и даёт. Рисуется он крупно и потом
// усредняется до нужного размера — иначе тонкие линии рассыпаются.
//
// Запуск: node tools/make-favicon.cjs

const { writePNG } = require('./pngmask.cjs');
const { makeStub, rasterize, newBuffer, toBytes } = require('./rasterize.cjs');

const SIZES = [16, 32, 180];
const SS = 8; // во сколько раз рисуем крупнее целевого размера
const PAPER = [230, 226, 218]; // тот же тон, что у страницы вокруг игры

// Усреднение SS×SS в один пиксель.
function downscale(big, w, h, ss) {
  const out = new Float64Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const i = ((y * ss + dy) * w * ss + x * ss + dx) * 3;
          r += big[i];
          g += big[i + 1];
          b += big[i + 2];
        }
      }
      const n = ss * ss;
      const o = (y * w + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return out;
}

// То же усреднение, но по одному каналу: для маски прозрачности.
function downscaleMask(big, w, h, ss) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) v += big[(y * ss + dy) * w * ss + x * ss + dx];
      }
      out[y * w + x] = v / (ss * ss);
    }
  }
  return out;
}

async function main() {
  const front = await import('../src/render/catFront.js');
  const { resetSeed } = await import('../src/render/pencil.js');

  // Окно по голове с плечами. Целиком сидящий кот на иконке не годится:
  // он вытянутый, в квадрат влезает мелко, а хвост по полу уходит за край
  // и превращается в тёмную полосу.
  const BOX = { x: 23, y: 13, w: 86, h: 86 };

  for (const size of SIZES) {
    const W = size * SS;
    const H = size * SS;
    const big = newBuffer(W, H, PAPER);

    // Квадратная иконка из вытянутого силуэта: масштаб по высоте, центр по X.
    const scale = (size * SS) / BOX.h;
    const offX = -BOX.x * scale + (W - BOX.w * scale) / 2;
    const offY = -BOX.y * scale;

    resetSeed(20260917);
    const { g, ops } = makeStub();
    front.drawCatFront(g, { sit: 1 });
    rasterize(ops, W, H, big, offX, scale, offY);

    const small = downscale(big, size, size, SS);

    // Прозрачность по кругу. Маска тоже считается крупно и усредняется,
    // иначе край круга выйдет лестницей.
    const R = (size * SS) / 2;
    const cover = new Float64Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - R;
        const dy = y + 0.5 - R;
        cover[y * W + x] = dx * dx + dy * dy <= R * R ? 255 : 0;
      }
    }
    const alpha = downscaleMask(cover, size, size, SS);

    const rgba = Buffer.alloc(size * size * 4);
    const px = toBytes(small);
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = px[i * 3];
      rgba[i * 4 + 1] = px[i * 3 + 1];
      rgba[i * 4 + 2] = px[i * 3 + 2];
      rgba[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(alpha[i])));
    }

    const file = 'public/favicon-' + size + '.png';
    writePNG(file, size, size, rgba);
    console.log(file, size + '×' + size);
  }
}

main();

// Оффлайн-растеризатор: то же рисование, что в игре, но без браузера.
//
// Рисовальному коду подсовывается заглушка Phaser.Graphics, которая копит
// полигоны, а растеризатор кладёт их в буфер. Этим живут и превью кота
// (preview-cat.cjs), и скриншот комнаты (screenshot.cjs).

// --- заглушка Graphics ------------------------------------------------------
function makeStub() {
  const ops = [];
  let fill = { color: 0, alpha: 1 };
  let line = { color: 0, alpha: 1, width: 1 };
  let path = [];
  let sub = null;
  const g = {
    fillStyle(color, alpha = 1) { fill = { color, alpha }; return g; },
    lineStyle(width, color, alpha = 1) { line = { color, alpha, width }; return g; },
    beginPath() { path = []; sub = null; return g; },
    moveTo(x, y) { sub = [[x, y]]; path.push(sub); return g; },
    lineTo(x, y) { if (!sub) { sub = []; path.push(sub); } sub.push([x, y]); return g; },
    closePath() { return g; },
    fillPath() { ops.push({ kind: 'fill', style: { ...fill }, path: path.map((s) => s.slice()) }); return g; },
    strokePath() { ops.push({ kind: 'stroke', style: { ...line }, path: path.map((s) => s.slice()) }); return g; },
    fillRect(x, y, w, h) {
      ops.push({ kind: 'fill', style: { ...fill }, path: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]] });
      return g;
    },
    clear() { ops.length = 0; return g; },
  };
  return { g, ops };
}

// --- растеризация -----------------------------------------------------------
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

// Окно отсечения на время одного rasterize: нужно виду за окном, который
// в игре обрезается проёмом, а здесь рисуется прямо в общий буфер.
let clip = null;

function blend(buf, w, h, x, y, col, a) {
  if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
  if (clip && (x < clip[0] || y < clip[1] || x >= clip[2] || y >= clip[3])) return;
  const i = (y * w + x) * 3;
  buf[i] = buf[i] * (1 - a) + col[0] * a;
  buf[i + 1] = buf[i + 1] * (1 - a) + col[1] * a;
  buf[i + 2] = buf[i + 2] * (1 - a) + col[2] * a;
}

function fillPoly(buf, w, h, poly, col, alpha) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of poly) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(h - 1, Math.ceil(maxY)); y++) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      if (y1 === y2) continue;
      const yc = y + 0.5;
      if (yc >= Math.min(y1, y2) && yc < Math.max(y1, y2)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.floor(xs[k]); x <= Math.ceil(xs[k + 1]); x++) blend(buf, w, h, x, y, col, alpha);
    }
  }
}

function strokeSeg(buf, w, h, x1, y1, x2, y2, col, alpha, width) {
  const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
  const r = Math.max(0.5, width / 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x1 + (x2 - x1) * t;
    const cy = y1 + (y2 - y1) * t;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.5) continue;
        blend(buf, w, h, Math.round(cx) + dx, Math.round(cy) + dy, col, alpha * Math.min(1, r + 0.5 - d));
      }
    }
  }
}

// offX/offY — куда сдвинуть нарисованное, scale — во сколько раз увеличить.
function rasterize(ops, w, h, buf, offX, scale, offY = 0, clipRect = null) {
  clip = clipRect;
  for (const op of ops) {
    const col = rgbOf(op.style.color);
    for (const sub of op.path) {
      if (sub.length < 2) continue;
      const moved = sub.map(([x, y]) => [x * scale + offX, y * scale + offY]);
      if (op.kind === 'fill') fillPoly(buf, w, h, moved, col, op.style.alpha);
      else for (let i = 0; i + 1 < moved.length; i++)
        strokeSeg(buf, w, h, moved[i][0], moved[i][1], moved[i + 1][0], moved[i + 1][1], col, op.style.alpha, op.style.width * scale);
    }
  }
  clip = null;
}

// Буфер под цвет бумаги: рисуем поверх него, как на листе.
function newBuffer(w, h, rgb = [242, 239, 232]) {
  const buf = new Float64Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    buf[i * 3] = rgb[0];
    buf[i * 3 + 1] = rgb[1];
    buf[i * 3 + 2] = rgb[2];
  }
  return buf;
}

function toBytes(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(buf[i])));
  return out;
}

module.exports = { makeStub, rasterize, newBuffer, toBytes, rgbOf, blend };

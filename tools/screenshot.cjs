// Скриншот для README: та же комната, что в игре, но собранная оффлайн.
//
// Снимать с браузера нечем, поэтому слои рисуются тем же кодом, что и в игре,
// и складываются в том же порядке, каждый со своей скоростью прокрутки.
//
// Запуск: node tools/screenshot.cjs [выходной.png] [прокрутка]

const { writePNG } = require('./pngmask.cjs');
const { makeStub, rasterize, newBuffer, toBytes } = require('./rasterize.cjs');

// Зерно бумаги: в игре это отдельный слой с умножением. Здесь хватает
// лёгкого шума — лист не должен быть идеально ровным.
function grain(buf, w, h, seed = 20260916) {
  let a = seed >>> 0;
  for (let i = 0; i < w * h; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const n = (((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5) * 7;
    buf[i * 3] += n;
    buf[i * 3 + 1] += n;
    buf[i * 3 + 2] += n;
  }
}

async function main() {
  const { CONFIG } = await import('../src/config.js');
  const room = await import('../src/data/roomLiving.js');
  const body = await import('../src/render/catBody.js');
  const pencil = await import('../src/render/pencil.js');
  const { SPOTS } = await import('../src/data/spots.js');
  const { HEX } = await import('../src/palette.js');

  const W = CONFIG.WIDTH;
  const H = CONFIG.HEIGHT;
  // Кадр выбран так, чтобы в него попали и часы, и окно, и кот на комоде.
  const scroll = Number(process.argv[3] || 700);
  const buf = newBuffer(W, H);
  const layer = (key) => room.LAYERS.find((l) => l.key === key);

  const ops = (draw) => {
    const { g, ops: list } = makeStub();
    draw(g);
    return list;
  };
  const paint = (list, offX = 0, offY = 0, clip = null) => rasterize(list, W, H, buf, offX, 1, offY, clip);

  room.resetRoomSeed();

  // Вид за окном. В игре это TileSprite в самом проёме: сам проём его
  // и обрезает. Здесь то же самое даёт окно отсечения, а повтор текстуры —
  // три прохода со сдвигом на её ширину.
  const win = room.WINDOW;
  const wall = -CONFIG.PARALLAX.WALL * scroll;
  const view = ops((g) => layer('view-window').draw(g));
  const viewW = layer('view-window').size[0];
  const shift = win.x + wall + (CONFIG.PARALLAX.WALL - CONFIG.PARALLAX.WINDOW) * scroll;
  const opening = [win.x + wall, win.y, win.x + wall + win.w, win.y + win.h];
  for (const k of [-1, 0, 1]) paint(view, shift + k * viewW, win.y, opening);

  paint(ops((g) => layer('layer-wall').draw(g)), wall);

  // Маятник — отдельная картинка и в игре: он единственное, что двигается.
  // Рисуется от точки подвеса и поворачивается вокруг неё.
  const C = room.CLOCK;
  const a = 0.17 * 0.75;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pend = ops((g) => {
    pencil.pencilLine(g, 0, 0, 0, C.penRod, { color: HEX.GRAPHITE_2, alpha: 0.9, width: 1.4, passes: 1, jitter: 0.4 });
    pencil.pencilCircle(g, 0, C.penRod, C.penBob, {
      color: HEX.GRAPHITE_2, alpha: 0.9, width: 1.3, fill: HEX.GRAPHITE_4, fillAlpha: 0.6,
    });
  });
  for (const op of pend) {
    op.path = op.path.map((s) => s.map(([x, y]) => [C.x + (x * ca - y * sa), C.pivotY + (x * sa + y * ca)]));
  }
  paint(pend, wall);

  paint(ops((g) => layer('layer-room').draw(g)), -scroll);

  // Кот спит на комоде под окном: поза показывает и силуэт, и мебель.
  const spot = SPOTS.find((s) => s.id === 'windowsill');
  paint(
    ops((g) => body.drawCatPose(g, spot.pose, 1, 0.4)),
    spot.x - scroll - body.CAT_W / 2,
    CONFIG.FLOOR_Y - spot.surface + body.CAT_FOOT_OFFSET - body.CAT_H
  );

  paint(ops((g) => layer('layer-fore').draw(g)), -CONFIG.PARALLAX.FORE * scroll);

  grain(buf, W, H);
  const file = process.argv[2] || 'docs/screenshot.png';
  writePNG(file, W, H, toBytes(buf));
  console.log(file, W + '×' + H, 'прокрутка', scroll);
}

main();

// Оффлайн-превью кадров кота: то же рисование, что в игре, но без браузера.
// Заглушка Graphics и растеризатор общие со скриншотом — в rasterize.cjs.
//
// Запуск: node tools/preview-cat.cjs [выходной.png]

const { writePNG } = require('./pngmask.cjs');
const { makeStub, rasterize, newBuffer, toBytes } = require('./rasterize.cjs');

async function main() {
  const mod = await import('../src/render/catBody.js');
  const { drawCatBody, CAT_W, CAT_H } = mod;

  // --poses: вместо цикла ходьбы показываем позы сна (пока старой анатомии).
  const front = await import('../src/render/catFront.js');
  const frontArg = process.argv.find((a) => a.startsWith('--front'));
  const propsArg = process.argv.includes('--props');
  const props = propsArg ? await import('../src/render/props.js') : null;
  const poseArg = process.argv.find((a) => a.startsWith('--pose='));
  const frames = [];
  if (propsArg) {
    frames.push({ prop: 'heart' }, { prop: 'fly' });
  } else if (frontArg) {
    // хвост: показываем восемь фаз одного маха
    const n = Number((process.argv.find((a) => a.startsWith('--frames=')) || '--frames=8').slice(9));
    for (let i = 0; i < n; i++) {
      frames.push({ front: { sit: 1, tailSwing: n === 1 ? 1 : -1 + (2 * i) / (n - 1) } });
    }
  } else if (poseArg) {
    for (const key of poseArg.slice(7).split(',')) {
      if (key.includes(':')) {
        const [name, steps] = key.split(':');
        for (let i = 0; i <= Number(steps); i++) frames.push({ poseKey: name, k: i / Number(steps) });
      } else frames.push({ poseKey: key });
    }
  } else {
    const walkN = Number((process.argv.find((a) => a.startsWith('--walk=')) || '--walk=4').slice(7));
    for (let i = 0; i < walkN; i++) frames.push({ t: i / walkN, walking: true, breath: 0.3 });
    frames.push({ t: 0, breath: 0 }); // стойка
  }

  const SCALE = Number(process.argv[3] || 3);
  const W = Math.round(CAT_W * SCALE) * frames.length;
  const H = Math.round(CAT_H * SCALE);
  const buf = newBuffer(W, H);

  frames.forEach((f, i) => {
    const { g, ops } = makeStub();
    if (f.prop) props[f.prop === 'heart' ? 'drawHeart' : 'drawFly'](g);
    else if (f.front) front.drawCatFront(g, f.front);
    else if (f.poseKey) mod.drawCatPose(g, f.poseKey, f.k === undefined ? 1 : f.k, 0.4);
    else drawCatBody(g, f);
    rasterize(ops, W, H, buf, i * Math.round(CAT_W * SCALE), SCALE);
  });

  const out = toBytes(buf);
  const file = process.argv[2] || 'cat-frames.png';
  writePNG(file, W, H, out);
  console.log('кадров:', frames.length, '→', file, W + '×' + H);
}

main();

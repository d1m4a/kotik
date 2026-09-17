// Титульный экран. Нужен не ради красоты: браузер не даёт запускать звук
// до первого клика или нажатия клавиши, и без этого экрана мурчание просто
// не заведётся (раздел 7 дизайн-документа).

import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { PALETTE, HEX } from '../palette.js';
import { PaperOverlay } from '../systems/PaperOverlay.js';
import { pencilLine, pencilRect, resetSeed } from '../render/pencil.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const { WIDTH, HEIGHT } = CONFIG;
    resetSeed(777);

    const g = this.add.graphics();
    pencilLine(g, WIDTH / 2 - 150, HEIGHT / 2 - 46, WIDTH / 2 + 150, HEIGHT / 2 - 46, {
      color: HEX.GRAPHITE_3,
      alpha: 0.7,
      width: 1,
      passes: 1,
    });
    pencilRect(g, WIDTH / 2 - 92, HEIGHT / 2 + 26, 184, 46, { color: HEX.GRAPHITE_2, alpha: 0.9, width: 1.3 });

    this.add
      .text(WIDTH / 2, HEIGHT / 2 - 90, 'КотЪ', {
        fontFamily: 'Georgia, serif',
        fontSize: '46px',
        color: PALETTE.GRAPHITE_1,
      })
      .setOrigin(0.5);

    this.add
      .text(WIDTH / 2, HEIGHT / 2 - 16, 'уютная игра про поиск места для сна', {
        fontFamily: 'Georgia, serif',
        fontSize: '15px',
        color: PALETTE.GRAPHITE_2,
      })
      .setOrigin(0.5);

    this.add
      .text(WIDTH / 2, HEIGHT / 2 + 49, 'Начать', {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: PALETTE.GRAPHITE_1,
      })
      .setOrigin(0.5);

    this.add
      .text(WIDTH / 2, HEIGHT - 54, '← → или A / D — идти  ·  клик по комнате — идти туда  ·  пробел — лечь', {
        fontFamily: 'Georgia, serif',
        fontSize: '13px',
        color: PALETTE.GRAPHITE_3,
      })
      .setOrigin(0.5);

    new PaperOverlay(this);

    this.input.once('pointerdown', () => this.begin());
    this.input.keyboard.once('keydown', () => this.begin());
  }

  begin() {
    // Разблокировка звука должна произойти именно внутри обработчика ввода.
    const ctx = this.sound && this.sound.context;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    this.scene.start('Game');
  }
}

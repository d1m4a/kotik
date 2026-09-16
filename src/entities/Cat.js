// Кот: спрайт плюс конечный автомат. Каждое состояние — объект с
// enter/update/exit, никакого if/else в главном цикле.
// Физики нет: движение — это x += speed * dt.
//
// Про сцену кот не знает: всё наружу уходит через колбэки в deps.

import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT_FOOT_OFFSET } from '../render/catBody.js';
import { MICRO_EVENTS, poseAnims, lookFrame } from '../data/animations.js';

export const STATE = {
  IDLE_STAND: 'IDLE_STAND',
  WALK: 'WALK',
  PROMPT: 'PROMPT',
  ENTERING: 'ENTERING',
  SLEEPING: 'SLEEPING',
  WAKING: 'WAKING',
  GOING_TO_WALL: 'GOING_TO_WALL',
  WALL_STARE: 'WALL_STARE',
  WALL_RISE: 'WALL_RISE',
  GOING_TO_CLOCK: 'GOING_TO_CLOCK',
  CLOCK_WATCH: 'CLOCK_WATCH',
};

const STATES = {
  [STATE.IDLE_STAND]: {
    enter(cat) {
      cat.sprite.play('cat-idle');
    },
    update(cat, dt, intent) {
      if (cat.desiredDir(intent) !== 0) {
        cat.setState(STATE.WALK);
        return;
      }
      // Стоим у места для сна — предлагаем лечь.
      const spot = cat.deps.spots.nearest(cat.x);
      if (spot) {
        cat.spot = spot;
        cat.setState(STATE.PROMPT);
      }
    },
  },

  [STATE.WALK]: {
    enter(cat) {
      cat.sprite.play('cat-walk');
    },
    update(cat, dt, intent) {
      const dir = cat.desiredDir(intent);
      if (dir === 0) {
        cat.setState(STATE.IDLE_STAND);
        return;
      }
      cat.face(dir);

      const next = cat.x + dir * CONFIG.CAT_SPEED * dt;
      cat.x = Phaser.Math.Clamp(next, CONFIG.WORLD_LEFT, CONFIG.WORLD_RIGHT);
      cat.sprite.x = cat.x;

      // Дошли до цели клика или упёрлись в край мира — цель снимается.
      if (intent.target !== null) {
        const arrived = Math.abs(intent.target - cat.x) <= CONFIG.ARRIVE_EPS;
        const stuck = cat.x <= CONFIG.WORLD_LEFT || cat.x >= CONFIG.WORLD_RIGHT;
        if (arrived || stuck) {
          intent.clearTarget();
          cat.setState(STATE.IDLE_STAND);
        }
      }
    },
  },

  [STATE.PROMPT]: {
    enter(cat) {
      cat.sprite.play('cat-idle');
      cat.deps.onPrompt(cat.spot);
    },
    update(cat, dt, intent) {
      if (cat.desiredDir(intent) !== 0) {
        cat.setState(STATE.WALK);
        return;
      }
      if (intent.consumeAction()) {
        cat.setState(STATE.ENTERING);
        return;
      }
      // Место могло стать недоступным по времени суток (Фаза 4).
      if (cat.deps.spots.nearest(cat.x) !== cat.spot) cat.setState(STATE.IDLE_STAND);
    },
    exit(cat) {
      cat.deps.onPromptHide();
    },
  },

  [STATE.ENTERING]: {
    enter(cat) {
      cat.x = cat.spot.x;
      cat.sprite.x = cat.x;
      cat.face(cat.spot.facing === 'left' ? -1 : 1);
      const sit = () => cat.playOnce(poseAnims(cat.spot.pose).sit, () => cat.setState(STATE.SLEEPING));
      // Место может быть выше пола (комод, диван) — сначала запрыгнуть.
      if (cat.spot.surface) cat.hopTo(cat.surfaceY(cat.spot), sit);
      else sit();
    },
    update() {},
  },

  [STATE.SLEEPING]: {
    enter(cat, intent) {
      cat.sprite.play(poseAnims(cat.spot.pose).sleep);
      // Запоминаем счётчик ввода: разбудит ЛЮБОЕ следующее нажатие,
      // но не то, которым кота уложили.
      cat.wakeSeq = intent.seq;
      cat.sleepTime = 0;
      cat.deps.onSleepStart(cat.spot);
    },
    update(cat, dt, intent) {
      if (intent.seq !== cat.wakeSeq) {
        intent.clearTarget();
        intent.consumeAction();
        cat.setState(STATE.WAKING);
        return;
      }
      // Выспался — встаёт сам и идёт к стене. Отдельного таймера бездействия
      // тут не надо: спящего будит любое нажатие, так что счёт и так идёт
      // ровно с того момента, как его перестали трогать.
      cat.sleepTime += dt;
      if (cat.sleepTime >= CONFIG.SLEEP_TIMEOUT) {
        cat.wakeTo = STATE.GOING_TO_WALL;
        cat.setState(STATE.WAKING);
      }
    },
    exit(cat) {
      cat.deps.onSleepEnd(cat.spot);
    },
  },

  [STATE.WAKING]: {
    enter(cat) {
      // wakeTo — куда идти, встав. Разбуженный игроком кот просто остаётся
      // стоять, выспавшийся сам уходит к стене.
      const next = cat.wakeTo || STATE.IDLE_STAND;
      cat.wakeTo = null;
      cat.playOnce(poseAnims(cat.spot.pose).wake, () => {
        if (cat.spot.surface) cat.hopTo(cat.floorY(), () => cat.setState(next));
        else cat.setState(next);
      });
    },
    update() {},
  },

  // Игрок долго ничего не нажимал — кот сам идёт к ближайшему краю комнаты.
  [STATE.GOING_TO_WALL]: {
    enter(cat, intent) {
      cat.wakeSeq = intent.seq;
      const toLeft = cat.x - CONFIG.WORLD_LEFT < CONFIG.WORLD_RIGHT - cat.x;
      cat.wallX = toLeft ? CONFIG.WORLD_LEFT : CONFIG.WORLD_RIGHT;
      cat.face(toLeft ? -1 : 1);
      cat.sprite.play('cat-walk');
    },
    update(cat, dt, intent) {
      // Любой ввод возвращает управление игроку.
      if (intent.seq !== cat.wakeSeq) {
        cat.setState(STATE.IDLE_STAND);
        return;
      }
      const dir = Math.sign(cat.wallX - cat.x);
      const next = cat.x + dir * CONFIG.CAT_SPEED * dt;
      const done = dir > 0 ? next >= cat.wallX : next <= cat.wallX;
      cat.x = done ? cat.wallX : next;
      cat.sprite.x = cat.x;
      if (done) cat.setState(STATE.WALL_STARE);
    },
  },

  // Сидит анфас и залипает, глядя на игрока. Чем дольше сидит, тем реже
  // микрособытия — визуально кот застывает.
  [STATE.WALL_STARE]: {
    enter(cat, intent) {
      cat.wakeSeq = intent.seq;
      cat.microCount = 0;
      cat.stareTime = 0;
      cat.microTimer = cat.nextMicroDelay();
      cat.blinkTimer = cat.nextBlinkDelay();
      cat.meowTimer = cat.nextMeowDelay();
      cat.backReady = false;
      cat.playOnce('cat-front-sit', () => {
        cat.backReady = true;
        cat.sprite.play('cat-front');
      });
      cat.deps.onWallStare(true);
    },
    update(cat, dt, intent) {
      if (intent.seq !== cat.wakeSeq) {
        intent.clearTarget();
        intent.consumeAction();
        cat.setState(STATE.WALL_RISE);
        return;
      }
      if (!cat.backReady) return;

      cat.stareTime += dt;
      cat.blinkTimer -= dt;
      cat.meowTimer -= dt;
      cat.microTimer -= dt;

      // Одноразовые анимации не перебивают друг друга: если сейчас играет
      // моргание или мяуканье, событие подождёт до возвращения в цикл.
      const busy = cat.sprite.anims.currentAnim && cat.sprite.anims.currentAnim.key !== 'cat-front';

      // Досидел своё — встаёт и идёт смотреть на маятник часов.
      if (cat.stareTime >= CONFIG.CLOCK_WATCH_AFTER && !busy) {
        cat.riseTo = STATE.GOING_TO_CLOCK;
        cat.setState(STATE.WALL_RISE);
        return;
      }

      if (cat.meowTimer <= 0 && !busy) {
        cat.meowTimer = cat.nextMeowDelay();
        cat.deps.onMeow();
        cat.playOnce('cat-front-meow', () => cat.sprite.play('cat-front'));
        return;
      }

      if (cat.blinkTimer <= 0 && !busy) {
        cat.blinkTimer = cat.nextBlinkDelay();
        cat.playOnce('cat-front-blink', () => cat.sprite.play('cat-front'));
        return;
      }

      if (cat.microTimer > 0 || busy) return;

      cat.microCount += 1;
      cat.microTimer = cat.nextMicroDelay();
      const key = MICRO_EVENTS[Math.floor(Math.random() * MICRO_EVENTS.length)];
      cat.playOnce(key, () => cat.sprite.play('cat-front'));
    },
    exit(cat) {
      cat.deps.onWallStare(false);
    },
  },

  [STATE.WALL_RISE]: {
    enter(cat) {
      // riseTo — куда идти после подъёма. По умолчанию управление
      // возвращается игроку, но кот встаёт и сам, чтобы пойти к часам.
      const next = cat.riseTo || STATE.IDLE_STAND;
      cat.riseTo = null;
      cat.playOnce('cat-front-rise', () => cat.setState(next));
    },
    update() {},
  },

  // Насмотревшись в стену, кот идёт под часы.
  //
  // «Под часами» — не постоянная мировая точка: часы висят на слое стены
  // и едут медленнее пола, так что нужное место зависит от того, где встанет
  // камера. Гнаться за уезжающей целью каждый кадр бесполезно, она успокоится
  // только вместе с камерой; поэтому место считается сразу, один раз
  // (см. clockStand в GameScene).
  [STATE.GOING_TO_CLOCK]: {
    enter(cat, intent) {
      cat.wakeSeq = intent.seq;
      cat.clockStandX = cat.deps.clockStand(cat.x);
      cat.face(Math.sign(cat.clockStandX - cat.x) || cat.facing);
      cat.sprite.play('cat-walk');
    },
    update(cat, dt, intent) {
      if (intent.seq !== cat.wakeSeq) {
        cat.setState(STATE.IDLE_STAND);
        return;
      }
      const dir = Math.sign(cat.clockStandX - cat.x);
      const next = cat.x + dir * CONFIG.CAT_SPEED * dt;
      const done = dir === 0 || (dir > 0 ? next >= cat.clockStandX : next <= cat.clockStandX);
      cat.x = done ? cat.clockStandX : next;
      cat.sprite.x = cat.x;
      if (done) cat.setState(STATE.CLOCK_WATCH);
    },
  },

  // Смотрит на маятник. Кадр берётся прямо по его положению, а не анимацией:
  // анимация шла бы по своему таймеру и разъехалась бы с часами за минуту.
  [STATE.CLOCK_WATCH]: {
    enter(cat, intent) {
      cat.wakeSeq = intent.seq;
      cat.backReady = false;
      cat.tilting = false;
      cat.tiltTimer = cat.nextTiltDelay();
      cat.playOnce('cat-front-sit', () => {
        cat.backReady = true;
        // Дальше кадры ставим сами, анимация тут только мешала бы.
        cat.sprite.anims.stop();
      });
      cat.deps.onWallStare(true);
    },
    update(cat, dt, intent) {
      if (intent.seq !== cat.wakeSeq) {
        intent.clearTarget();
        intent.consumeAction();
        cat.setState(STATE.WALL_RISE);
        return;
      }
      if (!cat.backReady) return;

      // Иногда кот отрывается от маятника и склоняет голову набок. Пока идёт
      // этот жест, кадры ставит анимация, а не слежение за часами — иначе
      // они дрались бы за одну и ту же текстуру.
      if (cat.tilting) return;
      cat.tiltTimer -= dt;
      if (cat.tiltTimer <= 0) {
        cat.tiltTimer = cat.nextTiltDelay();
        cat.tilting = true;
        cat.playOnce(Math.random() < 0.5 ? 'cat-front-tilt' : 'cat-front-tilt2', () => {
          cat.tilting = false;
        });
        return;
      }

      // Отражённому спрайту взгляд тоже отражается, иначе кот следил бы
      // за маятником в противоход.
      const look = cat.sprite.flipX ? -cat.deps.pendulumLook() : cat.deps.pendulumLook();
      cat.sprite.setTexture(lookFrame(look));
    },
    exit(cat) {
      cat.deps.onWallStare(false);
    },
  },

};

export class Cat {
  constructor(scene, x, deps) {
    this.scene = scene;
    this.x = x;
    this.facing = 1;
    this.onFacingChange = null;
    this.spot = null;
    this.wakeSeq = 0;
    this.wallX = 0;
    this.microCount = 0;
    this.microTimer = 0;
    this.blinkTimer = 0;
    this.meowTimer = 0;
    this.backReady = false;
    this.deps = deps;

    this.sprite = scene.add
      .sprite(x, CONFIG.FLOOR_Y + CAT_FOOT_OFFSET, 'cat_idle_0')
      .setOrigin(0.5, 1)
      .setDepth(CONFIG.DEPTH.CAT);

    this.state = null;
    this.setState(STATE.IDLE_STAND, { seq: 0 });
  }

  setState(name, intent) {
    if (this.state === name) return;
    const prev = STATES[this.state];
    if (prev && prev.exit) prev.exit(this);
    this.state = name;
    STATES[name].enter(this, intent || this.lastIntent || { seq: 0 });
  }

  floorY() {
    return CONFIG.FLOOR_Y + CAT_FOOT_OFFSET;
  }

  surfaceY(spot) {
    return CONFIG.FLOOR_Y - (spot.surface || 0) + CAT_FOOT_OFFSET;
  }

  // Запрыгивание и спрыгивание. Заглушка: движение по вертикали без
  // отдельной анимации прыжка — она появится вместе с настоящими рисунками.
  hopTo(y, onDone) {
    this.scene.tweens.add({
      targets: this.sprite,
      y,
      duration: 260,
      ease: 'Sine.easeOut',
      onComplete: onDone,
    });
  }

  playOnce(key, onDone) {
    this.sprite.off('animationcomplete');
    this.sprite.play(key);
    this.sprite.once('animationcomplete', onDone);
  }

  // Куда кот хочет идти: клавиши сильнее цели клика.
  desiredDir(intent) {
    if (intent.keyDir !== 0) return intent.keyDir;
    if (intent.target === null) return 0;
    const dx = intent.target - this.x;
    return Math.abs(dx) <= CONFIG.ARRIVE_EPS ? 0 : Math.sign(dx);
  }

  // Моргание и мяуканье со временем не редеют: живой кот моргает часто,
  // сколько бы он ни сидел.
  nextBlinkDelay() {
    return CONFIG.BLINK_MIN + Math.random() * (CONFIG.BLINK_MAX - CONFIG.BLINK_MIN);
  }

  nextTiltDelay() {
    return CONFIG.TILT_MIN + Math.random() * (CONFIG.TILT_MAX - CONFIG.TILT_MIN);
  }

  nextMeowDelay() {
    return CONFIG.MEOW_MIN + Math.random() * (CONFIG.MEOW_MAX - CONFIG.MEOW_MIN);
  }

  // Интервал микрособытия растёт с каждым разом, но не бесконечно.
  nextMicroDelay() {
    const base = CONFIG.MICRO_EVENT_MIN + Math.random() * (CONFIG.MICRO_EVENT_MAX - CONFIG.MICRO_EVENT_MIN);
    return Math.min(CONFIG.MICRO_EVENT_CAP, base * Math.pow(CONFIG.MICRO_EVENT_DECAY, this.microCount));
  }

  face(dir) {
    if (dir === 0 || dir === this.facing) return;
    this.facing = dir;
    // Текстура нарисована мордой вправо.
    this.sprite.setFlipX(dir < 0);
    if (this.onFacingChange) this.onFacingChange(dir);
  }

  update(dt, intent) {
    this.lastIntent = intent;
    STATES[this.state].update(this, dt, intent);
  }
}

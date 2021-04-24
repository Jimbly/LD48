/*eslint global-require:off*/
const local_storage = require('./glov/local_storage.js');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

const assert = require('assert');
const camera2d = require('./glov/camera2d.js');
const engine = require('./glov/engine.js');
const { abs, floor } = Math;
const input = require('./glov/input.js');
const { KEYS, PAD } = input;
const net = require('./glov/net.js');
const ui = require('./glov/ui.js');
const { randCreate } = require('./glov/rand_alea.js');
const sprites = require('./glov/sprites.js');
const { clamp } = require('../common/util.js');
const { vec2, v2floor, v2set, vec4 } = require('./glov/vmath.js');

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.LEVEL = 10;
Z.PLAYER = 12;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// Virtual viewport for our game logic
const game_width = 384;
const game_height = 256;

const TILE_SOLID = 0;
const TILE_ORE = 1;
const TILE_LAVA = 2;
const TILE_OPEN = 3;
const TILE_BRIDGE = 4;
const TILE_PIT = 5;
const TILE_INVISIBLE = 7;

const DIG_LEN = 5;

const BOARD_W = 48;
const BOARD_H = 32;
const TILE_W = 16;
const BOARD_W_PX = BOARD_W * TILE_W;
const BOARD_H_PX = BOARD_H * TILE_W;
const color_black = vec4(0,0,0,1);
const color_white = vec4(1,1,1,1);
const color_next_level = vec4(0.5,0.5,0.5,1);
const color_player_lower = vec4(1, 1, 1, 0.25);

let sprite_active;
let sprite_solid;
let sprite_tiles;
let sprite_dwarf;

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

const DX_ABOVE = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
const DY_ABOVE = [-1, -1, -1, 0, 0, 0, 1, 1, 1];

const DIG_DX = [-1, 0, 1, 0, 0];
const DIG_DY = [0, 0, 0, -1, 1];

function canSeeThrough(tile) {
  return tile === TILE_BRIDGE || tile === TILE_PIT;
}

class Level {
  constructor(seed) {
    this.w = BOARD_W;
    this.h = BOARD_H;
    this.map = [];
    this.visible = [];
    for (let ii = 0; ii < this.h; ++ii) {
      this.map[ii] = [];
      this.visible[ii] = [];
      for (let jj = 0; jj < this.w; ++jj) {
        this.map[ii].push(TILE_SOLID);
        this.visible[ii].push(false);
      }
    }
    let rand = randCreate(seed);
    for (let ii = 0; ii < 30; ++ii) {
      let w = 2 + rand.range(8);
      let h = 2 + rand.range(8);
      let x = 1 + rand.range(BOARD_W - w - 2);
      let y = 1 + rand.range(BOARD_H - h - 2);
      for (let yy = 0; yy < h; ++yy) {
        for (let xx = 0; xx < w; ++xx) {
          this.map[y + yy][x + xx] = rand.random() < 0.2 ? TILE_BRIDGE : TILE_OPEN;
        }
      }
      if (!ii) {
        this.spawn_pos = vec2(floor(x + w/2) + 0.5, floor(y + h/2) + 0.5);
      }
    }
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return TILE_SOLID;
    }
    return this.map[y][x];
  }

  isSolid(x, y) {
    let t = this.get(x, y);
    return t === TILE_SOLID;
  }

  draw(z, color, next_level) {
    for (let yy = 0; yy < this.h; ++yy) {
      let row = this.map[yy];
      let vrow = this.visible[yy];
      for (let xx = 0; xx < this.w; ++xx) {
        if (vrow[xx]) {
          let tile = row[xx];
          if (next_level && canSeeThrough(tile) && !next_level.visible[yy][xx]) {
            next_level.setVisibleFromAbove(xx, yy);
          }
          sprite_tiles.draw({
            x: xx * TILE_W,
            y: yy * TILE_W,
            z,
            frame: tile,
            color,
          });
        } else {
          sprite_solid.draw({
            x: xx * TILE_W,
            y: yy * TILE_W,
            z,
            color: color_black,
          });
        }
      }
    }
  }

  setVisible(x, y) {
    let todo = [];
    todo.push(x,y);
    while (todo.length) {
      y = todo.pop();
      x = todo.pop();
      // if (this.visible[y][x]) {
      //   continue;
      // }
      this.visible[y][x] = true;
      if (this.isSolid(x, y)) {
        continue;
      }
      for (let ii = 0; ii < DX.length; ++ii) {
        let xx = x + DX[ii];
        let yy = y + DY[ii];
        if (!this.visible[yy][xx]) {
          todo.push(xx,yy);
        }
      }
    }
  }
  setVisibleFromAbove(x, y) {
    for (let ii = 0; ii < DX_ABOVE.length; ++ii) {
      this.visible[y + DY_ABOVE[ii]][x + DX_ABOVE[ii]] = true;
    }
  }
}

class GameState {
  constructor() {
    this.cur_level = new Level('1');
    this.next_level = new Level('2');
    this.pos = this.cur_level.spawn_pos;
    this.active_pos = v2floor(vec2(), this.pos);
  }

  draw() {
    camera2d.setAspectFixed(game_width, game_height);
    let posx = this.pos[0] * TILE_W;
    let posy = this.pos[1] * TILE_W;
    let shift_start = TILE_W * 5;
    let shiftx = clamp((posx - shift_start) / (BOARD_W_PX - shift_start * 2), 0, 1) * (BOARD_W_PX - game_width);
    let shifty = clamp((posy - shift_start) / (BOARD_H_PX - shift_start * 2), 0, 1) * (BOARD_H_PX - game_height);
    camera2d.shift(shiftx, shifty);
    let show_lower = input.keyDown(KEYS.SHIFT);
    let dig_action;
    if (!show_lower) {
      this.cur_level.draw(Z.LEVEL, color_white, this.next_level);
      let ax = this.active_pos[0];
      let ay = this.active_pos[1];
      let tile = this.cur_level.get(ax, ay);
      if ((tile === TILE_SOLID || tile === TILE_OPEN) &&
        ax > 0 && ay > 0 && ax < BOARD_W - 1 && ay < BOARD_H - 1
      ) {
        sprite_active.draw({
          x: ax * TILE_W,
          y: ay * TILE_W,
          z: Z.PLAYER - 1,
        });
        dig_action = tile === TILE_SOLID ? 'tunnel' : 'hole';
      }
    }
    sprite_dwarf.draw({
      x: posx,
      y: posy,
      z: Z.PLAYER,
      color: show_lower ? color_player_lower : color_white,
    });
    camera2d.zoom(posx, posy, 0.95);
    this.next_level.draw(Z.LEVEL - 2, show_lower ? color_white : color_next_level);
    camera2d.setAspectFixed(game_width, game_height);
    if (dig_action) {
      if (ui.button({
        text: `[space] Dig ${dig_action}`,
        x: game_width - ui.button_width,
        y: game_height - ui.button_height,
      }) || input.keyDownEdge(KEYS.SPACE)) {
        let ix = floor(this.pos[0]);
        let iy = floor(this.pos[1]);
        if (dig_action === 'hole') {
          for (let ii = 0; ii < DIG_DX.length; ++ii) {
            let yy = iy + DIG_DY[ii];
            let xx = ix + DIG_DX[ii];
            if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
              continue;
            }
            if (this.cur_level.map[yy][xx] === TILE_OPEN) {
              this.cur_level.map[yy][xx] = TILE_BRIDGE;
            }
          }
        } else {
          assert(ix !== this.active_pos[0] || iy !== this.active_pos[1]);
          let dx = this.active_pos[0] - ix;
          let dy = this.active_pos[1] - iy;
          for (let ii = 1; ii <= DIG_LEN; ++ii) {
            let yy = iy + dy * ii;
            let xx = ix + dx * ii;
            if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
              break;
            }
            if (this.cur_level.map[yy][xx] === TILE_SOLID) {
              this.cur_level.map[yy][xx] = TILE_OPEN;
              this.cur_level.setVisible(xx, yy);
            } else {
              break;
            }
          }
        }
      }
    }
  }

  update() {
    let dx = 0;
    dx -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A) + input.padButtonDown(PAD.LEFT);
    dx += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D) + input.padButtonDown(PAD.RIGHT);
    let dy = 0;
    dy -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W) + input.padButtonDown(PAD.UP);
    dy += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S) + input.padButtonDown(PAD.DOWN);
    // if (dx < 0) {
    //   sprites.animation.setState('idle_left');
    // } else if (dx > 0) {
    //   sprites.animation.setState('idle_right');
    // }

    dx *= 0.005;
    dy *= 0.005;
    let { pos, cur_level } = this;
    let ix = floor(pos[0]);
    let iy = floor(pos[1]);
    let x2 = pos[0] + dx;
    let ix2 = floor(x2);
    let y2 = pos[1] + dy;
    let iy2 = floor(y2);
    v2set(this.active_pos, abs(dx) >= abs(dy) ? ix2 : ix, abs(dy) > abs(dx) ? iy2 : iy);
    if (ix !== ix2) {
      if (cur_level.isSolid(ix2, iy)) {
        x2 = ix2 > ix ? ix + 0.999 : ix;
      }
    }
    if (iy !== iy2) {
      if (cur_level.isSolid(ix, iy2)) {
        y2 = iy2 > iy ? iy + 0.999 : iy;
      }
    }

    cur_level.setVisible(ix, iy);

    pos[0] = x2;
    pos[1] = y2;
  }
}

export function main() {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    net.init({ engine });
  }

  const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = 'on';
  let font;
  if (pixely === 'strict') {
    font = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };
  } else if (pixely && pixely !== 'off') {
    font = { info: font_info_04b03x2, texture: 'font/04b03_8x2' };
  } else {
    font = { info: font_info_palanquin32, texture: 'font/palanquin32' };
  }

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font,
    viewport_postprocess: false,
    antialias: false,
  })) {
    return;
  }
  font = engine.font;

  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  sprite_tiles = sprites.create({
    name: 'tiles',
    size: vec2(TILE_W, TILE_W),
    ws: [16, 16, 16],
    hs: [16, 16, 16],
    origin: vec2(0,0),
  });
  sprite_dwarf = sprites.create({
    name: 'dwarf',
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0.5, 0.5),
  });
  sprite_solid = sprites.create({
    url: 'white',
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0,0),
  });
  sprite_active = sprites.create({
    name: 'active',
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0, 0),
  });

  let state;

  function play(dt) {
    gl.clearColor(0, 0, 0, 1);
    state.update();
    state.draw();
  }

  function playInit(dt) {
    state = new GameState();
    engine.setState(play);
    play(dt);
  }

  engine.setState(playInit);
}

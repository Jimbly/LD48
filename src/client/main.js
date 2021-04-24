/*eslint global-require:off*/
const local_storage = require('./glov/local_storage.js');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

const assert = require('assert');
const camera2d = require('./glov/camera2d.js');
const engine = require('./glov/engine.js');
const glov_font = require('./glov/font.js');
const { abs, floor, random } = Math;
const input = require('./glov/input.js');
const { KEYS, PAD } = input;
const net = require('./glov/net.js');
const ui = require('./glov/ui.js');
const { mashString, randCreate } = require('./glov/rand_alea.js');
const sprites = require('./glov/sprites.js');
const { clamp } = require('../common/util.js');
const { vec2, v2floor, v2set, vec4, v4set } = require('./glov/vmath.js');

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
const TILE_GEM = 1;
const TILE_LAVA = 2;
const TILE_OPEN = 3;
const TILE_BRIDGE = 4;
const TILE_PIT = 5;
const TILE_GEM_UI = 6;
const TILE_INVISIBLE = 7;
const TILE_CRACKED = 8;
const TILE_SHOVEL = 9;

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
const color_debug_visible = vec4(0.8,0.5,0.8,1);

let sprite_active;
let sprite_solid;
let sprite_tiles;
let sprite_tiles_ui;
let sprite_dwarf;

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

const DX_ABOVE = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
const DY_ABOVE = [-1, -1, -1, 0, 0, 0, 1, 1, 1];

const DIG_DX = [-1, 0, 1, 0, 0];
const DIG_DY = [0, 0, 0, -1, 1];

const GEM_DELTA = [
  // adjacent
  [-1, 0], [0, -1], [0, 1], [1, 0],
  // again and again
  [-1, 0], [0, -1], [0, 1], [1, 0],
  [-1, 0], [0, -1], [0, 1], [1, 0],
  [-1, 0], [0, -1], [0, 1], [1, 0],
  // diagonals w/ crack
  [-1, -1, -1, 0],
  [-1, 1, 0, 1],
  [1, -1, 0, -1],
  [1, 1, 1, 0],
  // skip  w/ crack
  [-2, 0, -1, 0],
  [2, 0, 1, 0],
  [0, -2, 0, -1],
  [0, 2, 0, 1],
];

function canSeeThroughToBelow(tile) {
  return tile === TILE_BRIDGE || tile === TILE_PIT;
}
function isSolid(tile) {
  return tile === TILE_SOLID || tile === TILE_CRACKED;
}
function canSeeThrough(tile) {
  return !isSolid(tile)
}
function canWalkThrough(tile) {
  return tile === TILE_BRIDGE || tile === TILE_OPEN || tile === TILE_GEM;
}

let debug_zoom = engine.DEBUG;
let debug_visible = engine.DEBUG;
let debug_freecam = false;

const style_overlay = glov_font.style(null, {
  color: 0xFFFFFFff,
  outline_width: 2,
  outline_color: 0x000000ff,
});
const style_hint = glov_font.style(style_overlay, {
  color: 0x808080ff,
});
let font;

class Level {
  constructor(seed) {
    this.w = BOARD_W;
    this.h = BOARD_H;
    let map = this.map = [];
    this.visible = [];
    for (let ii = 0; ii < this.h; ++ii) {
      map[ii] = [];
      this.visible[ii] = [];
      for (let jj = 0; jj < this.w; ++jj) {
        map[ii].push(TILE_SOLID);
        this.visible[ii].push(false);
      }
    }
    let rand = randCreate(seed);
    // rooms
    for (let ii = 0; ii < 20; ++ii) {
      let w = 2 + rand.range(8);
      let h = 2 + rand.range(8);
      let x = 1 + rand.range(BOARD_W - w - 2);
      let y = 1 + rand.range(BOARD_H - h - 2);
      for (let yy = 0; yy < h; ++yy) {
        for (let xx = 0; xx < w; ++xx) {
          map[y + yy][x + xx] = rand.random() < 0.05 ? TILE_BRIDGE : TILE_OPEN;
        }
      }
      if (!ii) {
        this.spawn_pos = vec2(floor(x + w/2) + 0.5, floor(y + h/2) + 0.5);
      }
    }
    // ore
    let gem_sets = [];
    let num_gems = this.gems_total = 100;
    this.gems_found = 0;
    for (let ii = 0; ii < 20; ++ii) {
      let x = 1 + rand.range(BOARD_W - 2);
      let y = 1 + rand.range(BOARD_H - 2);
      if (map[y][x] !== TILE_GEM) {
        --num_gems;
        map[y][x] = TILE_GEM;
        gem_sets.push({ x, y, pts: [[x,y]] });
      }
    }
    while (num_gems) {
      let set = gem_sets[rand.range(gem_sets.length)];
      let pt = set.pts[rand.range(set.pts.length)];
      let delta = GEM_DELTA[rand.range(GEM_DELTA.length)];
      let xx = pt[0] + delta[0];
      let yy = pt[1] + delta[1];
      if (yy < 1 || yy >= BOARD_H - 1 || xx < 1 || xx >= BOARD_W - 1) {
        continue;
      }
      if (map[yy][xx] === TILE_GEM) {
        continue;
      }
      --num_gems;
      map[yy][xx] = TILE_GEM;
      set.pts.push([xx,yy]);
      if (delta.length > 2) {
        xx = pt[0] + delta[2];
        yy = pt[1] + delta[3];
        if (map[yy][xx] === TILE_SOLID) {
          map[yy][xx] = TILE_CRACKED;
        }
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
    return isSolid(this.get(x, y));
  }

  draw(z, color, next_level) {
    for (let yy = 0; yy < this.h; ++yy) {
      let row = this.map[yy];
      let vrow = this.visible[yy];
      for (let xx = 0; xx < this.w; ++xx) {
        if (vrow[xx] || debug_visible) {
          let tile = row[xx];
          if ((!debug_visible || vrow[xx]) && next_level && canSeeThroughToBelow(tile)) {
            next_level.setVisibleFromAbove(xx, yy);
          }
          if (vrow[xx] && next_level && canSeeThrough(tile)) {
            this.setVisible(xx, yy);
          }
          let cc = color;
          if (!vrow[xx]) {
            cc = color_debug_visible;
          }
          let zz = z;
          if (tile === TILE_GEM) {
            sprite_tiles.draw({
              x: xx * TILE_W,
              y: yy * TILE_W,
              z: zz,
              frame: TILE_OPEN,
              color: cc,
            });
            zz += 0.01;
          }
          sprite_tiles.draw({
            x: xx * TILE_W,
            y: yy * TILE_W,
            z: zz,
            frame: tile,
            color: cc,
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
      if (!this.visible[y][x]) {
        if (this.map[y][x] === TILE_GEM) {
          this.gems_found++;
        }
        this.visible[y][x] = true;
      }
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
      let xx = x + DX_ABOVE[ii];
      let yy = y + DY_ABOVE[ii];
      if (!this.visible[yy][xx]) {
        if (this.map[yy][xx] === TILE_GEM) {
          this.gems_found++;
        }
        this.visible[yy][xx] = true;
      }
    }
  }
}

class GameState {
  constructor() {
    this.gems_found = 0;
    this.gems_total = 0;
    this.cur_level = new Level(mashString(`1.${random()}`));
    this.next_level = new Level(mashString(`2.${random()}`));
    this.pos = this.cur_level.spawn_pos;
    this.active_pos = v2floor(vec2(), this.pos);
    this.shovels = 10;
  }

  draw() {
    camera2d.setAspectFixed(game_width, game_height);
    let posx = this.pos[0] * TILE_W;
    let posy = this.pos[1] * TILE_W;
    let shift_start = TILE_W * 5;
    let shiftx = clamp((posx - shift_start) / (BOARD_W_PX - shift_start * 2), 0, 1) * (BOARD_W_PX - game_width);
    let shifty = clamp((posy - shift_start) / (BOARD_H_PX - shift_start * 2), 0, 1) * (BOARD_H_PX - game_height);
    camera2d.shift(shiftx, shifty);
    if (debug_zoom) {
      camera2d.setAspectFixed(BOARD_W_PX, BOARD_H_PX);
    }
    let show_lower = input.keyDown(KEYS.SHIFT);
    let dig_action;
    if (!show_lower) {
      this.cur_level.draw(Z.LEVEL, color_white, this.next_level);
      let ax = this.active_pos[0];
      let ay = this.active_pos[1];
      let tile = this.cur_level.get(ax, ay);
      if (this.shovels && (tile === TILE_SOLID || tile === TILE_CRACKED || tile === TILE_OPEN) &&
        ax > 0 && ay > 0 && ax < BOARD_W - 1 && ay < BOARD_H - 1
      ) {
        sprite_active.draw({
          x: ax * TILE_W,
          y: ay * TILE_W,
          z: Z.PLAYER - 1,
        });
        dig_action = tile === TILE_SOLID || tile === TILE_CRACKED ? 'tunnel' : 'hole';
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
    let ix = floor(this.pos[0]);
    let iy = floor(this.pos[1]);
    if (dig_action) {
      if (ui.button({
        text: `[space] Dig ${dig_action}`,
        x: game_width - ui.button_width,
        y: game_height - ui.button_height,
      }) || input.keyDownEdge(KEYS.SPACE)) {
        --this.shovels;
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
            if (this.cur_level.map[yy][xx] === TILE_SOLID || this.cur_level.map[yy][xx] === TILE_CRACKED) {
              this.cur_level.map[yy][xx] = TILE_OPEN;
              this.cur_level.setVisible(xx, yy);
            } else {
              break;
            }
          }
        }
      }
    } else if (!this.shovels) {
      let cur_tile = this.cur_level.map[iy][ix];
      let next_tile = this.next_level.map[iy][ix];
      if (cur_tile === TILE_BRIDGE && canWalkThrough(next_tile)) {
        if (ui.button({
          text: '[space] Descend',
          x: game_width - ui.button_width,
          y: game_height - ui.button_height,
        }) || input.keyDownEdge(KEYS.SPACE)) {
          this.gems_found += this.cur_level.gems_found;
          this.gems_total += this.cur_level.gems_total;
          this.cur_level = this.next_level;
          this.next_level = new Level(mashString(`${random()}`));
          this.shovels = 10;
        }
      } else if (cur_tile === TILE_BRIDGE) {
        font.drawSizedAligned(style_overlay, game_width - 4, game_height - ui.font_height - 4, Z.UI,
          ui.font_height, font.ALIGN.HRIGHT, 0, 0, 'You can\'t jump down here.');
      } else {
        font.drawSizedAligned(style_overlay, game_width - 4, game_height - ui.font_height - 4, Z.UI,
          ui.font_height, font.ALIGN.HRIGHT, 0, 0, 'Out of shovels! Find a clear hole to jump down.');
      }
    } else {
      let cur_tile = this.cur_level.map[iy][ix];
      let next_tile = this.next_level.map[iy][ix];
      if (cur_tile === TILE_GEM) {
        font.drawSizedAligned(style_hint, game_width - 4, game_height - ui.font_height - 4, Z.UI,
          ui.font_height, font.ALIGN.HRIGHT, 0, 0, 'This is a Gem, it will be scored when you leave the level.');
      } else if (cur_tile === TILE_BRIDGE) {
        if (canWalkThrough(next_tile)) {
          font.drawSizedAligned(style_hint, game_width - 4, game_height - ui.font_height - 4, Z.UI,
            ui.font_height, font.ALIGN.HRIGHT, 0, 0, 'This is a hole, jump down it when you are out of shovels.');
        } else {
          font.drawSizedAligned(style_hint, game_width - 4, game_height - ui.font_height - 4, Z.UI,
            ui.font_height, font.ALIGN.HRIGHT, 0, 0, 'This is a hole, but it is unsafe underneath.');
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
      if (cur_level.isSolid(ix2, iy) && !debug_freecam) {
        x2 = ix2 > ix ? ix + 0.999 : ix;
      }
    }
    if (iy !== iy2) {
      if (cur_level.isSolid(ix, iy2) && !debug_freecam) {
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
  v4set(engine.border_color, 0.4, 0.4, 0.4, 1);

  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  sprite_tiles = sprites.create({
    name: 'tiles',
    size: vec2(TILE_W, TILE_W),
    ws: [16, 16, 16, 16],
    hs: [16, 16, 16],
    origin: vec2(0,0),
  });
  sprite_tiles_ui = sprites.create({
    name: 'tiles',
    ws: [16, 16, 16, 16],
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
    ui.print(style_overlay, 4, 4, Z.UI, '[shift] - view level below');
    ui.print(style_overlay, 4, 4+ui.font_height, Z.UI, '[WASD] - move');
    ui.print(style_overlay, 4, 4+ui.font_height*2, Z.UI, '[Z] - zoom out');
    let icon_size = ui.font_height * 2;

    let y = 0;
    if (state.gems_total) {
      sprite_tiles_ui.draw({
        x: game_width - 4 - icon_size, y, w: icon_size, h: icon_size, z: Z.UI,
        frame: TILE_GEM_UI,
      });
      font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
        font.ALIGN.HRIGHT, 0, 0,
        `${state.gems_found}`);
      y += icon_size + 4;
    }
    sprite_tiles_ui.draw({
      x: game_width - 4 - icon_size, y, w: icon_size, h: icon_size, z: Z.UI,
      frame: TILE_GEM_UI,
    });
    font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HRIGHT, 0, 0,
      `${state.cur_level.gems_found}/${state.cur_level.gems_total}`);
    y += icon_size + 4;

    sprite_tiles_ui.draw({
      x: game_width - 4 - icon_size, y, w: icon_size, h: icon_size, z: Z.UI,
      frame: TILE_SHOVEL,
    });
    font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HRIGHT, 0, 0,
      `${state.shovels}`);
    y += icon_size + 4;

    if (engine.DEBUG) {
      if (input.keyDownEdge(KEYS.R)) {
        state = new GameState();
      }
      if (input.keyDownEdge(KEYS.V)) {
        debug_visible = !debug_visible;
      }
      if (input.keyDownEdge(KEYS.F2)) {
        debug_freecam = !debug_freecam;
      }
      if (input.keyDownEdge(KEYS.Z)) {
        debug_zoom = !debug_zoom;
      }
    } else {
      debug_zoom = input.keyDown(KEYS.Z);
    }
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

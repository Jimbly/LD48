/*eslint global-require:off*/
const local_storage = require('./glov/local_storage.js');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

const assert = require('assert');
const camera2d = require('./glov/camera2d.js');
const engine = require('./glov/engine.js');
const glov_font = require('./glov/font.js');
const { abs, cos, floor, max, min, random, sin, sqrt, PI } = Math;
const input = require('./glov/input.js');
const { KEYS, PAD } = input;
const net = require('./glov/net.js');
const ui = require('./glov/ui.js');
const particles = require('./glov/particles.js');
const particle_data = require('./particle_data.js');
const { mashString, randCreate } = require('./glov/rand_alea.js');
const sprites = require('./glov/sprites.js');
const sprite_animation = require('./glov/sprite_animation.js');
const { clamp } = require('../common/util.js');
const {
  vec2, v2add, v2addScale, v2floor, v2lengthSq, v2normalize, v2sub, v2scale, v2set,
  v3lerp, vec4, v4set,
} = require('./glov/vmath.js');

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
// const TILE_LAVA = 2;
const TILE_OPEN = 3;
const TILE_BRIDGE = 10;
const TILE_PIT = 5;
const TILE_GEM_UI = 6;
// const TILE_INVISIBLE = 7;
const TILE_CRACKED = 8;
const TILE_SHOVEL = 9;

const DRILL_TIME = 400;
// const DIG_LEN = 5;

const BOARD_W = 48;
const BOARD_H = 32;
const TILE_W = 16;
const BOARD_W_PX = BOARD_W * TILE_W;
const BOARD_H_PX = BOARD_H * TILE_W;
const color_black = vec4(0,0,0,1);
const color_white = vec4(1,1,1,1);
const color_next_level = vec4(0.5,0.5,0.5,1);
const color_unlit = vec4(0.4,0.4,0.6,1);
const color_player_lower = vec4(1, 1, 1, 0.25);
const color_debug_visible = vec4(0.3,0.1,0.3,1);

let sprite_drill;
let sprite_drill_ui;
let sprite_solid;
let sprite_tiles;
let sprite_tiles_ui;
let sprite_dwarf;
let player_animation;
let anim_drill;

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
function isDrillable(tile) {
  return isSolid(tile);
}
function canSeeThrough(tile) {
  return !isSolid(tile);
}
function canWalkThrough(tile) {
  return tile === TILE_BRIDGE || tile === TILE_OPEN || tile === TILE_GEM;
}

let debug_zoom = false;
let debug_visible = false;
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

let raycast = (function () {
  let walk = new Int32Array(2);
  let step = new Int32Array(2);
  let t_max = vec2();
  let t_delta = vec2();
  return function raycastFn(level, startpos, dir, max_len, dvis) {
    let { map, lit, visible } = level;
    v2floor(walk, startpos);
    // init
    for (let ii = 0; ii < 2; ++ii) {
      if (!dir[ii]) {
        step[ii] = 0;
        t_max[ii] = max_len + 1;
      } else {
        if (dir[ii] < 0) {
          step[ii] = -1;
          t_max[ii] = (walk[ii] - startpos[ii]) / dir[ii];
          t_delta[ii] = -1 / dir[ii];
        } else {
          t_max[ii] = (walk[ii] + 1 - startpos[ii]) / dir[ii];
          step[ii] = 1;
          t_delta[ii] = 1 / dir[ii];
        }
      }
    }

    lit[walk[1]][walk[0]] = min(1, lit[walk[1]][walk[0]] + dvis);
    level.setCellVisible(walk[0], walk[1]);
    // walk
    let ret = 0;
    // let backidx = 0;
    // let last_t = 0;
    do {
      let minidx = (t_max[0] < t_max[1]) ? 0 : 1;
      if (t_max[minidx] > max_len) {
        break;
      }
      // backidx = minidx;
      // last_t = t_max[minidx];
      walk[minidx] += step[minidx];
      t_max[minidx] += t_delta[minidx];
      let cur_lit = lit[walk[1]][walk[0]] = min(1, lit[walk[1]][walk[0]] + dvis);
      if (cur_lit > 0.1 && !visible[walk[1]][walk[0]]) {
        level.setCellVisible(walk[0], walk[1]);
      }
      ret = !canSeeThrough(map[walk[1]][walk[0]]);
      dvis *= 0.9;
    } while (!ret);
    // v2copy(out_prevpos, walk);
    // out_prevpos[backidx] -= step[backidx];
    // v2copy(out_pos, walk);
    return ret;
  };
}());

let temp_color = vec4(0,0,0,1);

class Level {
  constructor(seed) {
    this.w = BOARD_W;
    this.h = BOARD_H;
    this.particles = false;
    let map = this.map = [];
    this.visible = [];
    this.lit = [];
    for (let ii = 0; ii < this.h; ++ii) {
      map[ii] = [];
      this.visible[ii] = [];
      this.lit[ii] = [];
      for (let jj = 0; jj < this.w; ++jj) {
        map[ii].push(TILE_SOLID);
        this.visible[ii].push(false);
        this.lit[ii].push(0);
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
      let lrow = this.lit[yy];
      for (let xx = 0; xx < this.w; ++xx) {
        if (vrow[xx] || debug_visible) {
          let tile = row[xx];
          if ((!debug_visible || vrow[xx]) && next_level && canSeeThroughToBelow(tile)) {
            next_level.setVisibleFromAbove(xx, yy);
          }
          // if (vrow[xx] && next_level && canSeeThrough(tile)) {
          //   this.setVisibleFill(xx, yy);
          // }
          let cc = color;
          if (!vrow[xx]) {
            cc = color_debug_visible;
          } else if (lrow[xx] !== 1) {
            cc = v3lerp(temp_color, lrow[xx], color_unlit, color);
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

  activateParticles() {
    this.particles = true;
    for (let yy = 0; yy < BOARD_H; ++yy) {
      for (let xx = 0; xx < BOARD_W; ++xx) {
        if (this.map[yy][xx] === TILE_GEM && this.visible[yy][xx]) {
          engine.glov_particles.createSystem(particle_data.defs.gem_found,
            [(xx + 0.5) * TILE_W, (yy + 0.5) * TILE_W, Z.PARTICLES]
          );
        }
      }
    }
  }

  setCellVisible(x, y) {
    if (!this.visible[y][x]) {
      if (this.map[y][x] === TILE_GEM) {
        if (this.particles) {
          ui.playUISound('gem_found');
          engine.glov_particles.createSystem(particle_data.defs.gem_found,
            [(x + 0.5) * TILE_W, (y + 0.5) * TILE_W, Z.PARTICLES]
          );
        }
        this.gems_found++;
      }
      this.visible[y][x] = true;
    }
  }

  setVisibleFill(x, y) {
    let todo = [];
    todo.push(x,y);
    while (todo.length) {
      y = todo.pop();
      x = todo.pop();
      // if (this.visible[y][x]) {
      //   continue;
      // }
      this.setCellVisible(x, y);
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
    this.lit[y][x] = true;
    for (let ii = 0; ii < DX_ABOVE.length; ++ii) {
      let xx = x + DX_ABOVE[ii];
      let yy = y + DY_ABOVE[ii];
      this.setCellVisible(xx, yy);
    }
  }

  tickVisibility(x0, y0) {
    let { lit } = this;
    let dvis = engine.frame_dt * 0.001;
    for (let yy = 0; yy < BOARD_H; ++yy) {
      let row = lit[yy];
      for (let xx = 0; xx < BOARD_W; ++xx) {
        row[xx] = max(0, row[xx] - dvis);
      }
    }
    let steps = 40;
    let tstep = PI * 2 / steps;
    let theta_mod = random() * tstep;
    for (let theta = theta_mod; theta < PI * 2; theta += tstep) {
      let ctheta = cos(theta);
      let stheta = sin(theta);
      raycast(this, [x0, y0], [ctheta, stheta], 100, dvis * 4);
    }
  }
}

const dir_to_rot = [PI/2, 3*PI/2, PI, 0];

function highlightTile(xx, yy, color) {
  let w = 1;
  ui.drawHollowRect(xx * TILE_W + w/2, yy * TILE_W + w/2, (xx+1)*TILE_W - w/2, (yy+1)*TILE_W - w/2, Z.PLAYER - 1,
    w, 1, color);
}

class GameState {
  constructor() {
    this.gems_found = 0;
    this.gems_total = 0;
    this.cur_level = new Level(mashString('1')); // `1.${random()}`));
    this.cur_level.activateParticles();
    this.next_level = new Level(mashString('2')); // `2.${random()}`));
    this.pos = this.cur_level.spawn_pos.slice(0);
    player_animation.setState('idle_down');
    this.player_dir = 3; // down
    this.active_pos = vec2();
    this.shovels = 3;
    this.drills = 3;
  }

  setMainCamera() {
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
  }

  draw() {
    this.setMainCamera();
    let posx = this.pos[0] * TILE_W;
    let posy = this.pos[1] * TILE_W;
    this.cur_level.tickVisibility(this.pos[0], this.pos[1]);
    let show_lower = input.keyDown(KEYS.SHIFT);
    let dig_action;
    if (!show_lower) {
      this.cur_level.draw(Z.LEVEL, color_white, this.next_level);
      let ax = this.active_pos[0];
      let ay = this.active_pos[1];
      if (ax > 0 && ay > 0 && ax < BOARD_W - 1 && ay < BOARD_H - 1 && !this.active_drill) {
        let tile = this.cur_level.get(ax, ay);
        if (this.shovels && tile === TILE_OPEN) {
          sprite_tiles.draw({
            x: ax * TILE_W,
            y: ay * TILE_W,
            z: Z.PLAYER - 1,
            frame: TILE_SHOVEL,
          });
          for (let ii = 0; ii < DIG_DX.length; ++ii) {
            let yy = ay + DIG_DY[ii];
            let xx = ax + DIG_DX[ii];
            if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
              continue;
            }
            if (this.cur_level.map[yy][xx] === TILE_OPEN) {
              highlightTile(xx, yy, [1,0.5,0,1]);
            }
          }
          dig_action = 'hole';
        } else if (this.drills && isDrillable(tile)) {
          sprite_drill.draw({
            x: (ax + 0.5) * TILE_W,
            y: (ay + 0.5) * TILE_W,
            z: Z.PLAYER - 1,
            frame: anim_drill.getFrame(engine.frame_dt),
            rot: dir_to_rot[this.player_dir],
          });
          let dx = DX[this.player_dir];
          let dy = DY[this.player_dir];
          for (let ii = 0; ii < 5; ++ii) {
            let yy = ay + dy * ii;
            let xx = ax + dx * ii;
            if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
              break;
            }
            if (!this.cur_level.visible[yy][xx] || isDrillable(this.cur_level.map[yy][xx])) {
              let a = 1 - ii/5;
              highlightTile(xx, yy, [a,0.5*a,0,1]);
            } else {
              break;
            }
          }
          dig_action = 'drill';
        }
      }
      if (this.active_drill) {
        sprite_drill.draw({
          x: (this.active_drill.pos[0] + 0.5) * TILE_W,
          y: (this.active_drill.pos[1] + 0.5) * TILE_W,
          z: Z.PLAYER - 1,
          frame: anim_drill.getFrame(engine.frame_dt),
          rot: dir_to_rot[this.active_drill.dir],
        });
      }
    }
    sprite_dwarf.draw({
      x: posx,
      y: posy,
      z: Z.PLAYER,
      color: show_lower ? color_player_lower : color_white,
      frame: player_animation.getFrame(engine.frame_dt),
    });

    let ix = floor(this.pos[0]);
    let iy = floor(this.pos[1]);
    let message;
    let message_style = style_overlay;
    if (!dig_action) {
      let cur_tile = this.cur_level.map[iy][ix];
      let next_tile = this.next_level.map[iy][ix];
      if (!this.drills && !this.shovels) {
        if (cur_tile === TILE_BRIDGE && canWalkThrough(next_tile)) {
          dig_action = 'descend';
          highlightTile(ix, iy, [0,1,0,1]);
        } else if (cur_tile === TILE_BRIDGE) {
          message = 'You can\'t jump down here.';
        } else {
          message = 'Out of tools! Find a clear hole to jump down.';
        }
      } else if (cur_tile === TILE_GEM) {
        message = 'This is a Gem, it will be collected when you leave the level.';
        message_style = style_hint;
      } else if (cur_tile === TILE_BRIDGE) {
        if (canWalkThrough(next_tile)) {
          message = 'This is a hole, jump down it when you are out of tools.';
          message_style = style_hint;
        } else {
          message = 'A hole was dug here, but it is not clear below.';
          message_style = style_hint;
        }
      }
    }
    if (this.active_drill) {
      dig_action = null;
      message = null;
    }

    if (!debug_zoom) {
      if (!this.shovels && !this.drills && !this.active_drill) {
        font.drawSizedAligned(style_overlay, posx, posy - TILE_W/2 - ui.font_height, Z.UI, ui.font_height,
          font.ALIGN.HCENTER, 0, 0, dig_action === 'descend' ? 'Go down here?' : 'Out of tools!');
      }
      camera2d.zoom(posx, posy, 0.95);
    }
    this.next_level.draw(Z.LEVEL - 2, show_lower ? color_white : color_next_level);
    camera2d.setAspectFixed(game_width, game_height);
    if (dig_action === 'hole' || dig_action === 'drill') {
      if (ui.button({
        text: `[space] ${dig_action === 'hole' ? 'Dig hole' : 'Drill tunnel'}`,
        x: game_width - ui.button_width,
        y: game_height - ui.button_height,
      }) || input.keyDownEdge(KEYS.SPACE) || input.keyDownEdge(KEYS.E)) {
        if (dig_action === 'hole') {
          --this.shovels;
          ui.playUISound('shovel');
          for (let ii = 0; ii < DIG_DX.length; ++ii) {
            let yy = this.active_pos[1] + DIG_DY[ii];
            let xx = this.active_pos[0] + DIG_DX[ii];
            if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
              continue;
            }
            if (this.cur_level.map[yy][xx] === TILE_OPEN) {
              this.cur_level.map[yy][xx] = TILE_BRIDGE;
            }
          }
        } else {
          assert.equal(dig_action, 'drill');
          --this.drills;
          assert(ix !== this.active_pos[0] || iy !== this.active_pos[1]);
          this.active_drill = {
            pos: this.active_pos.slice(0),
            dir: this.player_dir,
            count: 0,
            countdown: 0,
          };
          // let dx = DX[this.player_dir];
          // let dy = DY[this.player_dir];
          // for (let ii = 0; ii < DIG_LEN; ++ii) {
          //   let yy = this.active_pos[1] + dy * ii;
          //   let xx = this.active_pos[0] + dx * ii;
          //   if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
          //     break;
          //   }
          //   if (this.cur_level.map[yy][xx] === TILE_SOLID || this.cur_level.map[yy][xx] === TILE_CRACKED) {
          //     this.cur_level.map[yy][xx] = TILE_OPEN;
          //     // this.cur_level.setVisibleFill(xx, yy);
          //   } else {
          //     break;
          //   }
          // }
        }
      }
    } else if (dig_action === 'descend') {
      if (ui.button({
        text: '[space] Descend',
        x: game_width - ui.button_width,
        y: game_height - ui.button_height,
      }) || input.keyDownEdge(KEYS.SPACE) || input.keyDownEdge(KEYS.E)) {
        this.gems_found += this.cur_level.gems_found;
        this.gems_total += this.cur_level.gems_total;
        this.cur_level = this.next_level;
        this.cur_level.activateParticles();
        this.next_level = new Level(mashString(`${random()}`));
        this.shovels = 5;
        this.drills = 5;
        ui.playUISound('descend');
      }
    } else if (message) {
      font.drawSizedAligned(message_style, game_width - 4, game_height - ui.font_height - 4, Z.UI,
        ui.font_height, font.ALIGN.HRIGHT, 0, 0, message);
    }
  }

  updateDrill() {
    let { active_drill } = this;
    active_drill.countdown -= engine.frame_dt;
    if (active_drill.countdown > 0) {
      return;
    }
    active_drill.count++;
    active_drill.countdown += max(DRILL_TIME - active_drill.count*10, 16);
    let { dir, pos } = active_drill;
    let [xx, yy] = pos;
    this.cur_level.map[yy][xx] = TILE_OPEN;
    pos[0] += DX[dir];
    pos[1] += DY[dir];
    xx = pos[0];
    yy = pos[1];
    if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
      this.active_drill = null;
      ui.playUISound('drill_stop');
      return;
    }
    if (this.cur_level.map[yy][xx] === TILE_SOLID || this.cur_level.map[yy][xx] === TILE_CRACKED) {
      // this.cur_level.setVisibleFill(xx, yy);
    } else {
      this.active_drill = null;
      ui.playUISound('drill_stop');
      return;
    }
    ui.playUISound('drill_block');
  }

  update() {
    if (this.active_drill) {
      this.updateDrill();
    }
    let dx = 0;
    dx -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A) + input.padButtonDown(PAD.LEFT);
    dx += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D) + input.padButtonDown(PAD.RIGHT);
    let dy = 0;
    dy -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W) + input.padButtonDown(PAD.UP);
    dy += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S) + input.padButtonDown(PAD.DOWN);
    if (abs(dx) + abs(dy)) {
      if (abs(dx) > abs(dy)) {
        if (dx < 0) {
          player_animation.setState('idle_left');
          this.player_dir = 0;
        } else {
          player_animation.setState('idle_right');
          this.player_dir = 1;
        }
      } else {
        if (dy < 0) {
          player_animation.setState('idle_up');
          this.player_dir = 2;
        } else {
          player_animation.setState('idle_down');
          this.player_dir = 3;
        }
      }
    }

    dx *= 0.005;
    dy *= 0.005;
    let { pos, cur_level } = this;
    let ix = floor(pos[0]);
    let iy = floor(pos[1]);
    let x2 = pos[0] + dx;
    let y2 = pos[1] + dy;
    const PLAYER_R = 0.25;
    if (!debug_freecam) {
      let xleft = floor(x2 - PLAYER_R);
      let hit_wall = false;
      if (cur_level.isSolid(xleft, iy)) {
        x2 = xleft + 1 + PLAYER_R;
        hit_wall = true;
      }
      let xright = floor(x2 + PLAYER_R);
      if (cur_level.isSolid(xright, iy)) {
        x2 = xright - PLAYER_R;
        hit_wall = true;
      }
      let yup = floor(y2 - PLAYER_R);
      if (cur_level.isSolid(ix, yup)) {
        y2 = yup + 1 + PLAYER_R;
        hit_wall = true;
      }
      let ydown = floor(y2 + PLAYER_R);
      if (cur_level.isSolid(ix, ydown)) {
        y2 = ydown - PLAYER_R;
        hit_wall = true;
      }
      // check diagonals
      if (!hit_wall) {
        const DIAG = [[-1,-1], [-1,1], [1,1], [1,-1]];
        for (let ii = 0; ii < DIAG.length; ++ii) {
          let delta = DIAG[ii];
          if (cur_level.isSolid(ix + delta[0], iy + delta[1])) {
            let corner = [ix + delta[0] + (delta[0] < 0 ? 1 : 0), iy + delta[1] + (delta[1] < 0 ? 1 : 0)];
            let temp = v2sub([0,0], [x2, y2], corner);
            let len = sqrt(v2lengthSq(temp));
            if (len < PLAYER_R) {
              v2normalize(temp, temp);
              v2addScale(temp, corner, temp, PLAYER_R);
              x2 = temp[0];
              y2 = temp[1];
            }
          }
        }
      }
    }
    if (!dx && !dy) {
      // normalize to center
      const NORMALIZE_DIST = 0.4;
      let max_dist = engine.frame_dt * 0.002;
      let delta = [0, 0];
      for (let ii = 0; ii < 2; ii++) {
        let ipos = floor(pos[ii]);
        let fpart = pos[ii] - ipos;
        delta[ii] = min(1 - NORMALIZE_DIST, max(NORMALIZE_DIST, fpart)) - fpart;
      }
      let len_squared = v2lengthSq(delta);
      if (len_squared > max_dist * max_dist) {
        let scale = max_dist / sqrt(len_squared);
        v2scale(delta, delta, scale);
      }
      v2add(pos, pos, delta);
      x2 += delta[0];
      y2 += delta[1];
    }

    pos[0] = x2;
    pos[1] = y2;
    let ix2 = floor(x2);
    let iy2 = floor(y2);
    v2add(this.active_pos, [ix2, iy2], [DX[this.player_dir], DY[this.player_dir]]);
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

  let ui_sounds = {
    gem_found: 'button_click',
    drill_block: 'button_click',
    drill_stop: 'button_click',
    shovel: 'button_click',
    descend: 'button_click',
  };

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font,
    viewport_postprocess: false,
    antialias: false,
    ui_sounds,
    line_mode: ui.LINE_CAP_SQUARE,
  })) {
    return;
  }
  font = engine.font;
  v4set(engine.border_color, 0.4, 0.4, 0.4, 1);

  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  particles.preloadParticleData(particle_data);
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
  player_animation = sprite_animation.create({
    idle_down: {
      frames: [0],
      times: [200],
    },
    idle_up: {
      frames: [1],
      times: [200],
    },
    idle_right: {
      frames: [2],
      times: [200],
    },
    idle_left: {
      frames: [3],
      times: [200],
    },
  });
  sprite_dwarf = sprites.create({
    name: 'dwarf',
    ws: [16, 16],
    hs: [16, 16],
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0.5, 0.5),
  });
  sprite_solid = sprites.create({
    url: 'white',
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0,0),
  });
  sprite_drill = sprites.create({
    name: 'active',
    ws: [16,16],
    hs: [16,16],
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0.5, 0.5),
  });
  sprite_drill_ui = sprites.create({
    name: 'active',
    ws: [16,16],
    hs: [16,16],
  });
  anim_drill = sprite_animation.create({
    drill: {
      frames: [0,1,2,3],
      times: [120,120,120,120],
    },
  });
  anim_drill.setState('drill');

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
        `${state.gems_found + state.cur_level.gems_found}`);
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

    sprite_drill_ui.draw({
      x: game_width - 4 - icon_size, y: y + icon_size, w: icon_size, h: icon_size, z: Z.UI,
      frame: 0,
      rot: 3*PI/2,
    });
    font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HRIGHT, 0, 0,
      `${state.drills}`);
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
    if (engine.DEBUG && input.keyDownEdge(KEYS.F3)) {
      state.cur_level.activateParticles();
    }
    state.setMainCamera(); // for particles
  }

  function playInit(dt) {
    state = new GameState();
    engine.setState(play);
    play(dt);
  }

  engine.setState(playInit);
}

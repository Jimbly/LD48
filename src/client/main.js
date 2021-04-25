/*eslint global-require:off*/
const local_storage = require('./glov/local_storage.js');
local_storage.setStoragePrefix('ld48'); // Before requiring anything else that might load from this

const animation = require('./glov/animation.js');
const assert = require('assert');
const camera2d = require('./glov/camera2d.js');
const engine = require('./glov/engine.js');
const glov_font = require('./glov/font.js');
const { abs, cos, floor, max, min, random, sin, sqrt, PI } = Math;
const input = require('./glov/input.js');
const { KEYS, PAD } = input;
const net = require('./glov/net.js');
const { createNoise3D } = require('./noise3d.js');
const ui = require('./glov/ui.js');
const particles = require('./glov/particles.js');
const particle_data = require('./particle_data.js');
const pico8 = require('./glov/pico8.js');
const { mashString, randCreate } = require('./glov/rand_alea.js');
const { randSimpleSpatial } = require('./glov/rand_fast.js');
const settings = require('./glov/settings.js');
const { soundPlayMusic } = require('./glov/sound.js');
const sprites = require('./glov/sprites.js');
const sprite_animation = require('./glov/sprite_animation.js');
const transition = require('./glov/transition.js');
const { clamp, nop, ridx } = require('../common/util.js');
const {
  vec2, v2add, v2addScale, v2floor, v2lengthSq, v2normalize, v2sub, v2scale,
  v3lerp, vec4, v4copy,
} = require('./glov/vmath.js');

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.LEVEL = 10;
Z.PLAYER = 15;
Z.PARTICLES = 20;
Z.UI_TEST = 200;


// const BOARD_W = 48;
// const BOARD_H = 32;
// const NOISE_FREQ_XY = 0.1;
// const NOISE_FREQ_Z = 0.2;
// const level_def = {
//   num_rooms: 15,
//   num_openings: 20,
//   gems_per_floor: 100,
//   num_gem_sets: 20,
//   room_min_size: 8,
//   room_max_size: 64,
//   lava_min_size: 32,
//   lava_max_size: 96,
//   shovels_init: 3,
//   drills_init: 5,
//   shovels_add: 5,
//   drills_add: 5,
// };
const BOARD_W = 48/2;
const BOARD_H = 32/2;
const NOISE_FREQ_XY = 0.1;
const NOISE_FREQ_Z = 0.2;
const level_def = {
  num_rooms: 6,
  num_openings: 4,
  gems_per_floor: 20,
  num_gem_sets: 4,
  room_min_size: 6,
  room_max_size: 32,
  lava_min_size: 16,
  lava_max_size: 32,
  shovels_init: 3,
  drills_init: 5,
  shovels_add: 2,
  drills_add: 3,
};
const REQUIRE_NO_TOOLS = false;

let NOISE_DEBUG = false;
let debug_zoom = false;
let debug_visible = false;
let debug_freecam = false;
let random_seed = false;


// Virtual viewport for our game logic
const game_width = 384;
const game_height = 256;

const TILE_SOLID = 0;
const TILE_LAVA = 1; // 2, 3
const TILE_OPEN = 4;
const TILE_BRIDGE = 5;
const TILE_PIT = 7;
const TILE_BRIDGE_OVER_STONE = 8;
const TILE_GEM = 9;
const TILE_GEM_UI = 10;
const TILE_GEM_UNLIT = 11;
const TILE_CRACKED_1 = 12;
const TILE_CRACKED_2 = 13;
const TILE_CRACKED_3 = 14;
const TILE_SHOVEL = 15;

const DRILL_TIME = 400;
// const DIG_LEN = 5;
const DRILL_TRIGGER_TIME = 600;

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
let sprite_timer;
let sprite_solid;
let sprite_tiles;
let sprite_tiles_ui;
let sprite_twinkle;
let sprite_dwarf;
let player_animation;
let anim_drill;

const ANIM_DIR = ['idle_left', 'idle_up', 'idle_right', 'idle_down'];

const DX = [-1, 0, 1, 0];
const DY = [0, -1, 0, 1];

const DX_ABOVE = [-1, 0, 1, -1, 0, 1, -1, 0, 1, -2, 2, 0, 0];
const DY_ABOVE = [-1, -1, -1, 0, 0, 0, 1, 1, 1, 0, 0, -2, 2];

const DIG_DX = [-1, 0, 1, 0, 0];
const DIG_DY = [0, 0, 0, -1, 1];
// const DIG_DX = [-1,-1,1,1,-1, 0, 1, 0, 0];
// const DIG_DY = [-1,1,-1,1,0, 0, 0, -1, 1];

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

const ROOM_DELTA = [
  // adjacent
  [-1, 0], [0, -1], [0, 1], [1, 0],
];
const LAVA_DELTA = [
  // adjacent
  [-1, 0], [0, -1], [0, 1], [1, 0],
  // bias lower right
  [1, 0], [0, 1],
  [1, 0], [0, 1],
  [1, 1], [1, 1], [1, 1], [1, 1],
  [1, 1], [1, 1], [1, 1], [1, 1],
];


function canSeeThroughToBelow(tile) {
  return tile === TILE_BRIDGE || tile === TILE_PIT;
}
function isSolid(tile) {
  return tile === TILE_SOLID || tile === TILE_CRACKED_1 || tile === TILE_CRACKED_2 || tile === TILE_CRACKED_3;
}
function forceStopsDrill(tile) {
  return tile === TILE_LAVA;
}
function isDrillable(tile) {
  return isSolid(tile);
}
function canSeeThrough(tile) {
  return !isSolid(tile);
}
function canWalkThrough(tile) {
  return tile === TILE_BRIDGE || tile === TILE_OPEN || tile === TILE_GEM || tile === TILE_GEM_UNLIT;
}

const style_overlay = glov_font.style(null, {
  color: 0xFFFFFFff,
  outline_width: 2,
  outline_color: 0x000000ff,
});
const style_hint = glov_font.style(style_overlay, {
  color: 0x808080ff,
});
const title_style = glov_font.style(null, {
  color: pico8.font_colors[12],
  outline_width: 2,
  outline_color: pico8.font_colors[1],
  glow_xoffs: 2,
  glow_yoffs: 2,
  glow_inner: -2.5,
  glow_outer: 5,
  glow_color: pico8.font_colors[4],
});
let subtitle_style = null;
let subtitle_style2 = glov_font.style(subtitle_style, {
  color: pico8.font_colors[5],
});

let font;
let title_font;

let raycast = (function () {
  let walk = new Int32Array(2);
  let step = new Int32Array(2);
  let t_max = vec2();
  let t_delta = vec2();
  return function raycastFn(level, startpos, dir, max_len, dvis) {
    let { map } = level;
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

    let cell = map[walk[1]][walk[0]];
    let lit_value = min(1, cell.lit + dvis);
    if (!NOISE_DEBUG) {
      cell.lit = lit_value;
    }
    let walkable = true;
    level.setCellVisible(walk[0], walk[1], lit_value, true);
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
      cell = map[walk[1]][walk[0]];
      let cur_lit = min(1, cell.lit + dvis);
      if (!NOISE_DEBUG) {
        cell.lit = cur_lit;
      }
      if (cur_lit > 0.1) { // && !visible[walk[1]][walk[0]]) {
        level.setCellVisible(walk[0], walk[1], cur_lit, walkable);
      }
      ret = !canSeeThrough(cell.tile);
      if (walkable && !canWalkThrough(cell.tile)) {
        walkable = false;
      }
      dvis *= 0.9;
    } while (!ret);
    // v2copy(out_prevpos, walk);
    // out_prevpos[backidx] -= step[backidx];
    // v2copy(out_pos, walk);
    return ret;
  };
}());


function particle(xx, yy, key) {
  engine.glov_particles.createSystem(particle_data.defs[key],
    [(xx + 0.5) * TILE_W, (yy + 0.5) * TILE_W, Z.PARTICLES]
  );
}


let temp_color = vec4(0,0,0,1);

class MapEntry {
  constructor(x, y) {
    this.tile = TILE_SOLID;
    this.lava_freq = 1;
    this.visible = false;
    this.is_ore_vein = false;
    this.is_ore_vein_edge = false;
    this.ore_chance = 0;
    this.ore_frame = floor(random() * 9);
    this.lit = 0;
  }
}
const dummy_cell = new MapEntry();

class Level {
  constructor(seed, noise_3d, level_idx) {
    this.w = BOARD_W;
    this.h = BOARD_H;
    this.particles = false;
    this.did_game_over_detect = false;
    let map = this.map = [];
    for (let yy = 0; yy < this.h; ++yy) {
      map[yy] = [];
      for (let xx = 0; xx < this.w; ++xx) {
        let cell = new MapEntry(xx, yy);
        map[yy].push(cell);
        cell.lava_freq = randSimpleSpatial(xx, yy, 0) * 0.001;
        let r = noise_3d(xx * NOISE_FREQ_XY, yy * NOISE_FREQ_XY, level_idx * NOISE_FREQ_Z);
        if (r < 0.5) {
          cell.is_ore_vein = true;
          r = 1 - r * 2;
          cell.ore_chance = r * r;
        }
      }
    }
    // Fill is_ore_vein_edge
    let num_non_edge = 0;
    for (let yy = 0; yy < this.h; ++yy) {
      for (let xx = 0; xx < this.w; ++xx) {
        let cell = this.getCell(xx, yy);
        if (cell.is_ore_vein) {
          for (let ii = 0; ii < DX.length; ++ii) {
            if (!this.getCell(xx + DX[ii], yy + DY[ii]).is_ore_vein) {
              cell.is_ore_vein_edge = true;
              break;
            }
          }
          if (!cell.is_ore_vein_edge) {
            num_non_edge++;
          }
        }
      }
    }
    if (num_non_edge < level_def.gems_per_floor) {
      // convert edges back to non-edge
      for (let yy = 0; yy < this.h; ++yy) {
        for (let xx = 0; xx < this.w; ++xx) {
          let cell = this.getCell(xx, yy);
          if (cell.is_ore_vein) {
            cell.is_ore_vein_edge = false;
          }
        }
      }
    }

    let rand = this.rand = randCreate(seed);
    // rooms
    let { num_rooms } = level_def;
    this.num_openings_good = level_def.num_openings;
    this.num_openings_bad = level_def.num_openings;
    let num_gems = this.gems_total = level_def.gems_per_floor;
    // for (let ii = 0; ii < num_rooms; ++ii) {
    //   let w = 2 + rand.range(8);
    //   let h = 2 + rand.range(8);
    //   let x = 1 + rand.range(BOARD_W - w - 2);
    //   let y = 1 + rand.range(BOARD_H - h - 2);
    //   for (let yy = 0; yy < h; ++yy) {
    //     for (let xx = 0; xx < w; ++xx) {
    //       map[y + yy][x + xx] = rand.random() < 0.05 ? TILE_BRIDGE : TILE_OPEN;
    //     }
    //   }
    //   if (!ii) {
    //     this.spawn_pos = vec2(floor(x + w/2) + 0.5, floor(y + h/2) + 0.5);
    //   }
    // }
    let best_spawn = -1;
    let aborts = 100;
    for (let ii = 0; ii < num_rooms; ++ii) {
      let size = level_def.room_min_size + rand.range(level_def.room_max_size - level_def.room_min_size + 1);
      let x = 1 + rand.range(BOARD_W - 2);
      let y = 1 + rand.range(BOARD_H - 2);
      if (map[y][x].tile !== TILE_SOLID) {
        ii--;
        if (!--aborts) {
          console.log('ABORT: num_rooms');
          break;
        }
        continue;
      }
      let pts = [[x,y]];
      map[y][x].tile = TILE_OPEN;
      if (size > best_spawn) {
        this.spawn_pos = vec2(x + 0.5, y + 0.5);
        best_spawn = size;
      }
      while (size) {
        --size;
        let pt = pts[rand.range(pts.length)];
        let delta = ROOM_DELTA[rand.range(ROOM_DELTA.length)];
        let xx = pt[0] + delta[0];
        let yy = pt[1] + delta[1];
        if (yy < 1 || yy >= BOARD_H - 1 || xx < 1 || xx >= BOARD_W - 1) {
          continue;
        }
        if (map[yy][xx].tile !== TILE_SOLID) {
          continue;
        }
        map[yy][xx].tile = TILE_OPEN;
        pts.push([xx,yy]);
      }
    }
    // ore
    let gem_sets = [];
    this.gems_found = 0;
    let { num_gem_sets } = level_def;
    aborts = 100;
    while (num_gem_sets) {
      let x = 1 + rand.range(BOARD_W - 2);
      let y = 1 + rand.range(BOARD_H - 2);
      let cell = map[y][x];
      if (cell.is_ore_vein && cell.tile !== TILE_GEM_UNLIT) {
        if (rand.random() < cell.ore_chance) {
          if (!--aborts) {
            console.log('ABORT: num_gem_sets');
            break;
          }
          continue;
        }
        --num_gems;
        --num_gem_sets;
        cell.tile = TILE_GEM_UNLIT;
        gem_sets.push({ x, y, pts: [[x,y]] });
      }
    }
    aborts = 100;
    while (num_gems) {
      let set = gem_sets[rand.range(gem_sets.length)];
      let pt = set.pts[rand.range(set.pts.length)];
      let delta = GEM_DELTA[rand.range(GEM_DELTA.length)];
      let xx = pt[0] + delta[0];
      let yy = pt[1] + delta[1];
      if (yy < 1 || yy >= BOARD_H - 1 || xx < 1 || xx >= BOARD_W - 1) {
        continue;
      }
      let cell = map[yy][xx];
      if (cell.tile === TILE_GEM_UNLIT || !cell.is_ore_vein || cell.is_ore_vein_edge) {
        if (!--aborts) {
          console.log('ABORT: num_gems');
          break;
        }
        continue;
      }
      --num_gems;
      cell.tile = TILE_GEM_UNLIT;
      set.pts.push([xx,yy]);
      if (delta.length > 2) {
        // xx = pt[0] + delta[2];
        // yy = pt[1] + delta[3];
        // if (map[yy][xx] === TILE_SOLID) {
        //   map[yy][xx] = TILE_CRACKED;
        // }
      }
    }
    if (num_gems) {
      this.gems_total -= num_gems;
    }

    // Lava
    let num_lava = level_idx;
    let { lava_min_size, lava_max_size } = level_def;
    aborts = 100;
    for (let ii = 0; ii < num_lava; ++ii) {
      let x = 1 + rand.range(BOARD_W - 2);
      let y = 1 + rand.range(BOARD_H - 2);
      if (map[y][x].tile !== TILE_SOLID) {
        if (!--aborts) {
          console.log('ABORT: num_lava');
          break;
        }
        --ii;
        continue;
      }
      let size = lava_min_size + rand.range(lava_max_size - lava_min_size + 1);
      let pts = [[x,y]];
      map[y][x].tile = TILE_LAVA;
      while (size) {
        --size;
        let pt = pts[rand.range(pts.length)];
        let delta = LAVA_DELTA[rand.range(LAVA_DELTA.length)];
        let xx = pt[0] + delta[0];
        let yy = pt[1] + delta[1];
        if (yy < 1 || yy >= BOARD_H - 1 || xx < 1 || xx >= BOARD_W - 1) {
          continue;
        }
        if (map[yy][xx].tile !== TILE_SOLID) {
          continue;
        }
        map[yy][xx].tile = TILE_LAVA;
        pts.push([xx,yy]);
      }
    }

    // Paint cracked
    for (let yy = 1; yy < BOARD_H - 1; ++yy) {
      for (let xx = 1; xx < BOARD_W - 1; ++xx) {
        if (map[yy][xx].tile === TILE_SOLID) {
          let count = 0;
          for (let ii = 0; ii < DX.length; ++ii) {
            let x2 = xx + DX[ii];
            let y2 = yy + DY[ii];
            if (map[y2][x2].tile === TILE_GEM_UNLIT) {
              ++count;
            }
          }
          if (count === 1) {
            map[yy][xx].tile = TILE_CRACKED_1;
          } else if (count === 2) {
            map[yy][xx].tile = TILE_CRACKED_2;
          } else if (count === 3) {
            map[yy][xx].tile = TILE_CRACKED_3;
          }
        }
      }
    }

    // noise test
    if (NOISE_DEBUG) {
      for (let yy = 1; yy < BOARD_H - 1; ++yy) {
        for (let xx = 1; xx < BOARD_W - 1; ++xx) {
          map[yy][xx].lit = noise_3d(xx * NOISE_FREQ_XY, yy * NOISE_FREQ_XY, level_idx * NOISE_FREQ_Z);
        }
      }
    }
  }

  addOpenings(next_level) {
    let { map, num_openings_good, num_openings_bad, rand } = this;
    // openings
    let possible_spots_good = [];
    let possible_spots_bad = [];
    for (let yy = 0; yy < BOARD_H; ++yy) {
      let row = map[yy];
      for (let xx = 0; xx < BOARD_W; ++xx) {
        if (row[xx].tile === TILE_OPEN) {
          if (!canWalkThrough(next_level.get(xx, yy))) {
            possible_spots_bad.push([xx,yy]);
          } else {
            possible_spots_good.push([xx,yy]);
          }
        }
      }
    }
    while (num_openings_good && possible_spots_good.length) {
      --num_openings_good;
      let idx = rand.range(possible_spots_good.length);
      let pos = possible_spots_good[idx];
      ridx(possible_spots_good, idx);
      map[pos[1]][pos[0]].tile = TILE_BRIDGE;
    }
    while (num_openings_bad && possible_spots_bad.length) {
      --num_openings_bad;
      let idx = rand.range(possible_spots_bad.length);
      let pos = possible_spots_bad[idx];
      ridx(possible_spots_bad, idx);
      map[pos[1]][pos[0]].tile = TILE_BRIDGE;
    }
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return TILE_SOLID;
    }
    return this.map[y][x].tile;
  }

  getCell(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return dummy_cell;
    }
    return this.map[y][x];
  }

  isSolid(x, y) {
    return isSolid(this.get(x, y));
  }

  draw(z, color, next_level, noise_3d) {
    let { map } = this;
    for (let yy = 0; yy < this.h; ++yy) {
      let row = map[yy];
      for (let xx = 0; xx < this.w; ++xx) {
        let cell = row[xx];
        if (cell.visible || debug_visible) {
          let { tile } = cell;
          if ((!debug_visible || cell.visible) && next_level && canSeeThroughToBelow(tile)) {
            next_level.setVisibleFromAbove(xx, yy);
          }
          let cc = color;
          let lvalue = cell.lit;
          if (tile === TILE_LAVA) {
            lvalue = 1;
            tile = TILE_LAVA + floor(cell.lava_freq * engine.frame_timestamp) % 3;
          }
          if (NOISE_DEBUG) {
            cc = v3lerp(temp_color, cell.lit, [0,0,0,1], [1,1,1,1]);
          } else if (!cell.visible) {
            cc = color_debug_visible;
          } else if (lvalue !== 1) {
            cc = v3lerp(temp_color, lvalue, color_unlit, color);
          }
          let zz = z;
          if (tile === TILE_GEM || tile === TILE_GEM_UNLIT) {
            sprite_tiles.draw({
              x: xx * TILE_W,
              y: yy * TILE_W,
              z: zz,
              frame: TILE_OPEN,
              color: cc,
            });
            zz += 0.01;
          }
          if (tile === TILE_BRIDGE && next_level && next_level.isSolid(xx, yy)) {
            tile = TILE_BRIDGE_OVER_STONE;
          }
          if (!canSeeThrough(tile) && cell.is_ore_vein) {
            sprite_twinkle.draw({
              x: xx * TILE_W,
              y: yy * TILE_W,
              z: zz + 0.01,
              frame: cell.ore_frame,
              color: cc,
            });
            sprite_twinkle.draw({
              x: xx * TILE_W,
              y: yy * TILE_W,
              z: zz + 0.01,
              frame: ((cell.ore_frame + 4) % 9),
              color: cc,
            });
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
    // for (let yy = 0; yy < BOARD_H; ++yy) {
    //   for (let xx = 0; xx < BOARD_W; ++xx) {
    //     if (this.map[yy][xx].tile === TILE_GEM && this.map[yy][xx].visible) {
    //       particle(xx, yy, 'gem_found');,
    //     }
    //   }
    // }
  }

  setCellVisible(x, y, lit_value, walkable) {
    if (!this.map[y][x].visible) {
      this.map[y][x].visible = true;
    }
    if (this.map[y][x].tile === TILE_GEM_UNLIT && lit_value > 0.5 && walkable) {
      if (this.particles) {
        ui.playUISound('gem_found');
        particle(x, y, 'gem_found');
      }
      this.map[y][x].tile = TILE_GEM;
      this.gems_found++;
    }
  }

  setVisibleFromAbove(x, y) {
    this.map[y][x].lit = 1;
    for (let ii = 0; ii < DX_ABOVE.length; ++ii) {
      let xx = x + DX_ABOVE[ii];
      let yy = y + DY_ABOVE[ii];
      if (xx < 0 || xx >= BOARD_W || yy < 0 || yy >= BOARD_H) {
        continue;
      }
      this.setCellVisible(xx, yy);
    }
  }

  tickVisibility(x0, y0) {
    let { map } = this;
    let dvis = engine.frame_dt * 0.001;
    if (!NOISE_DEBUG) {
      for (let yy = 0; yy < BOARD_H; ++yy) {
        let row = map[yy];
        for (let xx = 0; xx < BOARD_W; ++xx) {
          let cell = row[xx];
          cell.lit = max(0, cell.lit - dvis);
        }
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

  checkGameOver(pos, next_level) {
    let todo = [];
    let done = {};
    function add(pair) {
      let key = pair[0] + pair[1] * BOARD_W;
      if (done[key]) {
        return;
      }
      done[key] = true;
      todo.push(pair);
    }
    add(v2floor([], pos));
    while (todo.length) {
      let pair = todo.pop();
      let tile = this.get(pair[0], pair[1]);
      if (!canWalkThrough(tile)) {
        continue;
      }
      if (canSeeThroughToBelow(tile) && canWalkThrough(next_level.get(pair[0], pair[1]))) {
        return false;
      }
      for (let ii = 0; ii < DX.length; ++ii) {
        add([pair[0] + DX[ii], pair[1] + DY[ii]]);
      }
    }
    return true;
  }
}

const dir_to_rot = [PI/2, PI, 3*PI/2, 0];

function highlightTile(xx, yy, color) {
  let w = 1;
  let w_offs = 0.9/2;
  ui.drawHollowRect(xx * TILE_W + w_offs, yy * TILE_W + w_offs,
    (xx+1)*TILE_W - w_offs, (yy+1)*TILE_W - w_offs, Z.PLAYER - 1,
    w, 1, color);
}

let descend_anim;

class GameState {
  constructor() {
    this.gems_found = 0;
    this.gems_total = 0;
    this.level = 1;
    this.noise_3d = createNoise3D(random_seed ? `3d.${random()}` : '3da');
    this.cur_level = new Level(mashString(random_seed ? `1.${random()}` : '1a'), this.noise_3d, this.level);
    this.cur_level.activateParticles();
    this.next_level = new Level(mashString(random_seed ? `2.${random()}` : '2a'), this.noise_3d, this.level + 1);
    this.cur_level.addOpenings(this.next_level);
    this.pos = this.cur_level.spawn_pos.slice(0);
    this.run_time = 0;
    player_animation.setState('idle_down');
    this.player_dir = 3; // down
    this.active_pos = vec2();
    this.active_drills = [];
    this.shovels = level_def.shovels_init;
    this.drills = level_def.drills_init;
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

  canGoDown() {
    return (!REQUIRE_NO_TOOLS || this.mustGoDown()) && !this.active_drills.length;
  }
  mustGoDown() {
    return !this.shovels && !this.drills && !this.active_drills.length;
  }

  draw() {
    let drill_trigger = null;
    this.setMainCamera();
    let posx = this.pos[0] * TILE_W;
    let posy = this.pos[1] * TILE_W;
    this.cur_level.tickVisibility(this.pos[0], this.pos[1]);
    let show_lower = input.keyDown(KEYS.SHIFT);
    let dig_action;
    let ax = this.active_pos[0];
    let ay = this.active_pos[1];
    if (!show_lower) {
      this.cur_level.draw(Z.LEVEL, color_white, this.next_level, this.noise_3d);
      if (ax > 0 && ay > 0 && ax < BOARD_W - 1 && ay < BOARD_H - 1/* && !this.active_drills.length*/) {
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
            if (this.cur_level.get(xx, yy) === TILE_OPEN) {
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
            if (!this.cur_level.map[yy][xx].visible || !forceStopsDrill(this.cur_level.get(xx, yy))) {
              let a = 1 - ii/5;
              highlightTile(xx, yy, [a,0.5*a,0,1]);
            } else {
              break;
            }
          }
          drill_trigger = { x: ax, y: ay };
          dig_action = 'drill';
        }
      }
      for (let ii = 0; ii < this.active_drills.length; ++ii) {
        let ad = this.active_drills[ii];
        sprite_drill.draw({
          x: (ad.pos[0] + 0.5) * TILE_W,
          y: (ad.pos[1] + 0.5) * TILE_W,
          z: Z.PLAYER - 1,
          frame: anim_drill.getFrame(engine.frame_dt),
          rot: dir_to_rot[ad.dir],
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

    let do_drill = false;
    if (drill_trigger && this.target_pos &&
      drill_trigger.x === this.target_pos[0] && drill_trigger.y === this.target_pos[1]
    ) {
      if (this.drill_trigger) {
        this.drill_trigger.counter += engine.frame_dt;
      } else {
        this.drill_trigger = drill_trigger;
        this.drill_trigger.counter = 0;
      }
      sprite_timer.draw({
        x: drill_trigger.x * TILE_W,
        y: drill_trigger.y * TILE_W,
        z: Z.PLAYER,
        frame: min(floor(this.drill_trigger.counter / DRILL_TRIGGER_TIME * 9), 8),
        color: [1,1,1,0.8],
      });
      if (this.drill_trigger.counter > DRILL_TRIGGER_TIME) {
        do_drill = true;
      }
    } else {
      this.drill_trigger = null;
    }

    let ix = floor(this.pos[0]);
    let iy = floor(this.pos[1]);
    let message;
    let message_style = style_overlay;
    if (!show_lower/* && !this.active_drills.length*/) {
      let cur_tile = this.cur_level.get(ax, ay);
      let next_tile = this.next_level.get(ax, ay);
      if (this.canGoDown()) {
        if (cur_tile === TILE_BRIDGE && canWalkThrough(next_tile)) {
          dig_action = 'descend';
          if (!this.mustGoDown()) {
            message = 'Descend when you\'re ready';
            message_style = style_hint;
          }
          highlightTile(ax, ay, [0,1,0,1]);
        } else if (cur_tile === TILE_BRIDGE) {
          message = 'You can\'t jump down here.';
          highlightTile(ax, ay, [0.1,0.1,0.1,1]);
        } else if (this.mustGoDown()) {
          message = 'Out of tools! Find a clear hole to jump down.';
          highlightTile(ax, ay, [0.1,0.1,0.1,1]);
        }
      } else if (cur_tile === TILE_GEM) {
        message = 'This is a Gem.  Score!';
        highlightTile(ax, ay, pico8.colors[10]);
        message_style = style_hint;
      } else if (cur_tile === TILE_LAVA) {
        message = 'You\'re not stupid enough to step in this.';
        highlightTile(ax, ay, pico8.colors[9]);
        message_style = style_hint;
      } else if (cur_tile === TILE_GEM_UNLIT) {
        message = 'This is a Gem, you must get close to claim it.';
        highlightTile(ax, ay, pico8.colors[10]);
        message_style = style_hint;
      } else if (cur_tile === TILE_BRIDGE) {
        if (canWalkThrough(next_tile)) {
          message = `This is a hole, jump down it when you are ${REQUIRE_NO_TOOLS ? 'out of tools' : 'ready'}.`;
          highlightTile(ax, ay, [0.1,0.1,0.1,1]);
          message_style = style_hint;
        } else {
          message = `A hole was dug here, but it is not ${next_tile === TILE_LAVA ? 'safe' : 'clear'} below.`;
          highlightTile(ax, ay, [0.1,0.1,0.1,1]);
          message_style = style_hint;
        }
      } else if (cur_tile === TILE_CRACKED_1) {
        message = 'This crack indicates ONE adjacent Gem.';
        highlightTile(ax, ay, [0.1,0.1,0.1,1]);
        message_style = style_hint;
      } else if (cur_tile === TILE_CRACKED_2) {
        message = 'This crack indicates TWO adjacent Gems.';
        highlightTile(ax, ay, [0.1,0.1,0.1,1]);
        message_style = style_hint;
      } else if (cur_tile === TILE_CRACKED_3) {
        message = 'This crack indicates THREE adjacent Gems.';
        highlightTile(ax, ay, [0.1,0.1,0.1,1]);
        message_style = style_hint;
      }
    }
    // if (this.active_drills.length) {
    //   dig_action = null;
    //   message = null;
    // }

    if (!debug_zoom) {
      if (this.canGoDown()) {
        font.drawSizedAligned(style_overlay, posx, posy - TILE_W/2 - ui.font_height, Z.UI, ui.font_height,
          font.ALIGN.HCENTER, 0, 0, dig_action === 'descend' ? 'Go down here?' : this.mustGoDown() ?
            'Out of tools!' : '');
      }
      camera2d.zoom(posx, posy, 0.95);
    }
    this.next_level.draw(Z.LEVEL - 2, show_lower ? color_white : color_next_level, null, this.noise_3d);
    camera2d.setAspectFixed(game_width, game_height);
    if (dig_action === 'hole' || dig_action === 'drill') {
      if (ui.button({
        text: `[space] ${dig_action === 'hole' ? 'Dig hole' : 'Drill tunnel'}`,
        x: game_width - ui.button_width,
        y: game_height - ui.button_height,
      }) || input.keyDownEdge(KEYS.SPACE) || input.keyDownEdge(KEYS.E) || do_drill) {
        if (dig_action === 'hole') {
          --this.shovels;
          let good = false;
          for (let ii = 0; ii < DIG_DX.length; ++ii) {
            let yy = this.active_pos[1] + DIG_DY[ii];
            let xx = this.active_pos[0] + DIG_DX[ii];
            if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
              continue;
            }
            if (this.cur_level.get(xx, yy) === TILE_OPEN) {
              this.cur_level.map[yy][xx].tile = TILE_BRIDGE;
              particle(xx, yy, 'shovel');
              if (canWalkThrough(this.next_level.get(xx, yy))) {
                good = true;
              }
            }
          }
          ui.playUISound(good ? 'shovel1' : 'shovel2');
        } else {
          assert.equal(dig_action, 'drill');
          --this.drills;
          assert(ix !== this.active_pos[0] || iy !== this.active_pos[1]);
          this.active_drills.push({
            pos: this.active_pos.slice(0),
            dir: this.player_dir,
            count: 0,
            countdown: 0,
          });
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
        this.level++;
        this.next_level = new Level(mashString(random_seed ? `${random()}` : `${this.level+1}a`),
          this.noise_3d, this.level + 1);
        this.cur_level.addOpenings(this.next_level);
        this.pos[0] = ax + 0.5;
        this.pos[1] = ay + 0.5;
        ui.playUISound('descend');
        let fade_time = max(1200 - this.level * 100, 100);
        transition.queue(1000, transition.fade(fade_time));
        descend_anim = animation.create();
        let t = descend_anim.add(0, fade_time, nop);
        let num_shovels = level_def.shovels_add;
        let num_drills = level_def.drills_add;
        let tick_time = max(350 - this.level * 50, 150);
        for (let ii = 0; ii < num_shovels; ++ii) {
          let done = false;
          t = descend_anim.add(t, tick_time, (progress) => {
            if (!done) {
              done = true;
              this.shovels++;
              ui.playUISound('gem_found');
            }
          });
        }
        for (let ii = 0; ii < num_drills; ++ii) {
          let done = false;
          t = descend_anim.add(t, tick_time, (progress) => {
            if (!done) {
              done = true;
              this.drills++;
              ui.playUISound('gem_found');
            }
          });
        }
        t = descend_anim.add(t, 1, (progress) => {
          if (progress === 1) {
            transition.queue(1000, transition.fade(fade_time));
            // eslint-disable-next-line no-use-before-define
            engine.setState(play);
          }
        });
        // eslint-disable-next-line no-use-before-define
        engine.setState(descendInit);
      }
    }
    if (message) {
      font.drawSizedAligned(message_style, 4, game_height - ui.font_height - 4, Z.UI,
        ui.font_height, font.ALIGN.HCENTER, game_width - 8, 0, message);
    }

  }

  updateDrill(idx) {
    let active_drill = this.active_drills[idx];
    active_drill.countdown -= engine.frame_dt;
    if (active_drill.countdown > 0) {
      return;
    }
    active_drill.count++;
    active_drill.countdown += max(DRILL_TIME - active_drill.count*10, 16);
    let { dir, pos } = active_drill;
    let [xx, yy] = pos;
    let do_drill = this.cur_level.isSolid(xx, yy);
    if (do_drill) {
      particle(xx, yy, 'drill');
      this.cur_level.map[yy][xx].tile = TILE_OPEN;
    }
    pos[0] += DX[dir];
    pos[1] += DY[dir];
    xx = pos[0];
    yy = pos[1];
    if (xx <= 0 || yy <= 0 || xx >= BOARD_W - 1 || yy >= BOARD_H - 1) {
      ridx(this.active_drills, idx);
      particle(xx, yy, 'drill_stop');
      ui.playUISound('drill_stop');
      return;
    }
    let tile = this.cur_level.get(xx, yy);
    if (!isDrillable(tile) && active_drill.count >= 3 || forceStopsDrill(tile)) {
      ridx(this.active_drills, idx);
      particle(xx, yy, 'drill_stop');
      ui.playUISound('drill_stop');
      return;
    }
    if (do_drill) {
      ui.playUISound('drill_block');
    } else {
      ui.playUISound('drill_skip');
    }
  }

  setPlayerDir(dir) {
    if (this.player_dir === dir) {
      return;
    }
    player_animation.setState(ANIM_DIR[dir]);
    if (this.player_dir === (dir + 3) % 4 ||
      this.player_dir === dir ||
      this.player_dir === (dir + 1) % 4
    ) {
      // keep it
    } else {
      this.run_time = 0;
    }
    this.player_dir = dir;
  }

  update() {
    for (let ii = this.active_drills.length - 1; ii >= 0; --ii) {
      this.updateDrill(ii);
    }
    let dx = 0;
    dx -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A) + input.padButtonDown(PAD.LEFT);
    dx += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D) + input.padButtonDown(PAD.RIGHT);
    let dy = 0;
    dy -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W) + input.padButtonDown(PAD.UP);
    dy += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S) + input.padButtonDown(PAD.DOWN);
    if (sqrt(dx * dx + dy * dy) > engine.frame_dt) {
      let temp = v2scale([], v2normalize([], [dx, dy]), engine.frame_dt);
      dx = temp[0];
      dy = temp[1];
    }
    let { pos, cur_level } = this;
    let ix = floor(pos[0]);
    let iy = floor(pos[1]);
    let speed = 0.005;
    if (abs(dx) + abs(dy)) {
      this.run_time += engine.frame_dt;
      if (this.run_time > 800) {
        speed *= 1.5;
      }
      if (abs(dx) > abs(dy)) {
        if (dx < 0) {
          this.target_pos = [floor(pos[0] - 0.5), iy];
          this.setPlayerDir(0);
        } else {
          this.target_pos = [floor(pos[0] + 0.5), iy];
          this.setPlayerDir(2);
        }
      } else {
        if (dy < 0) {
          this.target_pos = [ix, floor(pos[1] - 0.5)];
          this.setPlayerDir(1);
        } else {
          this.target_pos = [ix, floor(pos[1] + 0.5)];
          this.setPlayerDir(3);
        }
      }
    } else {
      this.target_pos = null;
      this.run_time = 0;
    }

    dx *= speed;
    dy *= speed;
    let x2 = pos[0] + dx;
    let y2 = pos[1] + dy;
    const PLAYER_R = 0.25;
    if (!debug_freecam) {
      let xleft = floor(x2 - PLAYER_R);
      let hit_wall = false;
      if (!canWalkThrough(cur_level.get(xleft, iy))) {
        x2 = xleft + 1 + PLAYER_R;
        hit_wall = true;
      }
      let xright = floor(x2 + PLAYER_R);
      if (!canWalkThrough(cur_level.get(xright, iy))) {
        x2 = xright - PLAYER_R;
        hit_wall = true;
      }
      let yup = floor(y2 - PLAYER_R);
      if (!canWalkThrough(cur_level.get(ix, yup))) {
        y2 = yup + 1 + PLAYER_R;
        hit_wall = true;
      }
      let ydown = floor(y2 + PLAYER_R);
      if (!canWalkThrough(cur_level.get(ix, ydown))) {
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

    if (this.mustGoDown() && !this.cur_level.did_game_over_detect) {
      this.cur_level.did_game_over_detect = true;
      if (this.cur_level.checkGameOver(this.pos, this.next_level)) {
        ui.modalDialog({
          title: 'Game Over',
          text: 'Sorry, you\'re stuck, with no way to proceed!  Probably you\'re just unlucky?',
          buttons: {
            OK: null
          },
        });
      }
    }
  }
}

let state;

function colorCount(count) {
  return font.styleColored(style_overlay, count === 1 ?
    pico8.font_colors[9] : count ? pico8.font_colors[7] : pico8.font_colors[8]);
}

function hudShared() {
  let icon_size = ui.font_height * 2;

  let y = 0;
  if (state.gems_total) {
    sprite_tiles_ui.draw({
      x: game_width - 4 - icon_size, y, w: icon_size, h: icon_size, z: Z.UI,
      frame: TILE_GEM_UI,
    });
    font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HRIGHT, 0, 0,
      //`Score: ${state.gems_found + state.cur_level.gems_found}`);
      `Total: ${state.gems_found + state.cur_level.gems_found}/${state.gems_total + state.cur_level.gems_total}`);
    y += icon_size + 4;
  }
  sprite_tiles_ui.draw({
    x: game_width - 4 - icon_size, y, w: icon_size, h: icon_size, z: Z.UI,
    frame: TILE_GEM_UI,
  });
  font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
    font.ALIGN.HRIGHT, 0, 0,
    `${state.gems_total ? 'Level: ' : ''}${state.cur_level.gems_found}/${state.cur_level.gems_total}`);
  y += icon_size + 4;

  font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
    font.ALIGN.HRIGHT, 0, 0,
    `Level: ${state.level}`);
  y += icon_size + 4;

  if ('tools on botttom') {
    y = game_height - ui.font_height - 4 * 2 - icon_size;
    if (state.pos[1] > BOARD_H - 4) {
      y = 4;
    }
    let x = game_width / 2 - icon_size - 8;
    sprite_tiles_ui.draw({
      x, y, w: icon_size, h: icon_size, z: Z.UI,
      frame: TILE_SHOVEL,
    });
    font.drawSizedAligned(colorCount(state.shovels), x, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HRIGHT, 0, 0,
      `${state.shovels}`);

    x = game_width / 2 + 2;
    x += font.drawSizedAligned(colorCount(state.drills), x, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HLEFT, 0, 0,
      `${state.drills}`);
    sprite_drill_ui.draw({
      x, y: y + icon_size, w: icon_size, h: icon_size, z: Z.UI,
      frame: 0,
      rot: 3*PI/2,
    });
  } else {
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
  }
}

function play(dt) {
  gl.clearColor(0, 0, 0, 1);

  if (state.pos[0] > 4 || state.pos[1] > 3) {
    ui.print(style_overlay, 4, 4, Z.UI, '[shift] - view level below');
    ui.print(style_overlay, 4, 4+ui.font_height, Z.UI, '[WASD] - move');
    ui.print(style_overlay, 4, 4+ui.font_height*2, Z.UI, '[esc] - menu');
    //ui.print(style_overlay, 4, 4+ui.font_height*3, Z.UI, '[Z] - zoom out');
  }

  hudShared();

  if (engine.DEBUG) {
    if (input.keyDownEdge(KEYS.R)) {
      random_seed = true;
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
  if (input.keyDownEdge(KEYS.ESC)) {
    // eslint-disable-next-line no-use-before-define
    engine.setState(titleInit);
    transition.queue(Z.TRANSITION_FINAL, transition.splitScreen(500, 4, false));
  }
}

let pumping = false;
let pump_timeout;
function pumpMusicCancel() {
  if (pumping) {
    clearTimeout(pump_timeout);
    pumping = false;
  }
}
function pumpMusic() {
  if (pumping || !settings.music) {
    return;
  }
  pumping = true;
  // soundPlayMusic('msg_out');
  // pump_timeout = setTimeout(function () {
  //   pumping = false;
  //   pumpMusic();
  // }, 10*1000);
  soundPlayMusic('music1');
  pump_timeout = setTimeout(function () {
    pumping = false;
    pumpMusic();
  }, 6*60*1000);
}

function playInit(dt) {
  state = new GameState();
  engine.setState(play);
  play(dt);
}

function descend(dt) {
  descend_anim.update(dt);
  hudShared();
}
function descendInit(dt) {
  engine.setState(descend);
  descend(dt);
}

function killFX() {
  engine.glov_particles.killAll();
}

let title_state;
let title_seq;
function title(dt) {
  gl.clearColor(0, 0, 0, 1);
  title_seq.update(dt);
  let y = 20;
  title_font.drawSizedAligned(glov_font.styleAlpha(title_style, title_state.fade0),
    0, y, Z.UI, 32, font.ALIGN.HCENTER, game_width, 0,
    'Dwarven Surveyor');

  y += 32 + 5;

  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style2, title_state.fade2),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'by Jimb Esser in 48 hours for Ludum Dare 48');

  y += ui.font_height + 16;

  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style, title_state.fade1),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'Use your Drills to find Gems on the current level');
  y += ui.font_height + 4;

  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style, title_state.fade1),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'Use your Shovels to scout out the next level');
  y += ui.font_height + 4;

  y += 16;
  if (title_state.fade3) {
    if (ui.buttonText({
      x: floor(game_width/2 - ui.button_width/2),
      y,
      text: state ? 'Resume' : 'Play'
    }) || input.keyDownEdge(KEYS.ESC)) {
      transition.queue(Z.TRANSITION_FINAL, transition.splitScreen(500, 4, false));
      engine.setState(state ? play : playInit);
    }

    let snd_w = 64;
    if (ui.button({
      text: `Music: ${settings.music ? '☏' : '☎'}`,
      x: game_width - snd_w - 8,
      y: game_height - ui.button_height - 8,
      w: snd_w,
    })) {
      settings.set('music', 1 - settings.music);
      if (settings.music) {
        pumpMusic();
      } else {
        pumpMusicCancel();
      }
    }
    if (ui.button({
      text: `Sound FX: ${settings.sound ? '☏' : '☎'}`,
      x: game_width - (snd_w + 8) * 2,
      y: game_height - ui.button_height - 8,
      w: snd_w,
    })) {
      settings.set('sound', 1 - settings.sound);
    }
  }
}

let first_time = true;
function titleInit(dt) {
  killFX();
  title_state = {
    fade0: 0,
    fade1: 0,
    fade2: 0,
    fade3: 0,
    fade4: 0,
  };
  title_seq = animation.create();
  let t = title_seq.add(0, 300, (v) => (title_state.fade0 = v));
  t = title_seq.add(t, 500, nop);
  t = title_seq.add(t, 300, (v) => (title_state.fade1 = v));
  t = title_seq.add(t, 500, nop);
  t = title_seq.add(t, 300, (v) => (title_state.fade2 = v));
  t = title_seq.add(t, 500, nop);
  title_seq.add(t, 300, (v) => (title_state.fade3 = v));
  if (!first_time || engine.DEBUG) {
    title_seq.update(30000);
  }
  first_time = false;
  engine.setState(title);
  title(dt);
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
    gem_found: ['pickup1b', 'pickup1b', 'pickup1b', 'pickup1b', 'pickup2b', 'pickup3b', 'pickup4b', 'pickup5b'],
    drill_block: ['dig1', 'dig2'],
    drill_stop: ['dig_stop'],
    drill_skip: ['dig_skip'],
    shovel1: ['hole1'],
    shovel2: ['hole2'],
    descend: 'descend',
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
  title_font = ui.title_font;
  v4copy(engine.border_color, pico8.colors[5]);

  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  particles.preloadParticleData(particle_data);
  sprite_tiles = sprites.create({
    name: 'tiles',
    size: vec2(TILE_W, TILE_W),
    ws: [16, 16, 16, 16],
    hs: [16, 16, 16, 16],
    origin: vec2(0,0),
  });
  sprite_tiles_ui = sprites.create({
    name: 'tiles',
    ws: [16, 16, 16, 16],
    hs: [16, 16, 16, 16],
    origin: vec2(0,0),
  });
  sprite_twinkle = sprites.create({
    name: 'twinkle',
    size: vec2(TILE_W, TILE_W),
    ws: [16, 16, 16],
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
    name: 'drill',
    ws: [16,16],
    hs: [16,16],
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0.5, 0.5),
  });
  sprite_drill_ui = sprites.create({
    name: 'drill',
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
  sprite_timer = sprites.create({
    name: 'timer',
    ws: [16,16,16],
    hs: [16,16,16],
    size: vec2(TILE_W, TILE_W),
    origin: vec2(0, 0),
  });

  pumpMusic();
  engine.setState(engine.DEBUG ? playInit : titleInit);
}

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
const score_system = require('./glov/score.js');
const settings = require('./glov/settings.js');
const { soundPlayMusic } = require('./glov/sound.js');
const sprites = require('./glov/sprites.js');
const sprite_animation = require('./glov/sprite_animation.js');
const transition = require('./glov/transition.js');
const { clamp, easeOut, nop, ridx } = require('../common/util.js');
const {
  vec2, v2add, v2addScale, v2floor, v2lengthSq, v2normalize, v2sub, v2scale,
  v3copy, v3lerp, vec4, v4copy,
} = require('./glov/vmath.js');

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.LEVEL = 10;
Z.PLAYER = 15;
Z.PARTICLES = 20;
Z.UI_TEST = 200;


const seedmod = 'e';
const NOISE_FREQ_XY = 0.1;
const NOISE_FREQ_Z = 0.2;
const level_defs = {
  endless: {
    score_idx: 1,
    w: 48,
    h: 32,
    num_rooms: 15,
    num_openings: 10,
    gems_per_floor: 100,
    gems_per_floor_min: 10,
    num_gem_sets: 20,
    room_min_size: 8,
    room_max_size: 64,
    lava_min_size: 32,
    lava_max_size: 96,
    lava_max: 12,
    shovels_init: 3,
    drills_init: 5,
    shovels_add: 6,
    drills_add: 5,
    random_seed: true,
    holes: 4,
  },
  score_attack: {
    score_idx: 0,
    w: 48/2,
    h: 32/2,
    num_rooms: 6,
    num_openings: 2,
    gems_per_floor: 20,
    gems_per_floor_min: 2,
    num_gem_sets: 4,
    room_min_size: 6,
    room_max_size: 28,
    lava_min_size: 16,
    lava_max_size: 32,
    lava_max: Infinity,
    shovels_init: 3,
    drills_init: 5,
    shovels_add: 2,
    drills_add: 3,
    holes: 12,
    max_levels: 10,
    random_seed: false,
  },
};
let level_def = level_defs.score_attack;
const REQUIRE_NO_TOOLS = false;

let NOISE_DEBUG = false;
let debug_zoom = false;
let debug_visible = false;
let debug_freecam = false;


// Virtual viewport for our game logic
const game_width = 384;
const game_height = 256;

const TILE_SOLID = 0;
const TILE_LAVA = 1; // 2, 3
const TILE_OPEN = 4; // 5, 6
const TILE_BRIDGE = 7;
const TILE_PIT = 9;
const TILE_BRIDGE_OVER_STONE = 10;
const TILE_GEM = 11;
const TILE_GEM_UI = 12;
const TILE_GEM_UNLIT = 13;
const TILE_CRACKED_1 = 14;
const TILE_CRACKED_2 = 15;
const TILE_CRACKED_3 = 16;
const TILE_SHOVEL = 17;

const DRILL_TIME = 400;
// const DIG_LEN = 5;
const DRILL_TRIGGER_TIME = 1000;

const TILE_W = 16;
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
const ANIM_DIR_WALK = ['walk_left', 'walk_up', 'walk_right', 'walk_down'];

const DX = [-1, 0, 1, 0];
const DY = [0, -1, 0, 1];

const DX_ABOVE = [-1, 0, 1, -1, 0, 1, -1, 0, 1, -2, 2, 0, 0];
const DY_ABOVE = [-1, -1, -1, 0, 0, 0, 1, 1, 1, 0, 0, -2, 2];
const DX_ABOVE_PIT = [0, -1, 0, 1, 0];
const DY_ABOVE_PIT = [-1, 0, 0, 0, 1];

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

let state;

function esc() {
  return input.keyDownEdge(KEYS.ESC) || input.padButtonDownEdge(PAD.B);
}

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
const style_overlay_red = glov_font.style(null, {
  color: pico8.font_colors[8],
  outline_width: 2,
  outline_color: 0x000000ff,
});
const style_found_all = glov_font.style(style_overlay, {
  color: 0x00FF00ff,
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
  return engine.glov_particles.createSystem(particle_data.defs[key],
    [(xx + 0.5) * TILE_W, (yy + 0.5) * TILE_W, Z.PARTICLES]
  );
}


let temp_color = vec4(0,0,0,1);

class MapEntry {
  constructor(x, y) {
    this.tile = TILE_SOLID;
    this.lava_freq = 1;
    this.lava_part = null;
    this.visible = false;
    this.is_ore_vein = false;
    this.is_ore_vein_edge = false;
    this.ore_chance = 0;
    this.ore_frame = floor(random() * 9);
    this.lit = 0;
  }
}
const dummy_cell = new MapEntry();
let gems_found_at = 0;

let temp_color2 = vec4();
function drawTwinkle(param) {
  let frame = param.frame;
  let orig_a = param.color[3];
  let a = engine.frame_timestamp * 0.002 % 9;
  v3copy(temp_color2, param.color);
  param.color = temp_color2;

  let ipart = floor(a);
  let fpart = (a - ipart);
  temp_color2[3] = fpart * orig_a;
  param.frame = (frame + ipart) % 9;
  sprite_twinkle.draw(param);

  temp_color2[3] = (1 - fpart) * orig_a;
  param.frame = (frame + ipart + 8) % 9;
  sprite_twinkle.draw(param);
}


class Level {
  constructor(seed, noise_3d, level_idx) {
    this.w = level_def.w;
    this.h = level_def.h;
    this.particles = false;
    this.did_game_over_detect = false;
    this.ever_seen = false;
    let ore_vein_threshold = 0.5;
    let map;
    let num_gems = this.gems_total = max(level_def.gems_per_floor - (level_idx - 1), level_def.gems_per_floor_min);
    while (true) {
      map = this.map = [];
      let num_ore_vein = 0;
      for (let yy = 0; yy < this.h; ++yy) {
        map[yy] = [];
        for (let xx = 0; xx < this.w; ++xx) {
          let cell = new MapEntry(xx, yy);
          map[yy].push(cell);
          cell.lava_freq = randSimpleSpatial(xx, yy, 0) * 0.001;
          let r = noise_3d(xx * NOISE_FREQ_XY, yy * NOISE_FREQ_XY, level_idx * NOISE_FREQ_Z);
          if (r < ore_vein_threshold) {
            cell.is_ore_vein = true;
            ++num_ore_vein;
            r = 1 - r * 2;
            cell.ore_chance = r * r;
          }
        }
      }
      if (num_ore_vein < num_gems * 1.5) {
        ore_vein_threshold = 1 - (1 - ore_vein_threshold) * 0.5;
        continue;
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
      if (num_non_edge < num_gems * 1.25) {
        ore_vein_threshold = 1 - (1 - ore_vein_threshold) * 0.5;
        continue;
      }
      break;
    }

    let rand = this.rand = randCreate(seed);
    // rooms
    let { num_rooms } = level_def;
    this.num_openings_good = level_def.num_openings;
    this.num_openings_bad = level_def.num_openings;
    // for (let ii = 0; ii < num_rooms; ++ii) {
    //   let w = 2 + rand.range(8);
    //   let h = 2 + rand.range(8);
    //   let x = 1 + rand.range(this.w - w - 2);
    //   let y = 1 + rand.range(this.h - h - 2);
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
      let x = 1 + rand.range(this.w - 2);
      let y = 1 + rand.range(this.h - 2);
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
        if (yy < 1 || yy >= this.h - 1 || xx < 1 || xx >= this.w - 1) {
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
    num_gem_sets = min(num_gem_sets, max(floor(num_gems/2), 2));
    aborts = 100;
    while (num_gem_sets) {
      let x = 1 + rand.range(this.w - 2);
      let y = 1 + rand.range(this.h - 2);
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
      if (yy < 1 || yy >= this.h - 1 || xx < 1 || xx >= this.w - 1) {
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
    let num_lava = min(level_idx, level_def.lava_max);
    let { lava_min_size, lava_max_size } = level_def;
    aborts = 100;
    for (let ii = 0; ii < num_lava; ++ii) {
      let x = 1 + rand.range(this.w - 2);
      let y = 1 + rand.range(this.h - 2);
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
        if (yy < 1 || yy >= this.h - 1 || xx < 1 || xx >= this.w - 1) {
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
    for (let yy = 1; yy < this.h - 1; ++yy) {
      for (let xx = 1; xx < this.w - 1; ++xx) {
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
          } else if (count >= 3) {
            map[yy][xx].tile = TILE_CRACKED_3;
          }
        }
      }
    }

    // carve random holes
    let { holes } = level_def;
    let possible_holes = [];
    for (let yy = 1; yy < this.h - 1; ++yy) {
      for (let xx = 1; xx < this.w - 1; ++xx) {
        if (this.get(xx, yy) === TILE_SOLID) {
          let neighbors = 0;
          for (let ii = 0; ii < DX.length; ++ii) {
            if (this.isSolid(xx + DX[ii], yy + DY[ii])) {
              ++neighbors;
            }
          }
          if (neighbors === 4) {
            possible_holes.push([xx,yy]);
          }
        }
      }
    }
    while (holes && possible_holes.length) {
      let idx = rand.range(possible_holes.length);
      let pair = possible_holes[idx];
      ridx(possible_holes, idx);
      this.map[pair[1]][pair[0]].tile = TILE_OPEN;
      --holes;
    }

    // noise test
    if (NOISE_DEBUG) {
      for (let yy = 1; yy < this.h - 1; ++yy) {
        for (let xx = 1; xx < this.w - 1; ++xx) {
          map[yy][xx].lit = noise_3d(xx * NOISE_FREQ_XY, yy * NOISE_FREQ_XY, level_idx * NOISE_FREQ_Z);
        }
      }
    }
  }

  addOpenings(next_level, player_pos) {
    let { map, num_openings_good, num_openings_bad, rand } = this;
    player_pos = v2floor([], player_pos);
    // openings
    let possible_spots_good = [];
    let possible_spots_bad = [];
    for (let yy = 0; yy < this.h; ++yy) {
      let row = map[yy];
      for (let xx = 0; xx < this.w; ++xx) {
        if (player_pos[0] === xx && player_pos[1] === yy) {
          continue;
        }
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
      map[pos[1]][pos[0]].tile = TILE_PIT;
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
            next_level.setVisibleFromAbove(xx, yy, tile);
          }
          let cc = color;
          let lvalue = cell.lit;
          if (tile === TILE_LAVA) {
            lvalue = 1;
            tile = TILE_LAVA + floor(cell.lava_freq * engine.frame_timestamp) % 3;
            if (next_level && cell.visible &&
              (!cell.lava_part || cell.lava_part.age > cell.lava_part.system_lifespan)
            ) {
              if (random() < 0.01) {
                cell.lava_part = particle(xx, yy, 'lava');
              }
            }
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
          if (tile === TILE_OPEN) {
            tile += cell.ore_frame % 3;
          }
          if (!canSeeThrough(tile) && cell.is_ore_vein || tile === TILE_GEM) {
            drawTwinkle({
              x: xx * TILE_W,
              y: yy * TILE_W,
              z: zz + 0.01,
              frame: cell.ore_frame,
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
    // for (let yy = 0; yy < this.h; ++yy) {
    //   for (let xx = 0; xx < this.w; ++xx) {
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
      state.gems_found++;
      state.updateHighScore();

      gems_found_at = engine.frame_timestamp;
      if (this.gems_found === this.gems_total) {
        ui.playUISound('level_complete');
      }
    }
  }

  setVisibleFromAbove(x, y, above_tile) {
    this.map[y][x].lit = 1;
    let dx_above = above_tile === TILE_PIT ? DX_ABOVE_PIT : DX_ABOVE;
    let dy_above = above_tile === TILE_PIT ? DY_ABOVE_PIT : DY_ABOVE;
    for (let ii = 0; ii < dx_above.length; ++ii) {
      let xx = x + dx_above[ii];
      let yy = y + dy_above[ii];
      if (xx < 0 || xx >= this.w || yy < 0 || yy >= this.h) {
        continue;
      }
      this.setCellVisible(xx, yy);
    }
  }

  tickVisibility(x0, y0, dt) {
    let { map } = this;
    let dvis = dt * 0.001;
    if (!NOISE_DEBUG) {
      for (let yy = 0; yy < this.h; ++yy) {
        let row = map[yy];
        for (let xx = 0; xx < this.w; ++xx) {
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
    let { w } = this;
    function add(pair) {
      let key = pair[0] + pair[1] * w;
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
let temp_v2 = vec2();
class GameState {
  constructor() {
    this.gems_found = 0;
    this.gems_total = 0;
    gems_found_at = 0;
    this.level = 1;
    this.noise_3d = createNoise3D(level_def.random_seed ? `3d.${random()}` : `3d${seedmod}`);
    this.cur_level = new Level(mashString(level_def.random_seed ? `1.${random()}` : `1${seedmod}`),
      this.noise_3d, this.level);
    this.cur_level.activateParticles();
    this.gems_total += this.cur_level.gems_total;
    this.next_level = new Level(mashString(level_def.random_seed ? `2.${random()}` : `2${seedmod}`),
      this.noise_3d, this.level+1);
    this.pos = this.cur_level.spawn_pos.slice(0);
    this.cur_level.addOpenings(this.next_level, this.pos);
    this.run_time = 0;
    player_animation.setState('idle_down');
    this.player_dir = 3; // down
    this.active_pos = vec2();
    this.active_drills = [];
    this.shovels = level_def.shovels_init;
    this.drills = level_def.drills_init;
    this.w = level_def.w;
    this.h = level_def.h;
    this.w_px = this.w * TILE_W;
    this.h_px = this.h * TILE_W;
  }

  updateHighScore() {
    score_system.setScore(level_def.score_idx,
      { level: state.level, gems: this.gems_found, tools: this.shovels + this.drills }
    );
  }

  setMainCamera() {
    camera2d.setAspectFixed(game_width, game_height);
    let posx = this.pos[0] * TILE_W;
    let posy = this.pos[1] * TILE_W;
    let shift_start = TILE_W * 5;
    let shiftx = clamp((posx - shift_start) / (this.w_px - shift_start * 2), 0, 1) * (this.w_px - game_width);
    let shifty = clamp((posy - shift_start) / (this.h_px - shift_start * 2), 0, 1) * (this.h_px - game_height);
    camera2d.shift(shiftx, shifty);
    if (debug_zoom) {
      camera2d.setAspectFixed(this.w_px, this.h_px);
    }
  }

  canGoDown() {
    return (!REQUIRE_NO_TOOLS || this.mustGoDown()) && !this.active_drills.length;
  }
  mustGoDown() {
    return !this.shovels && !this.drills && !this.active_drills.length;
  }

  drillAt(x, y) {
    for (let ii = 0; ii < this.active_drills.length; ++ii) {
      let ad = this.active_drills[ii];
      if (ad.pos[0] === x && ad.pos[1] === y) {
        return true;
      }
    }
    return false;
  }

  draw() {
    let drill_trigger = null;
    this.setMainCamera();
    let posx = this.pos[0] * TILE_W;
    let posy = this.pos[1] * TILE_W;
    let show_lower = input.keyDown(KEYS.SHIFT) || input.padButtonDown(PAD.LEFT_TRIGGER);
    if (show_lower) {
      this.next_level.ever_seen = true;
    }
    let dig_action;
    let ax = this.active_pos[0];
    let ay = this.active_pos[1];
    if (show_lower) {
      let { map } = this.cur_level;
      for (let yy = 0; yy < this.h; ++yy) {
        for (let xx = 0; xx < this.w; ++xx) {
          if (map[yy][xx].lava_part) {
            map[yy][xx].lava_part.kill_hard = true;
            map[yy][xx].lava_part = null;
          }
        }
      }
    } else {
      this.cur_level.draw(Z.LEVEL, color_white, this.next_level, this.noise_3d);
      if (ax > 0 && ay > 0 && ax < this.w - 1 && ay < this.h - 1/* && !this.active_drills.length*/) {
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
            if (xx <= 0 || yy <= 0 || xx >= this.w - 1 || yy >= this.h - 1) {
              continue;
            }
            if (this.cur_level.get(xx, yy) === TILE_OPEN) {
              highlightTile(xx, yy, [1,0.5,0,1]);
            }
          }
          dig_action = 'hole';
        } else if (this.drills && isDrillable(tile) && !this.drillAt(ax, ay)) {
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
            if (xx <= 0 || yy <= 0 || xx >= this.w - 1 || yy >= this.h - 1) {
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
        if ((cur_tile === TILE_BRIDGE || cur_tile === TILE_PIT) && canWalkThrough(next_tile)) {
          dig_action = 'descend';
          if (!this.mustGoDown()) {
            if (!this.next_level.ever_seen) {
              message = `HINT: View the next floor ${input.pad_mod ? '(LT)' : '(SHIFT)'} before descending`;
              highlightTile(ax, ay, pico8.colors[8]);
            } else if (this.level === 1 && !this.gems_found) {
              message = 'HINT: Find some gems before descending';
              highlightTile(ax, ay, pico8.colors[8]);
            } else if (this.next_level.ever_seen) {
              message = 'Descend when you\'re ready';
              message_style = style_hint;
              highlightTile(ax, ay, pico8.colors[11]);
            }
          } else {
            highlightTile(ax, ay, pico8.colors[11]);
          }
        } else if (cur_tile === TILE_BRIDGE) {
          message = 'You can\'t jump down here.';
          highlightTile(ax, ay, [0.1,0.1,0.1,1]);
        } else if (this.mustGoDown()) {
          message = 'Out of tools! Find a clear hole to jump down.';
          highlightTile(ax, ay, [0.1,0.1,0.1,1]);
        }
      }
      if (message) {
        // from above
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
          if (!dig_action) {
            highlightTile(ax, ay, [0.1,0.1,0.1,1]);
          }
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
    if (show_lower && !message) {
      message = `You get +${level_def.shovels_add} Shovels and +${level_def.drills_add} Drills per floor`;
      message_style = style_hint;
    }
    // if (this.active_drills.length) {
    //   dig_action = null;
    //   message = null;
    // }
    if (engine.DEBUG && input.keyDown(KEYS.K)) {
      dig_action = 'descend';
    }

    if (!debug_zoom) {
      if (this.canGoDown()) {
        if (dig_action === 'descend') {
          if (!this.next_level.ever_seen) {
            font.drawSizedAligned(this.next_level.ever_seen ? style_overlay : style_overlay_red,
              posx, posy - TILE_W/2 - ui.font_height, Z.UI, ui.font_height,
              font.ALIGN.HCENTER, 0, 0, this.next_level.ever_seen ? 'Go down here?' : 'What\'s down there?');
            dig_action = null;
          } else if (this.level === 1 && !this.gems_found) {
            font.drawSizedAligned(style_overlay,
              posx, posy - TILE_W/2 - ui.font_height, Z.UI, ui.font_height,
              font.ALIGN.HCENTER, 0, 0, 'I\'m not ready to go deeper yet');
            dig_action = null;
          } else {
            font.drawSizedAligned(style_overlay,
              posx, posy - TILE_W/2 - ui.font_height, Z.UI, ui.font_height,
              font.ALIGN.HCENTER, 0, 0, 'Go down here?');
          }
        } else if (this.mustGoDown()) {
          font.drawSizedAligned(style_overlay, posx, posy - TILE_W/2 - ui.font_height, Z.UI, ui.font_height,
            font.ALIGN.HCENTER, 0, 0, 'Out of tools!');
        }
      }
      camera2d.zoom(posx, posy, 0.95);
    }
    this.next_level.draw(Z.LEVEL - 2, show_lower ? color_white : color_next_level, null, this.noise_3d);
    camera2d.setAspectFixed(game_width, game_height);
    if (dig_action === 'hole' || dig_action === 'drill') {
      let do_button = input.keyDownEdge(KEYS.SPACE) || input.keyDownEdge(KEYS.E) || input.padButtonDownEdge(PAD.A);
      if (ui.button({
        text: `${input.pad_mode ? '[A]' : '[space]'} ${dig_action === 'hole' ? 'Dig hole' : 'Drill tunnel'}`,
        x: game_width - ui.button_width,
        y: game_height - ui.button_height,
      }) || do_button || do_drill) {
        if (dig_action === 'hole') {
          --this.shovels;
          let good = false;
          for (let ii = 0; ii < DIG_DX.length; ++ii) {
            let yy = this.active_pos[1] + DIG_DY[ii];
            let xx = this.active_pos[0] + DIG_DX[ii];
            if (xx <= 0 || yy <= 0 || xx >= this.w - 1 || yy >= this.h - 1) {
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
        this.level++;
        this.updateHighScore();
        if (this.level > level_def.max_levels || engine.DEBUG && input.keyDown(KEYS.L)) {
          transition.queue(Z.TRANSITION_FINAL, transition.fade(1000));
          // eslint-disable-next-line no-use-before-define
          engine.setState(gameOverInit);
        } else {
          let fade_time = max(1200 - this.level * 100, 100);
          transition.queue(Z.TRANSITION_FINAL, transition.fade(fade_time));
          this.cur_level = this.next_level;
          this.cur_level.activateParticles();
          this.gems_total += this.cur_level.gems_total;
          this.next_level = new Level(mashString(level_def.random_seed ? `${random()}` : `${this.level+1}${seedmod}`),
            this.noise_3d, this.level + 1);
          this.pos[0] = ax + 0.5;
          this.pos[1] = ay + 0.5;
          this.cur_level.addOpenings(this.next_level, this.pos);
          ui.playUISound('descend');
          let tick_time = max(350 - this.level * 50, 200);
          if (input.keyDown(KEYS.K)) {
            tick_time = 1;
            fade_time = 16;
          }
          descend_anim = animation.create();
          let t = descend_anim.add(0, fade_time, nop);
          let num_shovels = level_def.shovels_add;
          let num_drills = level_def.drills_add;
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
              transition.queue(Z.TRANSITION_FINAL, transition.fade(fade_time));
              // eslint-disable-next-line no-use-before-define
              engine.setState(play);
            }
          });
          // eslint-disable-next-line no-use-before-define
          engine.setState(descendInit);
        }
      }
    }
    if (message) {
      font.drawSizedAligned(message_style, 4, game_height - ui.font_height - 4, Z.UI,
        ui.font_height, font.ALIGN.HCENTER, game_width - 8, 0, message);
    }

  }

  updateDrill(idx, dt) {
    let active_drill = this.active_drills[idx];
    active_drill.countdown -= dt;
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
    if (xx <= 0 || yy <= 0 || xx >= this.w - 1 || yy >= this.h - 1) {
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

  setPlayerDir(dir, moving) {
    player_animation.setState((moving ? ANIM_DIR_WALK : ANIM_DIR)[dir]);
    if (this.player_dir === dir) {
      return;
    }
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

  update(dt) {
    let dx = 0;
    dx -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A) + input.padButtonDown(PAD.LEFT);
    dx += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D) + input.padButtonDown(PAD.RIGHT);
    let dy = 0;
    dy -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W) + input.padButtonDown(PAD.UP);
    dy += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S) + input.padButtonDown(PAD.DOWN);
    // Get normalized direction
    let dir = v2scale(temp_v2, [dx, dy], 1/dt);
    if (v2lengthSq(dir) > 1) {
      v2normalize(dir, dir);
    }
    dx = dir[0];
    dy = dir[1];

    let total_dt = dt;
    while (total_dt) {
      dt = min(16, total_dt);
      total_dt -= dt;
      this.updateSub(dx, dy, dt);
    }
  }

  updateSub(dx, dy, dt) {
    for (let ii = this.active_drills.length - 1; ii >= 0; --ii) {
      this.updateDrill(ii, dt);
    }
    let { pos, cur_level } = this;
    let ix = floor(pos[0]);
    let iy = floor(pos[1]);
    let speed = 0.005;
    const threshold = 0.01;
    if (abs(dx) + abs(dy)) {
      this.run_time += dt;
      if (this.run_time > 800) {
        speed *= 1.5;
      }
      if (abs(dx) > abs(dy)) {
        if (dx < 0) {
          this.target_pos = [floor(pos[0] - 0.5), iy];
          this.setPlayerDir(0, dx < -threshold);
        } else {
          this.target_pos = [floor(pos[0] + 0.5), iy];
          this.setPlayerDir(2, dx > threshold);
        }
      } else {
        if (dy < 0) {
          this.target_pos = [ix, floor(pos[1] - 0.5)];
          this.setPlayerDir(1, dy < -threshold);
        } else {
          this.target_pos = [ix, floor(pos[1] + 0.5)];
          this.setPlayerDir(3, dy > threshold);
        }
      }
    } else {
      this.setPlayerDir(this.player_dir, false);
      this.target_pos = null;
      this.run_time = 0;
    }

    let x2 = pos[0] + dx * speed * dt;
    let y2 = pos[1] + dy * speed * dt;
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
      let max_dist = dt * 0.002;
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
            OK: null,
            Menu: () => {
              transition.queue(Z.TRANSITION_FINAL, transition.fade(1000));
              // eslint-disable-next-line no-use-before-define
              engine.setState(gameOverInit);
            },
          },
        });
      }
    }

    this.cur_level.tickVisibility(this.pos[0], this.pos[1], dt);
  }
}

function colorCount(count) {
  return font.styleColored(style_overlay, count === 1 ?
    pico8.font_colors[9] : count ? pico8.font_colors[7] : pico8.font_colors[8]);
}

function hudShared(force_bottom) {
  let icon_size = ui.font_height * 2;

  let y = 0;
  let style = style_overlay;
  if (state.pos[1] < 2) {
    style = font.styleAlpha(style, 0.5);
  }
  if (state.level > 1) {
    sprite_tiles_ui.draw({
      x: game_width - 4 - icon_size, y, w: icon_size, h: icon_size, z: Z.UI,
      frame: TILE_GEM_UI,
    });
    font.drawSizedAligned(style, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HRIGHT, 0, 0,
      level_def.max_levels ? `Total: ${state.gems_found}/${state.gems_total}` :
        `Score: ${state.gems_found}`);
    y += icon_size + 4;
  }
  sprite_tiles_ui.draw({
    x: game_width - 4 - icon_size, y, w: icon_size, h: icon_size, z: Z.UI,
    frame: TILE_GEM_UI,
  });
  let found_font_size = ui.font_height * 2;
  let found_all = state.cur_level.gems_found === state.cur_level.gems_total;
  if (gems_found_at && engine.frame_timestamp - gems_found_at < 500) {
    let a = easeOut(1 - (engine.frame_timestamp - gems_found_at) / 500, 2);
    found_font_size *= 1 + a * (found_all ? 1 : 0.5);
  }
  let gems_text = `${state.cur_level.gems_found}/${state.cur_level.gems_total}`;
  let text_w = font.getStringWidth(style, ui.font_height * 2, gems_text);
  font.drawSizedAligned(found_all ? style_found_all : style,
    game_width - 4 - icon_size, y, Z.UI + 1, found_font_size,
    font.ALIGN.HRIGHT, 0, 0,
    gems_text);
  if (state.level > 1) {
    font.drawSizedAligned(found_all ? style_found_all : style,
      game_width - 4 - icon_size - text_w, y, Z.UI, ui.font_height * 2,
      font.ALIGN.HRIGHT, 0, 0,
      `Floor ${state.level}: `);
  }
  y += icon_size + 4;

  // font.drawSizedAligned(style_overlay, game_width - 4 - icon_size, y, Z.UI, ui.font_height * 2,
  //   font.ALIGN.HRIGHT, 0, 0,
  //   `Level: ${state.level}`);
  // y += icon_size + 4;

  if ('tools on botttom') {
    y = game_height - ui.font_height - 4 * 2 - icon_size;
    if (state.pos[1] > state.h - 4 && !force_bottom) {
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
    ui.print(style_overlay, 4, 2, Z.UI, `${input.pad_mode ? '[LT]' : '[Shift]'} - view floor below`);
    ui.print(style_overlay, 4, 2+ui.font_height, Z.UI, `${input.pad_mode ? '[Stick]' : '[WASD]'} - move`);
    ui.print(style_overlay, 4, 2+ui.font_height*2, Z.UI, `${input.pad_mode ? '[B]' : '[Esc]'} - menu`);
    if (level_def.w > 24) {
      ui.print(style_overlay, 4, 2+ui.font_height*3, Z.UI, `${input.pad_mode ? '[RT]' : '[Z]'} - zoom out`);
    }
  }

  hudShared();

  if (engine.DEBUG) {
    if (input.keyDownEdge(KEYS.R)) {
      level_def.random_seed = true;
      state = new GameState();
    }
    if (input.keyDownEdge(KEYS.V)) {
      debug_visible = !debug_visible;
    }
    if (input.keyDownEdge(KEYS.F2)) {
      debug_freecam = !debug_freecam;
    }
    if (input.keyDownEdge(KEYS.F4)) {
      gems_found_at = engine.frame_timestamp;
    }
    if (input.keyDownEdge(KEYS.Z) || input.padButtonDownEdge(PAD.RIGHT_TRIGGER)) {
      debug_zoom = !debug_zoom;
    }
  } else {
    debug_zoom = input.keyDown(KEYS.Z) || input.padButtonDown(PAD.RIGHT_TRIGGER);
  }
  state.update(dt);
  state.draw();
  if (engine.DEBUG && input.keyDownEdge(KEYS.F3)) {
    state.cur_level.activateParticles();
  }
  state.setMainCamera(); // for particles
  if (esc()) {
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
  font.drawSizedAligned(style_overlay, game_width/2, game_height/2, Z.UI,
    ui.font_height * 2, font.ALIGN.HVCENTER, 0, 0,
    `Level ${state.level}${level_def.max_levels ? ` / ${level_def.max_levels}` : ''}`);
  hudShared(true);
}
function descendInit(dt) {
  // eslint-disable-next-line no-use-before-define
  killFX();
  engine.setState(descend);
  descend(dt);
}

let need_player_name_update;
function gameOver(dt) {
  let y = 10;
  title_font.drawSizedAligned(title_style,
    0, y, Z.UI, 32, font.ALIGN.HCENTER, game_width, 0,
    'Dwarven Surveyor');
  y += 32 + 5;

  y += 4;
  let line_height = ui.font_height * 2;
  font.drawSizedAligned(subtitle_style,
    0, y, Z.UI, line_height, font.ALIGN.HCENTER, game_width, 0,
    state.level > level_def.max_levels ? 'YOU WIN!' : 'GAME OVER');
  y += line_height + 4;
  y += 4;

  font.drawSizedAligned(style_overlay, 0, y, Z.UI,
    line_height, font.ALIGN.HCENTER, game_width, 0,
    `Level: ${min(state.level, level_def.max_levels || Infinity)}` +
    `${level_def.max_levels ? ` / ${level_def.max_levels}` : ''}`);
  y += line_height + 4;

  let w = font.drawSizedAligned(style_overlay, 0, y, Z.UI,
    line_height, font.ALIGN.HCENTER, game_width, 0,
    `Total: ${state.gems_found} / ${state.gems_total}`);
  sprite_tiles_ui.draw({
    x: (game_width + w) / 2 + 4,
    y,
    w: line_height, h: line_height,
    frame: TILE_GEM,
  });
  y += ui.font_height * 2 + 4;

  font.drawSizedAligned(style_overlay, 0, y, Z.UI,
    line_height, font.ALIGN.HCENTER, game_width, 0,
    `Unused tools: ${state.shovels + state.drills}`);
  y += ui.font_height * 2 + 4;

  if (ui.buttonText({
    x: floor(game_width/2 - ui.button_width/2),
    y,
    text: 'Main Menu'
  }) || esc()) {
    state = null;
    // eslint-disable-next-line no-use-before-define
    engine.setState(titleInit);
  }
  y += ui.button_height + 4;

  need_player_name_update = false;
  // eslint-disable-next-line no-use-before-define
  showHighScores(game_width / 4, y, level_def.score_idx);
  // eslint-disable-next-line no-use-before-define
  doPlayerNameUpdate();
}
function gameOverInit(dt) {
  score_system.updateHighScores();
  engine.setState(gameOver);
  gameOver(dt);
}

function killFX() {
  engine.glov_particles.killAll();
}

let title_state;
let title_seq;
function colorFade(fade) {
  return [1,1,1,fade];
}
function title(dt) {
  gl.clearColor(0, 0, 0, 1);
  title_seq.update(dt);
  let y = 10;
  title_font.drawSizedAligned(glov_font.styleAlpha(title_style, title_state.fade0),
    0, y, Z.UI, 32, font.ALIGN.HCENTER, game_width, 0,
    'Dwarven Surveyor');

  y += 32 + 5;

  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style2, title_state.fade4),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'by Jimb Esser in 48 hours for Ludum Dare 48');

  y += ui.font_height + 4;

  let icon_w = 32;
  sprite_drill_ui.draw({
    x: game_width / 2 - icon_w / 2,
    y,
    w: icon_w, h: icon_w,
    frame: anim_drill.getFrame(dt),
    color: colorFade(title_state.fade1),
  });
  y += icon_w;
  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style, title_state.fade1),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'Use Drills to find Gems on the current floor.');
  y += ui.font_height + 4;

  sprite_tiles_ui.draw({
    x: (game_width - icon_w) / 2,
    y,
    w: icon_w, h: icon_w,
    frame: TILE_SHOVEL,
    color: colorFade(title_state.fade2),
  });
  y += icon_w;
  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style, title_state.fade2),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'Use Shovels to peek into the next floor.');
  y += ui.font_height + 4;

  let x = (game_width - (icon_w) * 8) / 2;
  let ore_frame = 0;
  function drawTile(tile, twinkle) {
    sprite_tiles_ui.draw({
      x, y, w: icon_w, h: icon_w,
      frame: tile,
      color: colorFade(title_state.fade3),
    });
    if (tile === TILE_GEM) {
      sprite_tiles_ui.draw({
        x, y, w: icon_w, h: icon_w,
        z: Z.UI - 1,
        frame: TILE_OPEN,
        color: colorFade(title_state.fade3),
      });
    }
    if (twinkle) {
      drawTwinkle({
        x, y, w: icon_w/TILE_W, h: icon_w/TILE_W,
        z: Z.UI + 0.01,
        frame: ore_frame,
        color: colorFade(title_state.fade3),
      });
      ++ore_frame;
    }
    x += icon_w;
  }
  drawTile(TILE_SOLID, false);
  drawTile(TILE_SOLID, true);
  drawTile(TILE_CRACKED_1, true);
  drawTile(TILE_GEM, false);
  drawTile(TILE_CRACKED_2, true);
  drawTile(TILE_GEM, false);
  drawTile(TILE_CRACKED_3, true);
  drawTile(TILE_GEM, false);
  y += icon_w;
  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style, title_state.fade3),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'Cracks in rocks indicate there are 1, 2, or 3 adjacent Gems.');
  y += ui.font_height + 2;

  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style, title_state.fade3),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'Gems are only found near yellow sparkles.');
  y += ui.font_height + 2;
  font.drawSizedAligned(glov_font.styleAlpha(subtitle_style, title_state.fade3),
    0, y, Z.UI, ui.font_height, font.ALIGN.HCENTER, game_width, 0,
    'Press ESC at any time to review this information.');
  y += ui.font_height + 4;

  y = game_height - ui.button_height * 2 - 12;
  if (title_state.fade5) {
    let bx1 = (game_width - ui.button_width * 3 - 4 * 2) / 2;
    let bx2 = bx1 + ui.button_width + 4;
    let bx3 = bx2 + ui.button_width + 4;
    if (state) {
      if (ui.buttonText({
        x: bx1, y, text: 'Resume'
      }) || esc()) {
        transition.queue(Z.TRANSITION_FINAL, transition.splitScreen(500, 4, false));
        engine.setState(play);
      }
      if (ui.buttonText({
        x: bx2, y, text: 'Restart'
      })) {
        state = null;
      }
    } else {
      if (ui.buttonText({
        x: bx1, y,
        text: 'Play'
      }) || esc()) {
        transition.queue(Z.TRANSITION_FINAL, transition.splitScreen(500, 4, false));
        level_def = level_defs.score_attack;
        engine.setState(playInit);
      }
      if (ui.buttonText({
        x: bx2, y,
        text: 'Endless Mode'
      })) {
        transition.queue(Z.TRANSITION_FINAL, transition.splitScreen(500, 4, false));
        level_def = level_defs.endless;
        engine.setState(playInit);
      }
    }
    if (ui.buttonText({
      x: bx3, y,
      text: 'High Scores'
    })) {
      transition.queue(Z.TRANSITION_FINAL, transition.splitScreen(500, 4, false));
      // eslint-disable-next-line no-use-before-define
      engine.setState(highScoreInit);
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
    fade5: 0,
  };
  title_seq = animation.create();
  let t = title_seq.add(0, 300, (v) => (title_state.fade0 = v));
  t = title_seq.add(t, 500, nop);
  t = title_seq.add(t, 300, (v) => (title_state.fade1 = v));
  t = title_seq.add(t, 500, nop);
  t = title_seq.add(t, 300, (v) => (title_state.fade2 = v));
  t = title_seq.add(t, 500, nop);
  t = title_seq.add(t, 300, (v) => (title_state.fade3 = v));
  t = title_seq.add(t, 500, nop);
  t = title_seq.add(t, 300, (v) => (title_state.fade4 = v));
  t = title_seq.add(t, 500, nop);
  title_seq.add(t, 300, (v) => (title_state.fade5 = v));
  if (!first_time || engine.DEBUG) {
    title_seq.update(30000);
  }
  first_time = false;
  engine.setState(title);
  title(dt);
}

let levels = [
  {
    name: 'score_attack',
    display_name: 'Score Attack',
  }, {
    name: 'endless',
    display_name: 'Endless',
  },
];

let scores_edit_box;
function showHighScores(x, y, eff_level_idx) {
  let width = game_width * 0.5;
  // let y0 = y;
  let z = Z.UI - 10;
  let size = 8;
  let pad = size;
  title_font.drawSizedAligned(title_style, x, y, z, size * 2, glov_font.ALIGN.HCENTERFIT, width, 0,
    levels[eff_level_idx].display_name);
  y += size * 2 + 2;
  let level_id = levels[eff_level_idx].name;
  let scores = score_system.high_scores[level_id];
  let score_style = glov_font.styleColored(null, pico8.font_colors[7]);
  if (!scores) {
    font.drawSizedAligned(score_style, x, y, z, size, glov_font.ALIGN.HCENTERFIT, width, 0,
      'Loading...');
    return;
  }
  let widths = [10, 60, 24, 24, 24];
  let widths_total = 0;
  for (let ii = 0; ii < widths.length; ++ii) {
    widths_total += widths[ii];
  }
  let set_pad = size / 2;
  for (let ii = 0; ii < widths.length; ++ii) {
    widths[ii] *= (width - set_pad * (widths.length - 1)) / widths_total;
  }
  let align = [
    glov_font.ALIGN.HFIT | glov_font.ALIGN.HRIGHT,
    glov_font.ALIGN.HFIT,
    glov_font.ALIGN.HFIT | glov_font.ALIGN.HCENTER,
    glov_font.ALIGN.HFIT | glov_font.ALIGN.HCENTER,
    glov_font.ALIGN.HFIT | glov_font.ALIGN.HCENTER,
  ];
  function drawSet(arr, style, header) {
    let xx = x;
    for (let ii = 0; ii < arr.length; ++ii) {
      let str = String(arr[ii]);
      font.drawSizedAligned(style, xx, y, z, size, align[ii], widths[ii], 0, str);
      xx += widths[ii] + set_pad;
    }
    y += size;
  }
  drawSet(['', 'Name', 'Gems', 'Level', 'Tools'], glov_font.styleColored(null, pico8.font_colors[6]), true);
  y += 4;
  let found_me = false;
  let max_y = game_height - 16 - size * 2;
  for (let ii = 0; ii < scores.length; ++ii) {
    let s = scores[ii];
    let style = score_style;
    let drawme = false;
    if (s.name === score_system.player_name) {
      style = glov_font.styleColored(null, pico8.font_colors[11]);
      found_me = true;
      drawme = true;
    }
    if (y < max_y || drawme) {
      drawSet([
        `#${ii+1}`, score_system.formatName(s), s.score.gems,
        s.score.level, s.score.tools
      ], style);
    }
  }
  y += set_pad;
  if (found_me && score_system.player_name.indexOf('Anonymous') === 0) {
    need_player_name_update = true;
  }

  y += pad;
}
function doPlayerNameUpdate() {
  if (need_player_name_update) {
    let size = 8;
    let y = game_height - 16;
    if (!scores_edit_box) {
      scores_edit_box = ui.createEditBox({
        z: Z.UI,
        w: game_width / 4,
      });
      scores_edit_box.setText(score_system.player_name);
    }

    let x = game_width / 4;
    if (scores_edit_box.run({
      x, y,
    }) === scores_edit_box.SUBMIT || ui.buttonText({
      x: x + scores_edit_box.w + size,
      y: y - size * 0.25,
      w: size * 13,
      h: ui.button_height,
      text: 'Update Player Name'
    })) {
      // scores_edit_box.text
      if (scores_edit_box.text) {
        score_system.updatePlayerName(scores_edit_box.text);
      }
    }
  }
}
function highScore(dt) {
  let y = 4;
  let size = 8;
  if (ui.buttonText({
    x: 4, y, text: 'Back',
  }) || esc()) {
    engine.setState(titleInit);
  }
  font.drawSizedAligned(null, 0, y, Z.UI, size * 2, glov_font.ALIGN.HCENTERFIT, game_width, 0, 'HIGH SCORES');
  y += size * 2 + 2;
  need_player_name_update = false;
  showHighScores(0, y, 0);
  showHighScores(game_width / 2, y, 1);
  ui.drawRect(game_width/2, y - 2, game_width - 2, game_height - 2 - 16 - 2, Z.UI - 11, pico8.colors[1]);
  doPlayerNameUpdate();
}
function highScoreInit(dt) {
  gl.clearColor(0, 0, 0, 1);
  engine.setState(highScore);
  highScore(dt);
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
  title_font = { info: require('./img/font/vga_16x2.json'), texture: 'font/vga_16x2' };

  let ui_sounds = {
    gem_found: ['pickup1b', 'pickup1b', 'pickup1b', 'pickup1b', 'pickup2b', 'pickup3b', 'pickup4b', 'pickup5b'],
    drill_block: ['dig1', 'dig2'],
    drill_stop: ['dig_stop'],
    drill_skip: ['dig_skip'],
    shovel1: ['hole1'],
    shovel2: ['hole2'],
    descend: 'descend',
    level_complete: 'level_complete',
  };

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font,
    title_font,
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
    hs: [16, 16, 16, 16, 16],
    origin: vec2(0,0),
  });
  sprite_tiles_ui = sprites.create({
    name: 'tiles',
    ws: [16, 16, 16, 16],
    hs: [16, 16, 16, 16, 16],
    origin: vec2(0,0),
  });
  sprite_twinkle = sprites.create({
    name: 'twinkle',
    size: vec2(TILE_W, TILE_W),
    ws: [16, 16, 16],
    hs: [16, 16, 16],
    origin: vec2(0,0),
  });
  let pft = 100;
  player_animation = sprite_animation.create({
    idle_down: {
      frames: [0],
      times: [150],
    },
    walk_down: {
      frames: [0,1,0,2],
      times: [pft,pft,pft,pft],
    },
    idle_up: {
      frames: [3],
      times: [200],
    },
    walk_up: {
      frames: [3,4,3,5],
      times: [pft,pft,pft,pft],
    },
    idle_right: {
      frames: [6],
      times: [200],
    },
    walk_right: {
      frames: [6,7,6,8],
      times: [pft,pft,pft,pft],
    },
    idle_left: {
      frames: [9],
      times: [200],
    },
    walk_left: {
      frames: [9,10,9,11],
      times: [pft,pft,pft,pft],
    },
  });
  sprite_dwarf = sprites.create({
    name: 'dwarf',
    ws: [16, 16, 16],
    hs: [16, 16, 16, 16],
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

  function encodeScore(score) {
    assert(score.level >= 1 && score.gems >= 0 && score.tools >= 0);
    return score.gems * 10000 * 10000 +
      score.level * 10000 +
      score.tools;
  }

  function parseScore(value) {
    let gems = floor(value / (10000 * 10000));
    value -= gems * (10000 * 10000);
    let level = floor(value / (10000));
    value -= level * 10000;
    let tools = value;
    return { gems, level, tools };
  }

  score_system.init(encodeScore, parseScore, levels, 'LD48');
  score_system.updateHighScores();

  pumpMusic();
  engine.setState(engine.DEBUG ? playInit : titleInit);
}

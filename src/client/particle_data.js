export let defs = {};

const { clone } = require('../common/util.js');
const pico8 = require('./glov/pico8.js');

function override(def, mod) {
  if (typeof def === 'object' && !Array.isArray(def) && typeof mod === 'object') {
    let ret = {};
    for (let key in def) {
      if (mod[key] !== undefined) {
        // eslint-disable-next-line no-unused-vars
        ret[key] = override(def[key], mod[key]);
      } else {
        ret[key] = clone(def[key]);
      }
    }
    return ret;
  }
  return mod || (def === Infinity ? def : clone(def));
}

defs.gem_found = {
  particles: {
    part0: {
      blend: 'alpha',
      texture: 'particles/circle8',
      color: pico8.colors[10], // multiplied by animation track, default 1,1,1,1, can be omitted
      color_track: [
        // just values, NOT random range
        { t: 0.0, v: [1,1,1,0] },
        { t: 0.05, v: [1,1,1,1] },
        { t: 0.3, v: [1,1,1,1] },
        { t: 1.0, v: [1,1,1,0] },
      ],
      size: [[6,2], [6,2]], // multiplied by animation track
      size_track: [
        // just values, NOT random range
        { t: 0.0, v: [0.5,0.5] },
        { t: 0.3, v: [1,1] },
        { t: 1.0, v: [1,1] },
      ],
      accel: [0,200,0],
      rot: [0,360], // degrees
      rot_vel: [10,2], // degrees per second
      lifespan: [700,0], // milliseconds
      kill_time_accel: 5,
    },
  },
  emitters: {
    part0: {
      particle: 'part0',
      // Random ranges affect each emitted particle:
      pos: [[-8,16], [-8,16], 0],
      vel: [[-10,20],[-60,20],0],
      emit_rate: [20,0], // emissions per second
      // Random ranges only calculated upon instantiation:
      emit_time: [0,100],
      emit_initial: 5,
      max_parts: Infinity,
    },
  },
  system_lifespan: 2500,
};

defs.shovel = {
  particles: {
    part0: {
      blend: 'alpha',
      texture: 'particles/circle8',
      color: pico8.colors[4], // multiplied by animation track, default 1,1,1,1, can be omitted
      color_track: [
        // just values, NOT random range
        { t: 0.0, v: [0.25,0.25,0.25,0] },
        { t: 0.05, v: [1,1,1,1] },
        { t: 0.1, v: [1,1,1,1] },
        { t: 0.3, v: [1,1,1,0.5] },
        { t: 1.0, v: [1,1,1,0] },
      ],
      size: [[12,4], [12,4]], // multiplied by animation track
      accel: [0,0,0],
      lifespan: [1500,0], // milliseconds
      kill_time_accel: 5,
    },
  },
  emitters: {
    part0: {
      particle: 'part0',
      // Random ranges affect each emitted particle:
      pos: [[-8,16], [-8,16], 0],
      vel: [0,0,0],
      emit_rate: [80,0], // emissions per second
      // Random ranges only calculated upon instantiation:
      emit_time: [0,200],
      emit_initial: 1,
      max_parts: Infinity,
    },
  },
  system_lifespan: 2500,
};

defs.drill = {
  particles: {
    part0: {
      blend: 'alpha',
      texture: 'particles/circle8',
      color: pico8.colors[6], // multiplied by animation track, default 1,1,1,1, can be omitted
      color_track: [
        // just values, NOT random range
        { t: 0.0, v: [0.25,0.25,0.25,0] },
        { t: 0.05, v: [1,1,1,1] },
        { t: 0.1, v: [1,1,1,1] },
        { t: 0.3, v: [1,1,1,0.5] },
        { t: 1.0, v: [1,1,1,0] },
      ],
      size: [[12,4], [12,4]], // multiplied by animation track
      accel: [0,0,0],
      lifespan: [1500,0], // milliseconds
      kill_time_accel: 5,
    },
  },
  emitters: {
    part0: {
      particle: 'part0',
      // Random ranges affect each emitted particle:
      pos: [[-8,16], [-8,16], 0],
      vel: [0,0,0],
      emit_rate: [80,0], // emissions per second
      // Random ranges only calculated upon instantiation:
      emit_time: [0,200],
      emit_initial: 1,
      max_parts: Infinity,
    },
  },
  system_lifespan: 2500,
};

defs.drill_stop = {
  particles: {
    part0: {
      blend: 'alpha',
      texture: 'particles/circle8',
      color: pico8.colors[0], // multiplied by animation track, default 1,1,1,1, can be omitted
      color_track: [
        // just values, NOT random range
        { t: 0.0, v: [0.25,0.25,0.25,0] },
        { t: 0.05, v: [1,1,1,1] },
        { t: 0.1, v: [1,1,1,1] },
        { t: 0.3, v: [1,1,1,0.5] },
        { t: 1.0, v: [1,1,1,0] },
      ],
      size: [[12,4], [12,4]], // multiplied by animation track
      accel: [0,0,0],
      lifespan: [2500,0], // milliseconds
      kill_time_accel: 5,
    },
  },
  emitters: {
    part0: {
      particle: 'part0',
      // Random ranges affect each emitted particle:
      pos: [[-8,16], [-8,16], 0],
      vel: [0,0,0],
      emit_rate: [60,0], // emissions per second
      // Random ranges only calculated upon instantiation:
      emit_time: [0,350],
      emit_initial: 8,
      max_parts: Infinity,
    },
  },
  system_lifespan: 2500,
};

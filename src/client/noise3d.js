const { mashString } = require('./glov/rand_alea.js');
const { makeNoise3D } = require('open-simplex-noise');
const { max, floor } = Math;
const { clamp } = require('../common/util.js');

// Generated from github.com/Jimbly/3dnoise-test/
const OPENSIMPLEX_UNIFORM = new Float32Array([
  0, 0.001349,
  0.001349, 0.008905,
  0.010254, 0.027101,
  0.037364, 0.056660,
  0.094024, 0.083166,
  0.17719, 0.099867,
  0.277057, 0.109412,
  0.386469, 0.114112,
  0.500581, 0.114131,
  0.614712, 0.108271,
  0.722983, 0.099347,
  0.82233, 0.082007,
  0.904337, 0.056680,
  0.961017, 0.028057,
  0.989074, 0.009402,
  0.998476, 0.001524
]);
const OPENSIMPLEX_UNIFORM_LEN = 16;

function makeNoise3DNormal(seed) {
  // Returns a noise function with similar normal distribution as simplex-noise did
  let noise = makeNoise3D(seed);
  function raw(x, y, z) {
    return clamp(0.5 + 0.58 * noise(x, y, z), 0, 1);
  }
  // Normal spatial noise functions are a (roughly) normal distribution, this maps
  //   the distribution returned from 3D OpenSimplexNoise to a 0-1 value of
  //   approximately uniform distribution, assuming irregular (e.g. non-integral fraction?) x/y/z positions
  function uniform(x, y, z) {
    let v = raw(x, y, z);
    v = max(0, v * OPENSIMPLEX_UNIFORM_LEN);
    if (v >= OPENSIMPLEX_UNIFORM_LEN) {
      return 1;
    }
    let idx = floor(v);
    let offs = v - idx;
    return OPENSIMPLEX_UNIFORM[idx*2] + OPENSIMPLEX_UNIFORM[idx*2+1] * offs;
  }
  return uniform;
}

export function createNoise3D(seed) {
  return makeNoise3DNormal(mashString(seed));
}

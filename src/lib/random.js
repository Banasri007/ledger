/* Seeded RNG. Same seed produces a byte-identical batch, so a judge can
   be told the seed and reproduce the exact numbers. */

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rndSeq = (n, seed) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => r());
};

export { mulberry32, rndSeq };

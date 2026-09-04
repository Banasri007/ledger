/* Shared formatters. */

const day = 86400000;
const fmt = (n) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dstr = (t) => new Date(t).toISOString().slice(0, 10);
const pct = (x) => (x * 100).toFixed(1) + "%";

export { day, fmt, dstr, pct };

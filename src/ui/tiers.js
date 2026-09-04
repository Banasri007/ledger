/* Tier identity for the UI.

   Gold is both the brand colour and the natural colour for "uncertain".
   Resolved by letting gold BE the fuzzy tier - it is the interesting
   middle case - and keeping UI chrome neutral white so tiers stay legible. */

import { T } from "../theme.js";

const TIER_META = {
  0: { name: "Learned", color: "#6EE7A8" },
  1: { name: "Exact", color: T.exact },
  2: { name: "Fuzzy", color: T.fuzzy },
  3: { name: "Reasoned", color: T.llm },
};

export { TIER_META };

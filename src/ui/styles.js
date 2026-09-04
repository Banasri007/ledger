/* Shared layout constants and the button style. */

import { MONO, T } from "../theme.js";

/* The console is a dashboard and wants the whole screen; the landing page is
   editorial and would lose its measure if the text column ran that wide. */
const SHELL = { maxWidth: 1460, margin: "0 auto", padding: "0 34px", width: "100%" };
const SHELL_WIDE = { maxWidth: 1840, margin: "0 auto", padding: "0 38px", width: "100%" };
const PANEL = {
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: 14,
  overflow: "hidden",
};

const DIFF_HINT = {
  1: "clean refs",
  2: "+ date & ref drift",
  3: "+ fees, FX, name variants",
  4: "+ merged & split payments",
  5: "+ duplicates, decoys, orphans",
};

function btn(primary) {
  return {
    fontFamily: MONO,
    fontSize: 12.5,
    letterSpacing: "0.1em",
    padding: "11px 22px",
    borderRadius: 8,
    cursor: "pointer",
    color: primary ? "#0B0B0B" : T.text,
    background: primary ? `linear-gradient(180deg, ${T.goldHi}, ${T.goldLo})` : "transparent",
    border: primary ? "none" : `1px solid ${T.line}`,
    fontWeight: primary ? 700 : 400,
  };
}

export { SHELL, SHELL_WIDE, PANEL, DIFF_HINT, btn };

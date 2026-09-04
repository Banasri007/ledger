/* Design tokens. Palette read off The Turing Circle's own avatar URLs
   (background=050505&color=D4AF37). Dark ground is non-negotiable: the
   edge state colours need it to read. */

const T = {
  bg: "#050505",
  surface: "#0E0E0E",
  surfaceUp: "#151515",
  line: "#232323",
  text: "#F2F2F2",
  muted: "#8A8A8A",
  dim: "#5A5A5A",
  gold: "#D4AF37",
  goldLo: "#C77C0B",
  goldHi: "#F7DF94",
  exact: "#E6E6E6",
  fuzzy: "#D4AF37",
  llm: "#4FD1C5",
  bad: "#E5484D",
  ok: "#4FD1C5",
};
/* Type stack borrowed from The Turing Circle itself, which this design
   mimics: Outfit for UI, Space Mono for anything tabular or machine-ish.
   Both fall back to system faces if the webfont never lands. */
const MONO = "'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS =
  "Outfit, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export { T, MONO, SANS };

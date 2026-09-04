/* Landing page type scale. */

import { MONO, T } from "../theme.js";

const Eyebrow = ({ children }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: "clamp(11px, 0.8vw, 16px)",
      letterSpacing: "0.24em",
      color: T.gold,
      marginBottom: 18,
    }}
  >
    {children}
  </div>
);

const H2 = ({ children }) => (
  <h2
    style={{
      fontSize: "clamp(34px, 4.6vw, 76px)",
      fontWeight: 800,
      letterSpacing: "-0.035em",
      lineHeight: 1.08,
      margin: 0,
      color: T.text,
    }}
  >
    {children}
  </h2>
);

const Body = ({ children, w = 620 }) => (
  <p
    style={{
      fontSize: "clamp(17px, 1.28vw, 25px)",
      lineHeight: 1.72,
      color: T.muted,
      maxWidth: `min(${Math.round(w * 1.35)}px, 48vw)`,
      margin: "20px 0 0",
    }}
  >
    {children}
  </p>
);

export { Eyebrow, H2, Body };

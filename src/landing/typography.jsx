/* Landing page type scale. */

import { MONO, T } from "../theme.js";

const Eyebrow = ({ children }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 10,
      letterSpacing: "0.2em",
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
      fontSize: "clamp(28px, 3.4vw, 44px)",
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
      fontSize: 16.5,
      lineHeight: 1.75,
      color: T.muted,
      maxWidth: w,
      margin: "20px 0 0",
    }}
  >
    {children}
  </p>
);

export { Eyebrow, H2, Body };

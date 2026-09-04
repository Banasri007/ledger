/* Global effect layer: keyframes, pointer-reactive utility classes, the
   custom cursor, the terminal crosshair and the spotlight scrim.

   The scrim is the important one. The old backdrop sat under a flat
   rgba(5,5,5,.9) vignette, which is why the finance visuals behind it were
   invisible. Here the scrim is a radial gradient centred on the pointer:
   ~18% black where you are pointing, ~92% at the edges. The background is
   genuinely bright, but only where you are looking - so it never fights the
   copy, and sweeping the mouse feels like moving a torch over a terminal. */

import { T } from "../theme.js";

const FX = `
:root { --mx:0; --my:0; --lx:0; --ly:0; --nx:0; --ny:0; --down:0; --gx:50%; --gy:50%; }

@keyframes edgeIn   { from { stroke-dashoffset:1; opacity:0 } to { stroke-dashoffset:0; opacity:1 } }
@keyframes pulse    { 0%,100% { opacity:.35 } 50% { opacity:1 } }
@keyframes softPulse{ 0%,100% { opacity:.25 } 50% { opacity:.8 } }
@keyframes drift    { from { transform: translateY(0) } to { transform: translateY(-50%) } }
@keyframes sweep    { 0%,100% { transform: translateX(210px) } 50% { transform: translateX(640px) } }
@keyframes draw     { 0% { stroke-dashoffset:2400 } 55%,100% { stroke-dashoffset:0 } }
@keyframes resolve  { 0% { opacity:0; stroke-dashoffset:600 } 22% { opacity:.9 } 70% { opacity:.9; stroke-dashoffset:0 } 100% { opacity:0; stroke-dashoffset:0 } }
@keyframes tapeL    { from { transform: translateX(0) }    to { transform: translateX(-50%) } }
@keyframes tapeR    { from { transform: translateX(-50%) } to { transform: translateX(0) } }
@keyframes rise     { from { transform: scaleY(0); opacity:0 } to { transform: scaleY(1); opacity:1 } }
@keyframes spin     { to { transform: rotate(360deg) } }
@keyframes blink    { 0%,100% { opacity:1 } 50% { opacity:.15 } }
@keyframes scan     { 0% { transform: translateY(-12vh) } 100% { transform: translateY(112vh) } }
@keyframes floatY   { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
@keyframes ping     { 0% { transform: scale(.6); opacity:.9 } 100% { transform: scale(2.6); opacity:0 } }
@keyframes shimmer  { 0% { background-position: -220% 0 } 100% { background-position: 220% 0 } }

/* ---- parallax depths. Layers translate against the pointer; the further
   "back" a layer is, the more it moves, which is what sells the depth. ---- */
.fx-par-1, .fx-par-2, .fx-par-3 { will-change: transform; }
.fx-par-1 { transform: translate3d(calc(var(--nx) * 9px),  calc(var(--ny) * 7px),  0) scale(1.04); }
.fx-par-2 { transform: translate3d(calc(var(--nx) * 22px), calc(var(--ny) * 15px), 0) scale(1.06); }
.fx-par-3 { transform: translate3d(calc(var(--nx) * 44px), calc(var(--ny) * 28px), 0) scale(1.09); }

/* ---- the torch ---- */
.fx-spot {
  position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(circle 470px at calc(var(--mx) * 1px) calc(var(--my) * 1px),
    rgba(5,5,5,.16) 0%, rgba(5,5,5,.58) 40%, rgba(5,5,5,.86) 74%, rgba(5,5,5,.95) 100%);
}
.fx-spot-console {
  position:fixed; inset:0; pointer-events:none; z-index:0;
  background: radial-gradient(circle 520px at calc(var(--mx) * 1px) calc(var(--my) * 1px),
    rgba(212,175,55,.055) 0%, rgba(212,175,55,.014) 45%, transparent 72%);
}

/* ---- dot grid that lights up under the pointer ---- */
.fx-dots, .fx-dots-base { position:absolute; inset:0; pointer-events:none;
  background-image: radial-gradient(circle, ${T.gold} 1.15px, transparent 1.15px);
  background-size: 30px 30px; }
.fx-dots-base { opacity:.10 }
.fx-dots {
  opacity:.85;
  -webkit-mask-image: radial-gradient(circle 250px at calc(var(--mx) * 1px) calc(var(--my) * 1px), #000 0%, rgba(0,0,0,.4) 52%, transparent 76%);
          mask-image: radial-gradient(circle 250px at calc(var(--mx) * 1px) calc(var(--my) * 1px), #000 0%, rgba(0,0,0,.4) 52%, transparent 76%);
}

/* ---- terminal crosshair ---- */
.fx-cross-v, .fx-cross-h { position:fixed; pointer-events:none; z-index:38; will-change: transform; }
.fx-cross-v { top:0; bottom:0; left:0; width:1px; transform: translateX(calc(var(--mx) * 1px));
  background: linear-gradient(180deg, transparent, rgba(212,175,55,.30) 18%, rgba(212,175,55,.30) 82%, transparent); }
.fx-cross-h { left:0; right:0; top:0; height:1px; transform: translateY(calc(var(--my) * 1px));
  background: linear-gradient(90deg, transparent, rgba(212,175,55,.30) 18%, rgba(212,175,55,.30) 82%, transparent); }
.fx-cross-tag { position:fixed; z-index:38; pointer-events:none;
  transform: translate3d(calc(var(--mx) * 1px + 14px), calc(var(--my) * 1px + 12px), 0); }

/* ---- custom cursor ---- */
.fx-cur { position:fixed; left:0; top:0; pointer-events:none; z-index:9999; }
.fx-cur-ring { width:36px; height:36px; margin:-18px 0 0 -18px; border-radius:50%;
  border:1px solid rgba(212,175,55,.65);
  transform: translate3d(calc(var(--lx) * 1px), calc(var(--ly) * 1px), 0) scale(calc(1 - var(--down) * .22));
  transition: opacity .3s; }
.fx-cur-arc { position:absolute; inset:-5px; border-radius:50%;
  border:1px solid transparent; border-top-color:rgba(212,175,55,.9); border-right-color:rgba(212,175,55,.35);
  animation: spin 3.4s linear infinite; }
.fx-cur-dot { width:5px; height:5px; margin:-2.5px 0 0 -2.5px; border-radius:50%;
  background:${T.goldHi}; box-shadow:0 0 12px rgba(212,175,55,.9);
  transform: translate3d(calc(var(--mx) * 1px), calc(var(--my) * 1px), 0); }

/* ---- panels: pointer-tracking glow + lift ---- */
.fx-panel { position:relative; isolation:isolate;
  transition: transform .32s cubic-bezier(.2,.9,.2,1), border-color .32s, box-shadow .32s; }
.fx-panel::before { content:""; position:absolute; inset:0; border-radius:inherit; z-index:-1;
  opacity:0; transition:opacity .32s;
  background: radial-gradient(380px circle at var(--gx) var(--gy), rgba(212,175,55,.11), transparent 62%); }
.fx-panel:hover { border-color: rgba(212,175,55,.34); box-shadow: 0 14px 46px rgba(0,0,0,.55); }
.fx-panel:hover::before { opacity:1 }
.fx-lift:hover { transform: translateY(-3px) }

/* ---- magnetic-ish buttons ---- */
.fx-mag { transition: transform .26s cubic-bezier(.2,.9,.2,1), box-shadow .26s, filter .26s; }
.fx-mag:hover { transform: translateY(-2px) scale(1.025); box-shadow: 0 10px 32px rgba(212,175,55,.3); filter: brightness(1.06) }
.fx-mag:active { transform: translateY(0) scale(.99) }

/* ---- misc ---- */
.fx-scan { position:absolute; left:0; right:0; height:34vh; pointer-events:none;
  background: linear-gradient(180deg, transparent, rgba(212,175,55,.045), transparent);
  animation: scan 9s linear infinite; }
.fx-glow { text-shadow: 0 0 46px rgba(212,175,55,.30), 0 2px 24px rgba(0,0,0,.7) }
.fx-shimmer { background-size:220% 100%; animation: shimmer 6s linear infinite }
.fx-live { display:inline-block; width:6px; height:6px; border-radius:50%; background:${T.ok};
  box-shadow:0 0 10px ${T.ok}; animation: blink 1.8s ease-in-out infinite }

input[type=range]{ -webkit-appearance:none; height:2px; background:${T.line}; outline:none; border-radius:2px }
input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:13px; height:13px; border-radius:50%;
  background:${T.gold}; cursor:pointer; border:2px solid ${T.bg}; box-shadow:0 0 0 0 rgba(212,175,55,.4);
  transition: box-shadow .25s, transform .2s }
input[type=range]:hover::-webkit-slider-thumb{ transform:scale(1.25); box-shadow:0 0 0 7px rgba(212,175,55,.16) }

@media (hover: none), (pointer: coarse) { .fx-cur, .fx-cross-v, .fx-cross-h, .fx-cross-tag { display:none } }
@media (prefers-reduced-motion: reduce) {
  *{ animation:none !important; transition:none !important }
  .fx-par-1,.fx-par-2,.fx-par-3 { transform:none }
  .fx-spot { background: rgba(5,5,5,.62) }
  .fx-dots { -webkit-mask-image:none; mask-image:none; opacity:.14 }
}
`;

function GlobalFX() {
  return <style>{FX}</style>;
}

/* Ring lags the pointer on a spring, dot tracks it exactly. On the landing
   page the native cursor is hidden; in the console it is kept, because the
   sliders and the graph need pixel-accurate pointing during a demo. */
function Cursor() {
  return (
    <>
      <div className="fx-cur fx-cur-ring">
        <div className="fx-cur-arc" />
      </div>
      <div className="fx-cur fx-cur-dot" />
    </>
  );
}

function Crosshair({ label }) {
  return (
    <>
      <div className="fx-cross-v" />
      <div className="fx-cross-h" />
      {label ? (
        <div
          className="fx-cross-tag"
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "rgba(212,175,55,.75)",
          }}
        >
          {label}
        </div>
      ) : null}
    </>
  );
}

export { GlobalFX, Cursor, Crosshair };

/* Motion primitives.

   Everything pointer-reactive on this site is driven by four CSS custom
   properties written once per frame to <html>:

     --mx / --my   raw pointer position in px
     --lx / --ly   the same, lagged on a spring (parallax reads as weight)
     --nx / --ny   lagged position normalised to -1..1 from the centre

   Layers then read them straight from CSS - transform: translate3d(calc(var(--nx)
   * 20px), ...) - so a mouse move repaints on the compositor and costs zero
   React re-renders. That matters here: the backdrops are large SVGs, and
   re-rendering them at 60fps would drop frames on the console's own animation. */

import { useEffect, useRef, useState } from "react";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function usePointerVars() {
  useEffect(() => {
    if (reduced()) return;
    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let lx = tx;
    let ly = ty;
    let raf = 0;

    const onMove = (e) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const onDown = () => set("--down", "1");
    const onUp = () => set("--down", "0");

    const tick = () => {
      lx += (tx - lx) * 0.13;
      ly += (ty - ly) * 0.13;
      set("--mx", tx.toFixed(1));
      set("--my", ty.toFixed(1));
      set("--lx", lx.toFixed(1));
      set("--ly", ly.toFixed(1));
      set("--nx", ((lx / window.innerWidth) * 2 - 1).toFixed(4));
      set("--ny", ((ly / window.innerHeight) * 2 - 1).toFixed(4));
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
}

/* Animate a number toward its new value. Used on the console metrics so a
   re-run visibly counts up rather than snapping - the movement is what tells
   you the number changed. */
function useCountUp(value, ms = 620) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  /* lazy useState initialiser reads this exactly once, which keeps the
     reduced-motion path free of both a setState-in-effect and a ref read
     during render */
  const [still] = useState(reduced);

  useEffect(() => {
    if (still) return;
    const a = from.current;
    const b = value;
    if (a === b) return;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(a + (b - a) * e);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);

    /* rAF does not fire while the tab is hidden, so without this the number
       freezes wherever the animation was interrupted - you come back to a
       stale "0.0%" sitting next to "38 of 42 cleared". The timer still fires
       (throttled) when hidden, so it guarantees we land on the real value
       whether or not a single frame ever ran. */
    const settle = setTimeout(() => setShown(b), ms + 80);

    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(settle);
    };
  }, [value, ms, still]);

  /* keep the animation's starting point in sync so an interrupted count
     resumes from where it visually is, not from where it began */
  useEffect(() => {
    from.current = shown;
  }, [shown]);

  return still ? value : shown;
}

/* Rect-relative pointer position for panel glows. Returns a ref to attach and
   writes --gx/--gy (0-100%) on that element only while the pointer is over it. */
function useLocalGlow() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
      el.style.setProperty("--gy", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    return () => el.removeEventListener("pointermove", onMove);
  }, []);
  return ref;
}

export { usePointerVars, useCountUp, useLocalGlow, reduced };

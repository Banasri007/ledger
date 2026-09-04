/* LEDGER - AI Finance Controller

   Reconciliation is not one of four features, it is the substrate the
   others read from: the matcher produces matches, exceptions and a
   decision log, and the cash forecast and exception wall read from those.

   Mode router only. See src/engine for the substrate, src/console for the
   tool, src/landing for the marketing surface. */

import { useState } from "react";
import { Console } from "./console/Console.jsx";
import { Landing } from "./landing/Landing.jsx";

export default function App() {
  const [mode, setMode] = useState("landing");
  return mode === "landing" ? (
    <Landing onLaunch={() => setMode("app")} />
  ) : (
    <Console onBack={() => setMode("landing")} />
  );
}

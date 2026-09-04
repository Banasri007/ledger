/* GET  /api/runs?key=…   → { history, durable }
   POST /api/runs         → { history, durable }   body: { key, run }

   Run history and mined rules, so a learning curve survives a refresh and can
   be shown across sessions rather than only within one page load. */

import { get, set, durable } from "./_store.js";

const MAX = 60; /* keep the tail; a hackathon demo does not need more */

const keyOf = (raw) => `ledger:runs:${String(raw || "default").slice(0, 80).replace(/[^\w:.-]/g, "_")}`;

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const history = (await get(keyOf(url.searchParams.get("key")))) || [];
      return res.status(200).json({ history, durable });
    }

    if (req.method === "POST") {
      const { key, run } = req.body || {};
      if (!run || typeof run !== "object")
        return res.status(400).json({ error: "bad_request", detail: "expected { key, run }" });

      const k = keyOf(key);
      const history = (await get(k)) || [];
      history.push({ ...run, at: Date.now() });
      const trimmed = history.slice(-MAX);
      await set(k, trimmed);
      return res.status(200).json({ history: trimmed, durable });
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    return res.status(500).json({ error: "store_error", detail: String(e?.message || e) });
  }
}

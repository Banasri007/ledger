/* Run history, so a learning curve survives a refresh.

   Two layers on purpose. localStorage always works and needs no setup, which
   matters when the thing has to run on a laptop in a demo room. The /api/runs
   endpoint is preferred when it reports `durable` - meaning Vercel KV is
   actually configured behind it - so history can also be shared across
   machines. When the server has no durable store the local copy wins, because
   a serverless Map that empties between invocations is worse than no server at
   all. */

const key = (k) => `ledger:runs:${k}`;

function localLoad(k) {
  try {
    const raw = localStorage.getItem(key(k));
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function localSave(k, history) {
  try {
    localStorage.setItem(key(k), JSON.stringify(history.slice(-60)));
  } catch {
    /* private mode, quota, blocked storage - not worth failing a run over */
  }
}

async function loadHistory(k) {
  try {
    const res = await fetch(`/api/runs?key=${encodeURIComponent(k)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.durable && Array.isArray(data.history)) {
        localSave(k, data.history);
        return { history: data.history, durable: true };
      }
    }
  } catch {
    /* offline or no endpoint - fall through to the local copy */
  }
  return { history: localLoad(k), durable: false };
}

async function recordRun(k, run) {
  const entry = { ...run, at: Date.now() };
  const local = [...localLoad(k), entry].slice(-60);
  localSave(k, local);

  try {
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: k, run }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.durable && Array.isArray(data.history)) {
        localSave(k, data.history);
        return { history: data.history, durable: true };
      }
    }
  } catch {
    /* keep the local copy */
  }
  return { history: local, durable: false };
}

function clearHistory(k) {
  try {
    localStorage.removeItem(key(k));
  } catch {
    /* ignore */
  }
}

export { loadHistory, recordRun, clearHistory };

/* A tiny key/value store with two backends.

   Vercel KV (or any Upstash-compatible REST endpoint) when KV_REST_API_URL and
   KV_REST_API_TOKEN are set. Otherwise an in-process Map.

   Be clear-eyed about the fallback: serverless invocations do not share memory,
   so the Map survives only within one warm instance. It exists so the endpoint
   works out of the box in `npm run dev` without provisioning a database
   mid-hackathon — it is not durable storage, and `durable` in the response
   says which one you actually got. The client keeps its own localStorage copy
   for exactly this reason. */

const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const durable = Boolean(URL_ && TOKEN);

const mem = new Map();

async function kv(path, body) {
  const res = await fetch(`${URL_}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`kv ${path}: ${res.status}`);
  return res.json();
}

async function get(key) {
  if (!durable) return mem.get(key) ?? null;
  const out = await kv(`get/${encodeURIComponent(key)}`);
  if (!out || out.result == null) return null;
  try {
    return JSON.parse(out.result);
  } catch {
    return null;
  }
}

async function set(key, value) {
  if (!durable) {
    mem.set(key, value);
    return;
  }
  await kv(`set/${encodeURIComponent(key)}`, JSON.stringify(value));
}

export { get, set, durable };

const VERSION = "3.53.0-build1";
const UPSTREAM = `https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@${VERSION}/dist/`;

const ALLOWED = new Set([
  "index.mjs",
  "sqlite3.wasm",
  "sqlite3-opfs-async-proxy.js"
]);

export async function onRequest(context) {
  const rawPath = context.params.path;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath || "");
  if (!ALLOWED.has(path)) {
    return new Response("Not found", { status: 404 });
  }

  const incoming = new URL(context.request.url);
  const upstream = new URL(path, UPSTREAM);
  upstream.search = incoming.search; // Important: SQLite 3.53 OPFS proxy uses ?vfs=opfs / opfs-wl.

  const cache = caches.default;
  const cacheKey = new Request(incoming.toString(), { method: "GET" });
  let response = await cache.match(cacheKey);

  if (!response) {
    const fetched = await fetch(upstream.toString(), {
      headers: { "User-Agent": "JQuants-PWA-SQLite-Proxy/1.0" },
      cf: { cacheEverything: true, cacheTtl: 86400 }
    });

    if (!fetched.ok) {
      return new Response(`SQLite upstream fetch failed: HTTP ${fetched.status}`, {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    const headers = new Headers(fetched.headers);
    headers.set("Cache-Control", "public, max-age=86400, immutable");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    headers.set("X-JQ-SQLite-Proxy", VERSION);
    if (path.endsWith(".mjs") || path.endsWith(".js")) {
      headers.set("Content-Type", "text/javascript; charset=utf-8");
    } else if (path.endsWith(".wasm")) {
      headers.set("Content-Type", "application/wasm");
    }

    response = new Response(fetched.body, {
      status: fetched.status,
      statusText: fetched.statusText,
      headers
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

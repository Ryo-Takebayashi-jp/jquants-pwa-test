
export async function onRequest(context) {
  const req = context.request;
  if (req.method !== "GET") return new Response("Method Not Allowed", {status:405});
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return new Response(JSON.stringify({error:"missing x-api-key"}), {
    status:400, headers:{"content-type":"application/json","cache-control":"no-store"}
  });
  const inUrl = new URL(req.url);
  const tail = context.params.path ? (Array.isArray(context.params.path) ? context.params.path.join("/") : context.params.path) : "";
  const upstream = new URL("https://api.jquants.com/v2/" + tail);
  upstream.search = inUrl.search;
  const r = await fetch(upstream.toString(), {
    method:"GET",
    headers:{"x-api-key":apiKey,"accept":"application/json"}
  });
  const h = new Headers();
  h.set("content-type", r.headers.get("content-type") || "application/json");
  h.set("cache-control","no-store");
  if(r.headers.get("retry-after")) h.set("retry-after",r.headers.get("retry-after"));
  h.set("x-jq-proxy","v7d-beta1b");
  return new Response(r.body,{status:r.status,headers:h});
}

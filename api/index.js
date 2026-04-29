export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("TARGET_DOMAIN not set", { status: 500 });
  }

  try {
    // ساخت URL به شکل استاندارد و بدون باگ
    const incomingUrl = new URL(req.url);
    const targetUrl = TARGET_BASE + incomingUrl.pathname + incomingUrl.search;

    // ساخت هدرها
    const headers = new Headers();
    let clientIp = null;

    for (const [k, v] of req.headers.entries()) {
      const key = k.toLowerCase();

      if (HOP_BY_HOP.has(key)) continue;
      if (key.startsWith("x-vercel-")) continue;

      if (key === "x-real-ip") {
        clientIp = v;
        continue;
      }

      if (key === "x-forwarded-for") {
        if (!clientIp) clientIp = v;
        continue;
      }

      headers.set(k, v);
    }

    if (clientIp) {
      headers.set("x-forwarded-for", clientIp);
    }

    // مدیریت body (سازگار با edge)
    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "follow",
    });

    // تمیز کردن response headers
    const respHeaders = new Headers(response.headers);
    respHeaders.delete("transfer-encoding");
    respHeaders.delete("content-encoding");

    return new Response(response.body, {
      status: response.status,
      headers: respHeaders,
    });

  } catch (err) {
    console.error("EDGE PROXY ERROR:", err);
    return new Response("Bad Gateway", { status: 502 });
  }
}

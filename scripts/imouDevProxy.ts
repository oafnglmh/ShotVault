import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * DEV-ONLY relay for the /admin/imou test page. Imou's OpenAPI and stream servers send no CORS
 * headers, so the browser cannot call them directly; `npm run dev` forwards these two routes
 * instead. Only Imou hosts are allowed. Not part of the production build.
 *
 *   POST /__imou/api/<host>/<method>   → https://<host>/openapi/<method>
 *   GET  /__imou/stream?url=<https URL> → streamed through (FLV video)
 */
const API_HOST = /^openapi(-[a-z]+)?\.(easy4ip\.com|lechange\.cn)$/;
const STREAM_HOST = /(^|\.)(easy4ip\.com|lechange\.com|lechange\.cn|imoulife\.com|imou\.com)$/;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of req) parts.push(c as Buffer);
  return Buffer.concat(parts);
}

function fail(res: ServerResponse, status: number, msg: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ result: { code: `PROXY${status}`, msg } }));
}

export function imouDevProxy(): Plugin {
  return {
    name: "imou-dev-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__imou", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        try {
          if (req.method === "POST" && url.pathname.startsWith("/api/")) {
            const [, , host, ...method] = url.pathname.split("/");
            if (!API_HOST.test(host) || !method.length) return fail(res, 400, "host not allowed");
            const upstream = await fetch(`https://${host}/openapi/${method.join("/")}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: new Uint8Array(await readBody(req)),
            });
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json");
            res.end(Buffer.from(await upstream.arrayBuffer()));
            return;
          }
          if (req.method === "GET" && url.pathname === "/stream") {
            const target = new URL(url.searchParams.get("url") ?? "");
            if (target.protocol !== "https:" || !STREAM_HOST.test(target.hostname)) return fail(res, 400, "stream host not allowed");
            const ac = new AbortController();
            req.on("close", () => ac.abort());
            const upstream = await fetch(target, { signal: ac.signal });
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
            if (!upstream.body) return res.end();
            Readable.fromWeb(upstream.body as never)
              .on("error", () => res.destroy())
              .pipe(res);
            return;
          }
          fail(res, 404, "unknown route");
        } catch (e) {
          if (!res.headersSent) fail(res, 502, e instanceof Error ? e.message : String(e));
          else res.destroy();
        }
      });
    },
  };
}

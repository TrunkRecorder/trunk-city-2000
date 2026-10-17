#!/usr/bin/env node
// A server for working on the interface: serves interface/ as the recorder
// would, and passes /api/… and /calls/… (the WebSocket too) to a recorder,
// so the page sees real systems and calls.
//
//   node tools/serve.mjs                          # the recorder on localhost:8080
//   node tools/serve.mjs --recorder 127.0.0.1:8081 --port 8099
//   node tools/serve.mjs --client path/to/client.js   # no recorder: open /?demo
//
// Whatever the recorder's port allows, the page gets listen access here: of
// what it sends, only the commands a listen-only interface may send are
// passed on (the rest are dropped, and logged). Files are read on every
// request: edit, then reload.

import { createServer, request } from "node:http";
import { connect } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const ROOT = resolve(new URL("../interface", import.meta.url).pathname);
const PORT = Number(opt("port", 8099));
const [RHOST, RPORT] = opt("recorder", "127.0.0.1:8080").split(":");
const CLIENT = opt("client", null);
const LISTEN = new Set(["subscribe", "statsQuery", "radioQuery", "olderCalls", "listen"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (CLIENT && url.pathname === "/api/client.js") {
    res.writeHead(200, { "content-type": TYPES[".js"] });
    return res.end(await readFile(CLIENT));
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/calls/")) {
    const headers = { ...req.headers, host: `${RHOST}:${RPORT}` };
    delete headers.origin;
    const up = request({ host: RHOST, port: RPORT, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`No recorder at ${RHOST}:${RPORT} (${e.code}). Start one, or pass --recorder host:port, or --client and open /?demo.`);
    });
    return req.pipe(up);
  }
  const path = normalize(join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
  if (!path.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    if (!(await stat(path)).isFile()) throw new Error();
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

// The WebSocket: the handshake as it came (less Origin), then frames both
// ways; the page's are read, and only listen-only commands go on.
server.on("upgrade", (req, sock, head) => {
  const up = connect(Number(RPORT), RHOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i];
      if (/^origin$/i.test(k)) continue;
      lines.push(`${k}: ${/^host$/i.test(k) ? `${RHOST}:${RPORT}` : req.rawHeaders[i + 1]}`);
    }
    up.write(lines.join("\r\n") + "\r\n\r\n");
    if (head?.length) sock.unshift(head);
    up.pipe(sock);
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const f = frame(buf);
        if (!f) break;
        buf = buf.subarray(f.length);
        if (f.opcode === 0) continue; // a fragment: commands are small, never split
        if (f.opcode === 1) {
          let type = null;
          try {
            type = JSON.parse(f.text).type;
          } catch {}
          if (!LISTEN.has(type)) {
            console.log(`dropped a "${type}" command: this server gives the page listen access only`);
            continue;
          }
        }
        up.write(f.raw);
      }
    });
  });
  const end = () => (sock.destroy(), up.destroy());
  up.on("error", end);
  sock.on("error", end);
  up.on("close", end);
  sock.on("close", end);
});

/** One whole WebSocket frame at the start of `b` (a browser's: masked), or null. */
function frame(b) {
  if (b.length < 2) return null;
  const opcode = b[0] & 15;
  let len = b[1] & 127,
    at = 2;
  if (len === 126) {
    if (b.length < 4) return null;
    len = b.readUInt16BE(2);
    at = 4;
  } else if (len === 127) {
    if (b.length < 10) return null;
    len = Number(b.readBigUInt64BE(2));
    at = 10;
  }
  const masked = b[1] & 128;
  const total = at + (masked ? 4 : 0) + len;
  if (b.length < total) return null;
  let text = "";
  if (opcode === 1) {
    const key = masked ? b.subarray(at, at + 4) : null;
    const data = Buffer.from(b.subarray(total - len, total));
    if (key) for (let i = 0; i < data.length; i++) data[i] ^= key[i & 3];
    text = data.toString("utf8");
  }
  return { opcode, text, raw: b.subarray(0, total), length: total };
}

server.listen(PORT, () => console.log(`Trunk City 2000 on http://localhost:${PORT}/ (recorder: ${RHOST}:${RPORT}${CLIENT ? `; client.js from ${CLIENT}` : ""})`));

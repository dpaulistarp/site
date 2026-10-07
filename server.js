import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 5500;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".sql": "text/plain; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(urlObj.pathname);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. Endpoint dinâmico de status FiveM
  if (pathname === "/api/fivem-status") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const endpoints = [
      "http://distritopaulistarp.fivebr.gg:30120/dynamic.json",
      "http://188.220.168.200:30120/dynamic.json"
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          const data = await response.json();
          const clients = typeof data.clients === "number" ? data.clients : parseInt(data.clients) || 0;
          const maxClients = parseInt(data.sv_maxclients) || 128;
          res.writeHead(200);
          res.end(JSON.stringify({
            online: true,
            clients,
            maxClients,
            hostname: data.hostname || "DISTRITO PAULISTA",
            gametype: data.gametype || "Distrito Paulista Roleplay"
          }));
          return;
        }
      } catch (e) {}
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      online: false,
      clients: 0,
      maxClients: 128
    }));
    return;
  }

  // 2. Servir arquivos estáticos
  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const filePath = path.join(__dirname, pathname);

  // Prevenir Path Traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("403 Forbidden");
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      const stream = fs.createReadStream(filePath);
      res.writeHead(200);
      stream.pipe(res);
      return;
    }
  } catch (err) {}

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  console.log(`[DISTRITO PAULISTA RP] Servidor ativo em http://localhost:${PORT}`);
});

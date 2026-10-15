import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INITIAL_DEMO_USERS, INITIAL_DEMO_APPLICATIONS } from "./data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 5500;
const DATA_DIR = path.join(__dirname, "data");

// Assegurar diretório de persistência de dados local
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const APPS_FILE = path.join(DATA_DIR, "applications.json");
const TEAM_FILE = path.join(DATA_DIR, "team.json");

// Inicializar arquivos se não existirem
if (!fs.existsSync(APPS_FILE)) {
  fs.writeFileSync(APPS_FILE, JSON.stringify(INITIAL_DEMO_APPLICATIONS, null, 2), "utf-8");
}
if (!fs.existsSync(TEAM_FILE)) {
  // Inicializar com o CEO Master e membros padrão com senhas temporárias funcionais
  const initialTeam = structuredClone(INITIAL_DEMO_USERS).map(u => ({
    ...u,
    password: u.role === "ceo" ? "Distrito2026@" : "Staff2026@"
  }));
  fs.writeFileSync(TEAM_FILE, JSON.stringify(initialTeam, null, 2), "utf-8");
}

function loadApplicationsData() {
  try {
    return JSON.parse(fs.readFileSync(APPS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveApplicationsData(data) {
  try {
    fs.writeFileSync(APPS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Erro ao salvar applications.json:", e);
  }
}

function loadTeamData() {
  try {
    return JSON.parse(fs.readFileSync(TEAM_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveTeamData(data) {
  try {
    fs.writeFileSync(TEAM_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Erro ao salvar team.json:", e);
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. Endpoint de status FiveM
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
    res.end(JSON.stringify({ online: false, clients: 0, maxClients: 128 }));
    return;
  }

  // 2. API DE CANDIDATURAS (APPLICATIONS)
  if (pathname === "/api/applications") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    if (req.method === "GET") {
      const list = loadApplicationsData();
      res.writeHead(200);
      res.end(JSON.stringify(list));
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body.game_name || !body.discord_tag) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, message: "Campos obrigatórios ausentes." }));
        return;
      }
      const list = loadApplicationsData();
      const newApp = {
        id: body.id || ("app-" + Date.now()),
        game_name: body.game_name,
        discord_tag: body.discord_tag,
        age: Number(body.age) || 18,
        desired_role: body.desired_role || "suporte",
        availability: body.availability || "",
        experience: body.experience || "",
        scenario1: body.scenario1 || "",
        scenario2: body.scenario2 || "",
        motivation: body.motivation || "",
        answers: body.answers || {},
        status: "pending",
        reviewer: null,
        reviewed_at: null,
        created_at: body.created_at || new Date().toISOString()
      };
      const existingIdx = list.findIndex(a => a.id === newApp.id);
      if (existingIdx >= 0) {
        list[existingIdx] = newApp;
      } else {
        list.unshift(newApp);
      }
      saveApplicationsData(list);

      res.writeHead(201);
      res.end(JSON.stringify({ ok: true, application: newApp }));
      return;
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (!body.id) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, message: "ID obrigatório." }));
        return;
      }
      const list = loadApplicationsData();
      const target = list.find(a => a.id === body.id);
      if (target) {
        if (body.status) target.status = body.status;
        if (body.reviewer) target.reviewer = body.reviewer;
        if (body.review_date || body.reviewed_at) target.reviewed_at = body.review_date || body.reviewed_at;
        if (body.reviewer_notes) target.reviewer_notes = body.reviewer_notes;
        saveApplicationsData(list);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, application: target }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, message: "Candidatura não encontrada." }));
      }
      return;
    }

    if (req.method === "DELETE") {
      const urlId = urlObj.searchParams.get("id");
      const body = await readBody(req);
      const id = urlId || body.id;
      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, message: "ID obrigatório." }));
        return;
      }
      let list = loadApplicationsData();
      list = list.filter(a => a.id !== id);
      saveApplicationsData(list);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }
  }

  // 3. CONSULTA DE STATUS DE CANDIDATURA (JOGADOR)
  if (pathname === "/api/applications/check") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const q = (urlObj.searchParams.get("q") || "").trim().toLowerCase();
    if (!q) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, message: "Parâmetro de busca obrigatório." }));
      return;
    }
    const cleanQ = q.replace(/^#/, "");
    const list = loadApplicationsData();
    const match = list.find(a => {
      const dTag = (a.discord_tag || "").toLowerCase().replace(/^#/, "");
      const gName = (a.game_name || "").toLowerCase();
      return dTag === cleanQ || dTag.includes(cleanQ) || gName.includes(cleanQ);
    });

    if (match) {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, application: match }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, message: "Nenhuma candidatura encontrada." }));
    }
    return;
  }

  // 4. API DE EQUIPE / STAFF (TEAM)
  if (pathname === "/api/team") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    if (req.method === "GET") {
      const list = loadTeamData();
      // Retorna membros com dados seguros (sem expor senhas em listagens públicas)
      const safeList = list.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status || "active",
        created_at: m.created_at
      }));
      res.writeHead(200);
      res.end(JSON.stringify(safeList));
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body.name || !body.email) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, message: "Nome e e-mail são obrigatórios." }));
        return;
      }
      const list = loadTeamData();
      const emailLower = body.email.trim().toLowerCase();
      let member = list.find(m => m.email.toLowerCase() === emailLower);

      if (member) {
        member.name = body.name;
        member.role = body.role || member.role;
        member.status = body.status || member.status || "active";
        if (body.password) member.password = body.password;
      } else {
        member = {
          id: body.id || ("user-" + Date.now()),
          name: body.name,
          email: emailLower,
          role: body.role || "suporte",
          password: body.password || "Staff2026@",
          status: "active",
          created_at: new Date().toISOString()
        };
        list.push(member);
      }
      saveTeamData(list);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, member }));
      return;
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (!body.id && !body.email) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, message: "ID ou e-mail obrigatório." }));
        return;
      }
      const list = loadTeamData();
      const target = list.find(m => m.id === body.id || (body.email && m.email.toLowerCase() === body.email.toLowerCase()));
      if (target) {
        if (body.role) target.role = body.role;
        if (body.name) target.name = body.name;
        if (body.status) target.status = body.status;
        if (body.password) target.password = body.password;
        saveTeamData(list);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, member: target }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, message: "Membro não encontrado." }));
      }
      return;
    }

    if (req.method === "DELETE") {
      const urlId = urlObj.searchParams.get("id");
      const body = await readBody(req);
      const id = urlId || body.id;
      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, message: "ID obrigatório." }));
        return;
      }
      let list = loadTeamData();
      list = list.filter(m => m.id !== id);
      saveTeamData(list);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }
  }

  // 5. API DE AUTENTICAÇÃO STAFF (LOGIN)
  if (pathname === "/api/login" && req.method === "POST") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const body = await readBody(req);
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, message: "Informe e-mail e senha corporativa." }));
      return;
    }

    const team = loadTeamData();
    const isMasterCeo = email === "dpaulistarp@gmail.com" || email === "ceo@distritopaulista.com";
    let matchedMember = team.find(m => m.email.toLowerCase() === email);

    if (isMasterCeo && !matchedMember) {
      matchedMember = {
        id: "user-ceo-01",
        name: "Blaze / Lomba / Morgan",
        email: email,
        password: password,
        role: "ceo",
        status: "active",
        created_at: new Date().toISOString()
      };
      team.unshift(matchedMember);
      saveTeamData(team);
    }

    if (matchedMember) {
      if (matchedMember.status !== "active") {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, message: "Acesso negado: Esta conta de Staff está suspensa ou bloqueada." }));
        return;
      }

      const isCeoValid = isMasterCeo && (password === "Distrito2026@" || password === matchedMember.password);

      // Se a conta não tem senha cadastrada ainda (ex: contas seed), define a primeira senha usada
      if (!matchedMember.password) {
        matchedMember.password = password;
        saveTeamData(team);
      } else if (!isCeoValid && matchedMember.password !== password) {
        res.writeHead(401);
        res.end(JSON.stringify({ ok: false, message: "Senha incorreta. Verifique suas credenciais de Staff." }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        user: {
          id: matchedMember.id,
          name: matchedMember.name,
          email: matchedMember.email,
          role: matchedMember.role,
          status: matchedMember.status
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, message: "Acesso negado: Credenciais inválidas ou e-mail não cadastrado na Staff." }));
    return;
  }

  // 6. Servir arquivos estáticos
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
      stream.on("error", () => {
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      });
      res.on("error", () => {
        stream.destroy();
      });
      res.writeHead(200);
      stream.pipe(res);
      return;
    }
  } catch (err) {}

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
});

server.on("error", (err) => {
  console.error("[Servidor] Erro no servidor:", err.message);
});

process.on("uncaughtException", (err) => {
  console.warn("[Servidor] Exceção tratada com segurança:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.warn("[Servidor] Rejeição tratada com segurança:", reason);
});

server.listen(PORT, () => {
  console.log(`[DISTRITO PAULISTA RP] Servidor ativo em http://localhost:${PORT}`);
});

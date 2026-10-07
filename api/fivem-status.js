/**
 * API Serverless para Consulta em Tempo Real do Servidor FiveM
 * Distrito Paulista RP — Suporta Vercel, Node.js e Serverless Functions
 */
export default async function handler(req, res) {
  // CORS Headers para permitir requisições de qualquer origem
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const serverEndpoints = [
    "http://distritopaulistarp.fivebr.gg:30120/dynamic.json",
    "http://188.220.168.200:30120/dynamic.json"
  ];

  for (const endpoint of serverEndpoints) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(3500)
      });
      if (response.ok) {
        const data = await response.json();
        const clients = typeof data.clients === "number" ? data.clients : parseInt(data.clients) || 0;
        const maxClients = parseInt(data.sv_maxclients) || 128;

        return res.status(200).json({
          online: true,
          clients,
          maxClients,
          hostname: data.hostname || "DISTRITO PAULISTA",
          gametype: data.gametype || "Distrito Paulista Roleplay",
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      // Tenta próximo endpoint se falhar
    }
  }

  return res.status(200).json({
    online: false,
    clients: 0,
    maxClients: 128,
    error: "Servidor FiveM inacessível no momento"
  });
}

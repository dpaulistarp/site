import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  DEFAULT_RULES,
  INITIAL_DEMO_USERS,
  INITIAL_DEMO_APPLICATIONS,
  ROLE_DISPLAY_NAMES,
  ROLE_EMOJIS
} from "./data.js";

/**
 * ============================================================================
 * DISTRITO PAULISTA RP — CORE ENGINE & SEGURANÇA
 * ============================================================================
 */
const SUPABASE_URL = "https://uxgnhavnvwwbvpioukcj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Xoc1O2t6K5TyvFw0fPZ-8w_Xn82mflT";

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("COLE_") &&
  !SUPABASE_ANON_KEY.includes("COLE_");

const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

/* ==========================================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ========================================================================== */
const state = {
  rules: structuredClone(DEFAULT_RULES),
  applications: structuredClone(INITIAL_DEMO_APPLICATIONS),
  currentUser: null,
  currentRole: "guest",
  currentRuleTab: "gerais",
  searchQuery: "",
  penalCategoryFilter: "todos"
};

/* ==========================================================================
   HELPERS DOM & SANITIZAÇÃO RIGOROSA ANTI-XSS
   ========================================================================== */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/**
 * Higienização estrita contra Cross-Site Scripting (XSS).
 * Converte caracteres perigosos em entidades HTML seguras.
 */
const escapeHtml = (value = "") => {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
};

const toast = (message) => {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el.dataset.timeoutId);
  el.dataset.timeoutId = setTimeout(() => el.classList.remove("show"), 3200);
};

const formatDate = (isoString) => {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return isoString;
  }
};

const copyToClipboard = async (text, successMsg = "Texto copiado com sucesso!") => {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMsg);
  } catch (err) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      toast(successMsg);
    } catch {
      toast("Não foi possível copiar automaticamente.");
    }
    document.body.removeChild(textarea);
  }
};

/* ==========================================================================
   CARREGAMENTO & PERSISTÊNCIA DE ESTADO LOCAL
   ========================================================================== */
function loadStateFromStorage() {
  const RULES_VERSION = "2026.10_v2";
  if (localStorage.getItem("dp_rules_version") !== RULES_VERSION) {
    localStorage.removeItem("dp_rules");
    localStorage.setItem("dp_rules_version", RULES_VERSION);
  }

  const savedRules = localStorage.getItem("dp_rules");
  if (savedRules) {
    try {
      state.rules = { ...DEFAULT_RULES, ...JSON.parse(savedRules) };
    } catch (e) {}
  }

  const savedApps = localStorage.getItem("dp_applications");
  if (savedApps) {
    try {
      state.applications = JSON.parse(savedApps);
    } catch (e) {}
  }
}

/* ==========================================================================
   ENGINE DE ÁUDIO TÁTICO (WEB AUDIO API) — HUD REALISTA FIVEM
   ========================================================================== */
let audioCtx = null;
let soundEnabled = localStorage.getItem("dp_sound") !== "muted";

function playTacticalClick(type = "tick") {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === "tick") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.035);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === "f8") {
      osc.type = "square";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.045);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.start(now);
      osc.stop(now + 0.045);
    } else if (type === "switch") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.04);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  } catch {}
}

function setupSoundToggle() {
  const btn = $("#soundToggleBtn");
  const icon = $("#soundIcon");
  if (!btn) return;

  const updateIcon = () => {
    if (icon) icon.textContent = soundEnabled ? "🔊" : "🔇";
    btn.setAttribute("title", soundEnabled ? "Efeitos sonoros da interface ativos (clique para mutar)" : "Efeitos sonoros mudos (clique para ativar)");
  };
  updateIcon();

  btn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem("dp_sound", soundEnabled ? "active" : "muted");
    updateIcon();
    if (soundEnabled) playTacticalClick("f8");
  });
}

/* ==========================================================================
   SELETOR INTERATIVO DE FACÇÕES (INDEX.HTML)
   ========================================================================== */
function setupFactionTabs() {
  const tabBtns = $$(".faction-tab-btn");
  if (tabBtns.length === 0) return;

  const factionMap = {
    pmesp: $("#factionPmesp"),
    civil: $("#factionCivil"),
    prf: $("#factionPrf"),
    ilegal: $("#factionIlegal"),
    samu: $("#factionSamu"),
    mecanica: $("#factionMecanica")
  };

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetFaction = btn.dataset.faction;
      if (!targetFaction) return;

      playTacticalClick("switch");

      tabBtns.forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      Object.entries(factionMap).forEach(([key, cardEl]) => {
        if (!cardEl) return;
        if (key === targetFaction) {
          cardEl.classList.remove("hidden");
          cardEl.classList.add("active");
        } else {
          cardEl.classList.remove("active");
          cardEl.classList.add("hidden");
        }
      });
    });
  });
}

/* ==========================================================================
   NAVEGAÇÃO, TOPBAR & AUTENTICAÇÃO NO CABEÇALHO
   ========================================================================== */
function setupNavigation() {
  // 1. Alternador de menu responsivo mobile
  const menuToggle = $("#menuToggle");
  const mainNav = $("#mainNav");
  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      playTacticalClick("tick");
      const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", !isExpanded);
      mainNav.classList.toggle("open");
    });

    // Fechar ao clicar em qualquer link no mobile
    $$(".nav-link", mainNav).forEach(link => {
      link.addEventListener("click", () => {
        menuToggle.setAttribute("aria-expanded", "false");
        mainNav.classList.remove("open");
      });
    });
  }

  // 2. Botões de Copiar IP e Conexão Direta ao FiveM
  $$(".btn-copy-ip").forEach(btn => {
    btn.addEventListener("click", () => {
      playTacticalClick("f8");
      copyToClipboard("connect distritopaulistarp.fivebr.gg", "Comando de conexão copiado! Cole no F8 do FiveM.");
    });
  });

  $$(".btn-connect-fivem").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      playTacticalClick("f8");
      copyToClipboard("connect distritopaulistarp.fivebr.gg", "Abrindo FiveM e comando copiado para o F8!");
      window.location.href = "fivem://connect/distritopaulistarp.fivebr.gg";
    });
  });

  // Alternador de som de interface
  setupSoundToggle();

  // 3. Atualizar link ativo no menu de navegação de acordo com a página atual
  const path = window.location.pathname.toLowerCase();
  $$(".nav-link").forEach(link => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    link.classList.remove("active");

    if (path.includes("regras.html") && href.includes("regras.html")) {
      link.classList.add("active");
    } else if (path.includes("recrutamento.html") && href.includes("recrutamento.html")) {
      link.classList.add("active");
    } else if (path.includes("consultar-inscricao.html") && href.includes("consultar-inscricao.html")) {
      link.classList.add("active");
    } else if (path.includes("login-staff.html") && href.includes("login-staff.html")) {
      link.classList.add("active");
    } else if ((path.endsWith("/") || path.includes("index.html")) && (href === "index.html" || href === "#home")) {
      link.classList.add("active");
    }
  });

  // 4. Polling dinâmico em tempo real de jogadores online
  updateOnlinePlayers();
  if (!window._dpPlayerPollStarted) {
    window._dpPlayerPollStarted = true;
    setInterval(updateOnlinePlayers, 10000);
  }
}

async function updateOnlinePlayers() {
  const onlineCountEl = $("#onlineCount");
  const maxClientsEl = $("#maxClients");
  if (!onlineCountEl) return;

  const endpoints = [
    "/api/fivem-status",
    "http://distritopaulistarp.fivebr.gg:30120/dynamic.json",
    "http://188.220.168.200:30120/dynamic.json"
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        const clients = typeof data.clients === "number" ? data.clients : parseInt(data.clients);
        const max = typeof data.maxClients === "number"
          ? data.maxClients
          : parseInt(data.sv_maxclients || data.maxClients || 128);

        if (!isNaN(clients)) {
          onlineCountEl.textContent = clients;
          if (maxClientsEl && !isNaN(max)) maxClientsEl.textContent = max;
          localStorage.setItem("dp_cached_fivem_status", JSON.stringify({ clients, maxClients: max, time: Date.now() }));
          return;
        }
      }
    } catch (err) {
      // Tenta próximo endpoint
    }
  }

  // Se nenhum endpoint responder (offline ou sem proxy), utiliza cache recente ou 0
  try {
    const cached = JSON.parse(localStorage.getItem("dp_cached_fivem_status") || "null");
    if (cached && typeof cached.clients === "number") {
      onlineCountEl.textContent = cached.clients;
      if (maxClientsEl && cached.maxClients) maxClientsEl.textContent = cached.maxClients;
      return;
    }
  } catch {}

  onlineCountEl.textContent = "0";
  if (maxClientsEl) maxClientsEl.textContent = "128";
}

/**
 * Renderiza o botão do cabeçalho dinamicamente:
 * - Se o usuário NÃO estiver logado: Mostra "Login Staff" (link para login-staff.html).
 * - Se o usuário ESTIVER logado: Mostra "👑 Painel Staff" (link para dashboard.html) + botão "Sair".
 */
function renderNavAuth(user = state.currentUser) {
  const slot = $("#navAuthSlot");
  if (!slot) return;

  if (user && user.role && user.role !== "guest" && user.role !== "player") {
    const roleEmoji = ROLE_EMOJIS[user.role] || "👑";
    const roleName = ROLE_DISPLAY_NAMES[user.role] || user.role;
    slot.innerHTML = `
      <div class="nav-auth-logged-group" style="display: flex; align-items: center; gap: 8px;">
        <a href="dashboard.html" class="btn btn-gold btn-staff-panel-nav" title="Ir para o Painel Administrativo (${roleName})">
          <span class="user-role-emoji">${roleEmoji}</span>
          <span>Painel Staff</span>
        </a>
        <button type="button" class="btn-nav-logout" id="navLogoutBtn" title="Desconectar sessão">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span>Sair</span>
        </button>
      </div>
    `;

    $("#navLogoutBtn")?.addEventListener("click", handleLogout);
  } else {
    slot.innerHTML = `
      <a href="login-staff.html" class="btn btn-outline-gold btn-staff-login-nav" id="navLoginBtn" title="Acesso restrito para membros da Staff">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <span>Login Staff</span>
      </a>
    `;
  }
}

/* ==========================================================================
   MÓDULO DE REGRAS E CÓDIGO PENAL (regras.html)
   ========================================================================== */
function setupRulesEvents() {
  const container = $("#rulesContent");
  if (!container) return;

  // Atualizar contadores das abas
  updateRuleCounts();

  // Cliques nas abas
  $$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabKey = btn.dataset.tab;
      setActiveRuleTab(tabKey);
    });
  });

  // Campo de busca com debounce
  const searchInput = $("#ruleSearchInput");
  const clearBtn = $("#clearSearchBtn");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      if (clearBtn) clearBtn.classList.toggle("hidden", !state.searchQuery);
      renderRules(state.currentRuleTab);
    });

    clearBtn?.addEventListener("click", () => {
      searchInput.value = "";
      state.searchQuery = "";
      clearBtn.classList.add("hidden");
      renderRules(state.currentRuleTab);
      searchInput.focus();
    });

    // Atalho global Ctrl + K
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInput.focus();
        toast("Pesquisa de regras ativada!");
      }
    });
  }

  // Delegar cópia de texto das regras e clique em filtros
  container.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (chip) {
      state.penalCategoryFilter = chip.getAttribute("data-category") || "todos";
      renderRules("codigo_penal");
      return;
    }

    const copyBtn = e.target.closest(".rule-copy-btn");
    if (copyBtn) {
      const text = copyBtn.getAttribute("data-rule-text") || "";
      copyToClipboard(text, "Artigo / regra copiado com sucesso!");
    }
  });

  // Detectar parâmetro ?cat= na URL ou Hash
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get("cat");
  const hashParam = window.location.hash.replace("#", "");

  const initialTab = catParam || hashParam || "gerais";
  if (state.rules[initialTab]) {
    setActiveRuleTab(initialTab);
  } else {
    setActiveRuleTab("gerais");
  }
}

function setActiveRuleTab(tabKey) {
  state.currentRuleTab = tabKey;
  $$(".tab-btn").forEach(btn => {
    const isCurrent = btn.dataset.tab === tabKey;
    btn.classList.toggle("active", isCurrent);
    btn.setAttribute("aria-selected", isCurrent ? "true" : "false");
  });
  renderRules(tabKey);
}

function updateRuleCounts() {
  Object.keys(DEFAULT_RULES).forEach(key => {
    const countEl = $(`#count${key.charAt(0).toUpperCase() + key.slice(1)}`);
    if (countEl && state.rules[key]?.content) {
      const lines = state.rules[key].content.split("\n").filter(l => l.trim().length > 0);
      countEl.textContent = lines.length;
    }
  });
}

function renderRules(tabKey) {
  const container = $("#rulesContent");
  if (!container) return;

  const data = state.rules[tabKey] || DEFAULT_RULES[tabKey];
  if (!data || !data.content) {
    container.innerHTML = `<p class="muted-text text-center">Nenhum regulamento encontrado nesta categoria.</p>`;
    return;
  }

  const rawLines = data.content.split("\n").map(l => l.trim()).filter(Boolean);
  const query = state.searchQuery;

  if (tabKey === "codigo_penal") {
    // Renderização Especial em Tabela do Código Penal SP
    renderPenalCodeTable(container, data, rawLines, query);
    return;
  }

  // Filtrar regras se houver busca
  const filteredLines = rawLines.filter(line => {
    if (!query) return true;
    return line.toLowerCase().includes(query);
  });

  // Atualizar contador de resultados da busca
  const searchCounter = $("#searchCounter");
  if (searchCounter) {
    if (query) {
      searchCounter.classList.remove("hidden");
      searchCounter.textContent = `${filteredLines.length} regra(s) encontrada(s)`;
    } else {
      searchCounter.classList.add("hidden");
    }
  }

  if (filteredLines.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
        <h3 style="color: #fff;">Nenhum resultado para "${escapeHtml(query)}"</h3>
        <p style="margin-top: 6px;">Tente pesquisar por outros termos como homicídio, desacato, assalto, VDM, RDM ou safezone.</p>
      </div>
    `;
    return;
  }

  const itemsHtml = filteredLines.map((line, index) => {
    // Checar se é um cabeçalho de seção / capítulo
    const isSectionHeader = /^(PRINCÍPIOS|CAPÍTULO|REGRAS|DIRETRIZES|TEMPO|REQUISITOS|ORIENTAÇÕES|ÁREAS SAFE|CONSIDERAÇÕES FINAIS)/i.test(line);

    if (isSectionHeader) {
      return `
        <div class="rule-section-header">
          <span class="section-icon">⚖️</span>
          <span>${escapeHtml(line)}</span>
        </div>
      `;
    }

    let displayText = escapeHtml(line);
    if (query) {
      const safeEscapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${safeEscapedQuery})`, "gi");
      displayText = displayText.replace(regex, "<mark>$1</mark>");
    }

    const isBullet = line.startsWith("•") || line.startsWith("-");
    const numMatch = line.match(/^(\d+(\.\d+)?)\s*(.*)/);

    let ruleNumHtml = `<div class="rule-number">${(index + 1).toString().padStart(2, "0")}</div>`;
    if (isBullet) {
      ruleNumHtml = `<div class="rule-number" style="font-size: 1rem;">•</div>`;
    } else if (numMatch) {
      ruleNumHtml = `<div class="rule-number">${escapeHtml(numMatch[1])}</div>`;
    }

    return `
      <div class="rule-item-box ${isBullet ? "bullet-type" : ""}">
        ${ruleNumHtml}
        <div class="rule-text">${displayText}</div>
        <button class="rule-copy-btn" data-rule-text="${escapeHtml(line)}" title="Copiar texto da regra" aria-label="Copiar regra">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="rules-category-header">
      <div>
        <h3 style="color: #fff; font-size: 1.4rem;">${escapeHtml(data.title)}</h3>
        <p class="muted-text" style="font-size: 0.9rem; margin-top: 4px;">Regulamento oficial ativo no servidor Distrito Paulista RP.</p>
      </div>
      <button class="btn btn-glass btn-sm" id="btnCopyCategory" style="align-self: flex-start;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copiar Todas as Regras</span>
      </button>
    </div>
    <div class="rules-items-list">
      ${itemsHtml}
    </div>
  `;

  $("#btnCopyCategory")?.addEventListener("click", () => {
    copyToClipboard(data.content, "Categoria completa copiada para a área de transferência!");
  });
}

function renderPenalCodeTable(container, data, rawLines, query) {
  // Parse dos artigos com delimitador |
  const parsed = rawLines.map(line => {
    const parts = line.split("|").map(p => p.trim());
    if (parts.length >= 6) {
      return {
        category: parts[0],
        article: parts[1],
        infraction: parts[2],
        services: parts[3],
        fine: parts[4],
        obs: parts.slice(5).join(" | "),
        raw: line
      };
    }
    return {
      category: "Outros",
      article: "Artigo",
      infraction: line,
      services: "0",
      fine: "R$ 0,00",
      obs: "",
      raw: line
    };
  });

  // Categorias únicas para os chips de filtro
  const categories = [
    { key: "todos", label: "Todas as Infrações" },
    { key: "Trânsito", label: "🚗 Trânsito" },
    { key: "Crimes Contra a Pessoa", label: "👤 Contra a Pessoa" },
    { key: "Crimes Contra o Patrimônio", label: "💰 Patrimônio" },
    { key: "Crimes Contra a Ordem Pública", label: "⚖️ Ordem Pública" },
    { key: "Lei de Armas e Drogas", label: "🔫 Armas & Drogas" }
  ];

  // Filtragem por Categoria
  const selectedCat = state.penalCategoryFilter || "todos";
  let filtered = parsed;
  if (selectedCat !== "todos") {
    filtered = filtered.filter(item => item.category.toLowerCase().includes(selectedCat.toLowerCase()));
  }

  // Filtragem por Busca
  if (query) {
    filtered = filtered.filter(item => {
      const fullText = `${item.category} ${item.article} ${item.infraction} ${item.services} ${item.fine} ${item.obs}`.toLowerCase();
      return fullText.includes(query);
    });
  }

  // Atualizar contador
  const searchCounter = $("#searchCounter");
  if (searchCounter) {
    if (query || selectedCat !== "todos") {
      searchCounter.classList.remove("hidden");
      searchCounter.textContent = `${filtered.length} artigo(s) encontrado(s) no Código Penal`;
    } else {
      searchCounter.classList.add("hidden");
    }
  }

  // Gerar Chips de Filtro
  const chipsHtml = categories.map(cat => {
    const isActive = selectedCat.toLowerCase() === cat.key.toLowerCase();
    const count = cat.key === "todos" ? parsed.length : parsed.filter(p => p.category.toLowerCase().includes(cat.key.toLowerCase())).length;
    return `
      <button type="button" class="filter-chip ${isActive ? "active" : ""}" data-category="${escapeHtml(cat.key)}">
        <span>${escapeHtml(cat.label)}</span>
        <span style="opacity: 0.75; font-size: 0.74rem;">(${count})</span>
      </button>
    `;
  }).join("");

  // Gerar Linhas da Tabela
  const tableRowsHtml = filtered.map(item => {
    let catClass = "transito";
    if (item.category.includes("Pessoa")) catClass = "pessoa";
    else if (item.category.includes("Patrimônio")) catClass = "patrimonio";
    else if (item.category.includes("Ordem")) catClass = "ordem";
    else if (item.category.includes("Armas")) catClass = "armas";

    let infractionText = escapeHtml(item.infraction);
    let articleText = escapeHtml(item.article);
    let obsText = escapeHtml(item.obs);

    if (query) {
      const safeEscapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${safeEscapedQuery})`, "gi");
      infractionText = infractionText.replace(regex, "<mark>$1</mark>");
      articleText = articleText.replace(regex, "<mark>$1</mark>");
      obsText = obsText.replace(regex, "<mark>$1</mark>");
    }

    const citation = `[${item.article} - ${item.infraction}] Pena: ${item.services} serviços | Multa: ${item.fine} | Obs: ${item.obs}`;

    return `
      <tr>
        <td><span class="article-badge">${articleText}</span></td>
        <td><strong style="color: #fff;">${infractionText}</strong></td>
        <td><span class="category-tag ${catClass}">${escapeHtml(item.category)}</span></td>
        <td>
          <span class="penalty-tag ${item.services === "0" ? "zero" : ""}">
            ${item.services === "0" ? "0 serviços" : `${escapeHtml(item.services)} meses / serviços`}
          </span>
        </td>
        <td><span class="fine-tag">${escapeHtml(item.fine)}</span></td>
        <td><div class="penal-obs-text">${obsText}</div></td>
        <td style="text-align: center;">
          <button class="rule-copy-btn" data-rule-text="${escapeHtml(citation)}" title="Copiar citação para BO policial" aria-label="Copiar artigo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="penal-header-bar">
      <div>
        <h3 class="penal-header-title">${escapeHtml(data.title)}</h3>
        <p class="muted-text" style="font-size: 0.9rem; margin-top: 4px;">
          Tabela unificada de dosimetria penal, infrações de trânsito e Lei de Armas e Drogas do Distrito Paulista.
        </p>
      </div>
      <button class="btn btn-glass btn-sm" id="btnCopyCategory">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copiar Código Completo</span>
      </button>
    </div>

    <div class="penal-filter-chips">
      ${chipsHtml}
    </div>

    ${filtered.length === 0 ? `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
        <h3 style="color: #fff;">Nenhum artigo penal encontrado</h3>
        <p style="margin-top: 6px;">Tente pesquisar por número do artigo ou termo (ex: 121, Homicídio, Roubo, Fuga, Blitz, Porte).</p>
      </div>
    ` : `
      <div class="penal-table-container">
        <table class="penal-table">
          <thead>
            <tr>
              <th>Artigo</th>
              <th>Infração</th>
              <th>Categoria</th>
              <th>Serviços / Pena</th>
              <th>Multa</th>
              <th>Observações</th>
              <th style="text-align: center;">Copiar</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    `}
  `;

  $("#btnCopyCategory")?.addEventListener("click", () => {
    copyToClipboard(data.content, "Código Penal completo copiado para a área de transferência!");
  });
}

/* ==========================================================================
   MÓDULO DE RECRUTAMENTO DA STAFF (recrutamento.html)
   ========================================================================== */
function setupRecruitmentEvents() {
  const form = $("#staffForm");
  if (!form) return;

  renderRecruitmentStatus();
  applyCustomQuestionsToForm();
  form.addEventListener("submit", submitApplication);

  // Ouvir alterações de status ou perguntas entre abas do navegador
  window.addEventListener("storage", (e) => {
    if (e.key === "dp_recruitment_open") {
      renderRecruitmentStatus();
    }
    if (e.key === "dp_recruitment_questions") {
      applyCustomQuestionsToForm();
    }
  });
}

function applyCustomQuestionsToForm() {
  const customQuestions = localStorage.getItem("dp_recruitment_questions");
  if (!customQuestions) return;
  try {
    const questions = JSON.parse(customQuestions);
    questions.forEach(q => {
      const label = $(`label[for="${q.id}"]`);
      if (label) {
        label.innerHTML = `${escapeHtml(q.label)}${q.required ? " *" : ""}`;
      }
      const input = $(`#${q.id}`);
      if (input && q.placeholder) {
        input.setAttribute("placeholder", q.placeholder);
      }
    });
  } catch (e) {
    console.warn("Erro ao aplicar perguntas customizadas:", e);
  }
}

function renderRecruitmentStatus() {
  const isOpen = localStorage.getItem("dp_recruitment_open") !== "false";
  const badge = $("#recruitmentStatusBadge");
  const text = $("#recruitmentStatusText");
  const formContainer = $("#staffFormContainer");
  const closedBox = $("#recruitmentClosedBox");

  if (!badge) return;

  if (isOpen) {
    badge.className = "recruitment-status-pill open";
    if (text) text.textContent = "Inscrições Abertas";
    if (formContainer) formContainer.classList.remove("hidden");
    if (closedBox) closedBox.classList.add("hidden");
  } else {
    badge.className = "recruitment-status-pill closed";
    if (text) text.textContent = "Inscrições Fechadas";
    if (formContainer) formContainer.classList.add("hidden");
    if (closedBox) closedBox.classList.remove("hidden");
  }
}

function validateStaffForm(form) {
  let valid = true;
  const values = Object.fromEntries(new FormData(form).entries());

  // Limpar mensagens de erro anteriores
  $$(".field-error", form).forEach(el => el.textContent = "");

  const checks = {
    appFullName: values.appFullName?.trim().length >= 3 ? "" : "Informe seu nome e sobrenome completo.",
    appAge: Number(values.appAge) >= 13 && Number(values.appAge) <= 99 ? "" : "Informe uma idade válida (entre 13 e 99 anos).",
    appCharName: values.appCharName?.trim().length >= 3 ? "" : "Informe o nome do seu personagem no jogo.",
    appCharId: Number(values.appCharId) > 0 ? "" : "Informe o ID numérico do personagem.",
    appDiscordTag: values.appDiscordTag?.trim().length >= 2 ? "" : "Informe sua tag do Discord (ex: #joao123 ou joao123).",
    appTimeFiveM: values.appTimeFiveM?.trim().length >= 2 ? "" : "Informe há quanto tempo joga FiveM.",
    appTimeTotalRP: values.appTimeTotalRP?.trim().length >= 2 ? "" : "Informe há quanto tempo faz Roleplay.",
    appCurrentCities: values.appCurrentCities?.trim().length >= 2 ? "" : "Informe em quantas cidades faz RP atualmente.",
    appRpKnowledge: values.appRpKnowledge ? "" : "Selecione seu nível de conhecimento em RP.",
    appStaffExp: values.appStaffExp?.trim().length >= 5 ? "" : "Descreva sua experiência prévia na Staff (ou digite 'Nenhuma').",
    appWhyJoin: values.appWhyJoin?.trim().length >= 10 ? "" : "Explique por que quer entrar na Staff do Distrito Paulista.",
    appWhatCanAdd: values.appWhatCanAdd?.trim().length >= 10 ? "" : "Explique o que você pode agregar à equipe.",
    appDailyHours: values.appDailyHours?.trim().length >= 2 ? "" : "Informe quantas horas por dia está disponível.",
    appSchedule: values.appSchedule?.trim().length >= 4 ? "" : "Informe os dias e horários de maior disponibilidade.",
    appScenarioFriend: values.appScenarioFriend?.trim().length >= 10 ? "" : "Responda como agiria caso um amigo quebrasse regras.",
    appScenarioAngry: values.appScenarioAngry?.trim().length >= 10 ? "" : "Responda como lidaria com um jogador nervoso.",
    appScenarioUnknown: values.appScenarioUnknown?.trim().length >= 10 ? "" : "Responda o que faria se não soubesse resolver a dúvida.",
    appFriendshipVsAdmin: values.appFriendshipVsAdmin?.trim().length >= 10 ? "" : "Explique a importância de separar amizade da administração.",
    appMainFunction: values.appMainFunction?.trim().length >= 10 ? "" : "Informe qual é a principal função de um membro da Staff.",
    appTeamwork: values.appTeamwork?.trim().length >= 5 ? "" : "Responda sobre sua facilidade para trabalhar em equipe.",
    appPunishments: values.appPunishments?.trim().length >= 3 ? "" : "Informe sobre punições recebidas (ou digite 'Nunca fui punido').",
    appMicReady: values.appMicReady ? "" : "Selecione se possui microfone bom e disponibilidade.",
    appWillingLearn: values.appWillingLearn ? "" : "Selecione se está disposto a aprender os procedimentos.",
    appWhyChooseYou: values.appWhyChooseYou?.trim().length >= 10 ? "" : "Explique por que deveríamos escolher você.",
    appTruthDeclaration: values.appTruthDeclaration ? "" : "Marque a declaração de veracidade das informações."
  };

  Object.entries(checks).forEach(([field, message]) => {
    const errorEl = $(`[data-error-for="${field}"]`, form);
    if (errorEl) errorEl.textContent = message;
    if (message) valid = false;
  });

  if (values.appTruthDeclaration === "Não") {
    const errorEl = $(`[data-error-for="appTruthDeclaration"]`, form);
    if (errorEl) errorEl.textContent = "Você deve declarar que as informações são verdadeiras para enviar a inscrição.";
    valid = false;
  }

  return { valid, values };
}

async function submitApplication(event) {
  event.preventDefault();

  const isOpen = localStorage.getItem("dp_recruitment_open") !== "false";
  if (!isOpen) {
    toast("O recrutamento está fechado no momento.");
    renderRecruitmentStatus();
    return;
  }

  const form = event.currentTarget;
  const statusEl = $("#formStatus");
  if (statusEl) {
    statusEl.className = "form-status";
    statusEl.textContent = "";
  }

  const { valid, values } = validateStaffForm(form);
  if (!valid) {
    if (statusEl) {
      statusEl.className = "form-status error";
      statusEl.textContent = "Por favor, preencha todos os campos obrigatórios corretamente.";
    }
    toast("Preencha todas as perguntas obrigatórias marcadas com *.");
    return;
  }

  const submitBtn = $("#submitAppBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<span>Enviando dados com segurança...</span>";
  }

  const allAnswers = {
    "Nome Completo": values.appFullName.trim(),
    "Idade": values.appAge,
    "Personagem In-game": values.appCharName.trim(),
    "ID do Personagem": values.appCharId,
    "Discord Tag": values.appDiscordTag.trim(),
    "Tempo no FiveM": values.appTimeFiveM.trim(),
    "Tempo Total no RP": values.appTimeTotalRP.trim(),
    "Cidades Atuais": values.appCurrentCities.trim(),
    "Conhecimento de RP": values.appRpKnowledge,
    "Experiência Anterior Staff": values.appStaffExp.trim(),
    "Motivação para entrar": values.appWhyJoin.trim(),
    "O que pode agregar": values.appWhatCanAdd.trim(),
    "Horas Diárias": values.appDailyHours.trim(),
    "Dias e Horários": values.appSchedule.trim(),
    "Cenário: Amigo quebrando regras": values.appScenarioFriend.trim(),
    "Cenário: Jogador nervoso/desrespeitoso": values.appScenarioAngry.trim(),
    "Cenário: Situação desconhecida": values.appScenarioUnknown.trim(),
    "Amizade vs Decisões Administrativas": values.appFriendshipVsAdmin.trim(),
    "Principal Função da Staff": values.appMainFunction.trim(),
    "Trabalho em Equipe": values.appTeamwork.trim(),
    "Punições Anteriores": values.appPunishments.trim(),
    "Microfone e Reuniões": values.appMicReady,
    "Disposição para Aprender": values.appWillingLearn,
    "Por que escolher você": values.appWhyChooseYou.trim(),
    "Informações Adicionais": values.appAdditionalInfo?.trim() || "Nenhuma",
    "Declaração de Veracidade": values.appTruthDeclaration
  };

  const payload = {
    id: "app-" + Date.now(),
    game_name: `${values.appCharName.trim()} | ID: ${values.appCharId}`,
    discord_tag: values.appDiscordTag.trim(),
    age: Number(values.appAge),
    desired_role: "suporte",
    availability: `${values.appDailyHours.trim()} (${values.appSchedule.trim()})`,
    experience: `FiveM: ${values.appTimeFiveM.trim()} | RP: ${values.appTimeTotalRP.trim()} | Nível: ${values.appRpKnowledge}`,
    scenario1: values.appScenarioAngry.trim(),
    scenario2: values.appScenarioFriend.trim(),
    motivation: values.appWhyJoin.trim(),
    answers: allAnswers,
    status: "pending",
    created_at: new Date().toISOString(),
    reviewer: null,
    reviewed_at: null
  };

  // Se Supabase estiver conectado, salvar no banco PostgreSQL
  if (supabase) {
    try {
      const { error } = await supabase.from("applications").insert({
        game_name: payload.game_name.slice(0, 80),
        discord_tag: payload.discord_tag.slice(0, 60),
        age: payload.age,
        desired_role: payload.desired_role,
        availability: payload.availability.slice(0, 195),
        experience: payload.experience.slice(0, 1950),
        scenario1: payload.scenario1.slice(0, 1950),
        scenario2: payload.scenario2.slice(0, 1950),
        motivation: payload.motivation.slice(0, 1950),
        answers: allAnswers,
        status: "pending"
      });

      if (error) console.warn("Supabase insert:", error);
    } catch (e) {
      console.warn("Supabase insert exception:", e);
    }
  }

  // Persistir no histórico local
  state.applications.unshift(payload);
  localStorage.setItem("dp_applications", JSON.stringify(state.applications));

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Enviar Minha Candidatura Oficial</span> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
  }

  if (statusEl) {
    statusEl.className = "form-status success";
    statusEl.textContent = "🎉 Candidatura enviada com sucesso! A Diretoria avaliará todas as suas respostas.";
  }

  toast("Candidatura enviada com sucesso! Boa sorte no processo seletivo!");
  form.reset();
}

/* ==========================================================================
   MÓDULO DE CONSULTA DE CANDIDATURA (consultar-inscricao.html)
   ========================================================================== */
function setupStatusLookupEvents() {
  const form = $("#checkStatusForm");
  if (!form) return;

  form.addEventListener("submit", handleStatusLookup);
}

async function handleStatusLookup(event) {
  event.preventDefault();
  const inputEl = $("#lookupQuery");
  const query = (inputEl?.value || "").trim().toLowerCase();
  const resultContainer = $("#lookupResult");
  const submitBtn = $("#lookupSubmitBtn");

  if (!query) {
    toast("Digite seu Discord ou ID para consultar.");
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  resultContainer.classList.remove("hidden");
  resultContainer.innerHTML = `
    <div style="text-align: center; padding: 24px; color: var(--gold-vivid);">
      <span class="status-indicator online pulse"></span>
      <p style="margin-top: 8px;">Consultando com segurança nos registros oficiais...</p>
    </div>
  `;

  let match = null;

  // 1. Tentar buscar no Supabase via RPC segura check_application_status
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc("check_application_status", { p_query: query });
      if (!error && data && data.length > 0) {
        match = data[0];
      }
    } catch (e) {
      console.warn("Supabase status RPC:", e);
    }
  }

  if (submitBtn) submitBtn.disabled = false;

  if (!match) {
    resultContainer.innerHTML = `
      <div class="lookup-result-card" style="text-align: center; color: var(--text-muted);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
        <h4 style="color: #fff; margin-bottom: 6px;">Nenhuma Candidatura Encontrada</h4>
        <p>Não localizamos nenhuma inscrição com o termo <b>"${escapeHtml(query)}"</b>.</p>
        <small style="display: block; margin-top: 8px; color: var(--text-subtle);">
          Certifique-se de digitar a tag exata cadastrada (ex: <code>#joao123</code> ou <code>joao123</code>) ou nome do seu personagem.
        </small>
        <div style="margin-top: 16px;">
          <a href="recrutamento.html" class="btn btn-gold btn-sm">Preencher Inscrição Agora</a>
        </div>
      </div>
    `;
    return;
  }

  const statusConfig = {
    pending: { label: "Pendente — Aguardando Avaliação", class: "pending", desc: "Sua ficha foi recebida com sucesso e está na fila para triagem pela comissão avaliadora da Staff." },
    reviewing: { label: "Em Análise pela Diretoria", class: "reviewing", desc: "Sua ficha foi selecionada na primeira fase e está sob análise detalhada de conduta e histórico." },
    approved: { label: "Aprovado para Entrevista!", class: "approved", desc: "Parabéns! Sua candidatura foi homologada. Acesse nosso Discord oficial e fique atento ao canal de chamadas da Staff para o agendamento da entrevista vocal." },
    rejected: { label: "Inscrição Não Aceita", class: "rejected", desc: "Agradecemos o seu interesse. Nesta rodada sua candidatura não atingiu os critérios mínimos exigidos para o cargo. Você poderá enviar uma nova inscrição no próximo processo seletivo." }
  };

  const currentCfg = statusConfig[match.status] || statusConfig.pending;

  resultContainer.innerHTML = `
    <div class="lookup-result-card">
      <div class="lookup-result-header">
        <div>
          <h4 class="lookup-result-title">${escapeHtml(match.game_name)}</h4>
          <span style="color: var(--gold-vivid); font-family: var(--font-mono); font-size: 0.88rem;">
            Discord: <b>${escapeHtml(match.discord_tag)}</b>
          </span>
        </div>
        <span class="badge ${currentCfg.class}">${currentCfg.label}</span>
      </div>

      <p class="lookup-result-desc">${currentCfg.desc}</p>

      ${match.reviewer_notes ? `
        <div style="background: rgba(255, 184, 0, 0.08); border-left: 3px solid var(--gold); padding: 10px 14px; margin-bottom: 14px; border-radius: 4px; font-size: 0.88rem; color: #f1f5f9;">
          <strong>Nota da Comissão:</strong> ${escapeHtml(match.reviewer_notes)}
        </div>
      ` : ""}

      <div class="lookup-meta-grid">
        <span>📅 Enviado em: ${formatDate(match.created_at)}</span>
        ${match.reviewed_at ? `<span>⏱️ Avaliado em: ${formatDate(match.reviewed_at)}</span>` : ""}
        ${match.reviewer ? `<span>👤 Avaliador: ${escapeHtml(match.reviewer)}</span>` : ""}
      </div>
    </div>
  `;
}

/* ==========================================================================
   MÓDULO DE LOGIN DA STAFF (login-staff.html)
   ========================================================================== */
function setupLoginEvents() {
  const loginForm = $("#loginForm");
  const authArea = $("#authArea");
  const connectedArea = $("#connectedArea");

  if (!loginForm && !connectedArea) return;

  // Alternar visualização da senha
  $("#togglePasswordBtn")?.addEventListener("click", () => {
    const input = $("#password");
    if (input) input.type = input.type === "password" ? "text" : "password";
  });

  // Submissão do formulário
  loginForm?.addEventListener("submit", handleLogin);

  // Botão de desconectar na caixa conectada
  $("#connectedLogoutBtn")?.addEventListener("click", handleLogout);

  // Verificar se já está autenticado
  renderLoginPageState();
}

function renderLoginPageState() {
  const authArea = $("#authArea");
  const connectedArea = $("#connectedArea");
  const user = state.currentUser;

  if (user && user.role && user.role !== "guest" && user.role !== "player") {
    if (authArea) authArea.classList.add("hidden");
    if (connectedArea) {
      connectedArea.classList.remove("hidden");
      $("#connectedUserName").textContent = user.name;
      $("#connectedUserRole").textContent = (ROLE_DISPLAY_NAMES[user.role] || user.role).toUpperCase();
      $("#connectedAvatar").textContent = ROLE_EMOJIS[user.role] || "👑";
    }
  } else {
    if (authArea) authArea.classList.remove("hidden");
    if (connectedArea) connectedArea.classList.add("hidden");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const status = $("#loginStatus");
  if (status) {
    status.textContent = "";
    status.className = "form-status";
  }

  const email = ($("#email")?.value || "").trim().toLowerCase();
  const password = $("#password")?.value || "";

  if (!email || !password) {
    if (status) {
      status.className = "form-status error";
      status.textContent = "Preencha e-mail e senha corporativa.";
    }
    return;
  }

  const submitBtn = $("#loginSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "<span>Autenticando com segurança...</span>";
  }

  // 1. Autenticação Oficial Supabase Auth
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (status) {
          status.className = "form-status error";
          status.textContent = error.message.includes("Invalid login credentials")
            ? "E-mail ou senha incorretos no Supabase."
            : `Erro de autenticação: ${error.message}`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = "<span>Entrar no Painel</span>";
        }
        return;
      }

      if (data?.user) {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (profile && profile.role !== "player" && profile.role !== "guest" && profile.status === "active") {
          setAuthenticatedUser({
            id: data.user.id,
            name: profile.display_name || data.user.email,
            email: data.user.email,
            role: profile.role
          }, true);
          return;
        } else {
          await supabase.auth.signOut();
          if (status) {
            status.className = "form-status error";
            status.textContent = "Acesso negado: Esta conta não possui perfil de Staff configurado na tabela profiles.";
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "<span>Entrar no Painel</span>";
          }
          return;
        }
      }
    } catch (e) {
      console.warn("Supabase Auth signIn:", e);
      if (status) {
        status.className = "form-status error";
        status.textContent = "Erro de conexão ao servidor de autenticação Supabase.";
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<span>Entrar no Painel</span>";
      }
      return;
    }
  }

  // 2. Autenticação Segura de Contas da Staff Locais / Cadastradas
  let storedTeam = [];
  try {
    storedTeam = JSON.parse(localStorage.getItem("dp_team_members") || "[]");
  } catch {}
  if (!storedTeam || !storedTeam.length) {
    storedTeam = structuredClone(INITIAL_DEMO_USERS);
  }

  // Suporte aos e-mails do CEO Master (incluindo o e-mail oficial dpaulistarp@gmail.com)
  const isMasterCeo = email === "dpaulistarp@gmail.com" || email === "ceo@distritopaulista.com";
  let matchedMember = storedTeam.find(u => u.email.toLowerCase() === email);

  if (isMasterCeo && !matchedMember) {
    matchedMember = {
      id: "user-ceo-01",
      name: "Blaze / Lomba / Morgan",
      email: email,
      role: "ceo",
      status: "active"
    };
    storedTeam.unshift(matchedMember);
    localStorage.setItem("dp_team_members", JSON.stringify(storedTeam));
  }

  if (matchedMember) {
    if (matchedMember.status !== "active") {
      if (status) {
        status.className = "form-status error";
        status.textContent = "Acesso negado: Esta conta de Staff está suspensa ou bloqueada.";
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<span>Entrar no Painel</span>";
      }
      return;
    }

    const pwdKey = `dp_pwd_${email}`;
    const savedPassword = localStorage.getItem(pwdKey) || matchedMember.password;
    if (savedPassword) {
      if (savedPassword !== password) {
        if (status) {
          status.className = "form-status error";
          status.textContent = "Senha incorreta. Verifique suas credenciais de Staff.";
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = "<span>Entrar no Painel</span>";
        }
        return;
      }
    } else {
      // Primeira definição de senha corporativa desta conta
      localStorage.setItem(pwdKey, password);
    }

    setAuthenticatedUser(matchedMember, true);
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = "<span>Entrar no Painel</span>";
  }

  if (status) {
    status.className = "form-status error";
    status.textContent = "Acesso negado: Credenciais inválidas ou e-mail não cadastrado na Staff.";
  }
}

function setAuthenticatedUser(user, redirect = false) {
  state.currentUser = user;
  state.currentRole = user.role || "suporte";
  localStorage.setItem("dp_auth_user", JSON.stringify(user));

  renderNavAuth(user);
  renderLoginPageState();

  if (redirect) {
    toast(`Conectado como ${ROLE_DISPLAY_NAMES[user.role] || user.role}! Redirecionando...`);
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 450);
  }
}

async function handleLogout() {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
  }

  localStorage.removeItem("dp_auth_user");
  state.currentUser = null;
  state.currentRole = "guest";

  renderNavAuth(null);
  renderLoginPageState();

  toast("Sessão finalizada com sucesso.");
}

function checkInitialAuth() {
  const localAuth = localStorage.getItem("dp_auth_user");
  if (localAuth) {
    try {
      const user = JSON.parse(localAuth);
      if (user && user.role && user.role !== "guest" && user.role !== "player") {
        if (user.role === "ceo" && (user.name?.includes("Arthur Pendelton") || user.name === "Arthur Pendelton | ID: 01")) {
          user.name = "Blaze / Lomba / Morgan";
          localStorage.setItem("dp_auth_user", JSON.stringify(user));
        }
        state.currentUser = user;
        state.currentRole = user.role;
        renderNavAuth(user);
        renderLoginPageState();
        return true;
      }
    } catch (e) {
      localStorage.removeItem("dp_auth_user");
    }
  }

  renderNavAuth(null);
  renderLoginPageState();
  return false;
}

/* ==========================================================================
   SINCRONIZAÇÃO GERAL COM SUPABASE CLOUD
   ========================================================================== */
function loadStateFromStorage() {
  try {
    const savedRules = localStorage.getItem("dp_rules");
    if (savedRules) {
      const parsed = JSON.parse(savedRules);
      if (parsed && typeof parsed === "object") {
        Object.assign(state.rules, parsed);
      }
    }
  } catch (e) {
    console.warn("Storage load:", e);
  }
}

async function syncWithSupabase() {
  if (!supabase) return;

  try {
    // 1. Carregar regras publicadas do banco
    const { data: rulesData, error: rulesErr } = await supabase.from("rules").select("*");
    if (!rulesErr && rulesData && rulesData.length > 0) {
      rulesData.forEach(row => {
        if (row.category && row.title && row.content) {
          state.rules[row.category] = { title: row.title, content: row.content };
        }
      });
      if ($("#rulesContent")) renderRules(state.currentRuleTab);
      updateRuleCounts();
      renderDynamicSections();
    }

    // 2. Checar sessão autenticada real
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profile && profile.role !== "player" && profile.role !== "guest" && profile.status === "active") {
        setAuthenticatedUser({
          id: session.user.id,
          name: profile.display_name || session.user.email,
          email: session.user.email,
          role: profile.role
        }, false);
      }
    }
  } catch (err) {
    console.warn("Sincronização Supabase:", err);
  }
}

/* ==========================================================================
   RENDERIZAÇÃO DINÂMICA DE SEÇÕES PUBLICADAS (INDEX.HTML & HOME)
   ========================================================================== */
function renderDynamicHistory() {
  const container = $("#historyTextCol");
  if (!container) return;

  const historia = state.rules.historia;
  if (historia && historia.content) {
    const paragraphs = historia.content
      .split("\n")
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (paragraphs.length > 0) {
      container.innerHTML = paragraphs
        .map(p => `<p>${escapeHtml(p)}</p>`)
        .join("");
    }
  }
}

function renderDynamicFactions() {
  const data = state.rules.estrutura_cidade;
  if (!data || !data.content) return;

  const lines = data.content.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;

  const descEl = $("#factionsSectionDesc");
  const introLines = [];

  lines.forEach(line => {
    const lower = line.toLowerCase();
    if (lower.startsWith("pmesp") || lower.includes("polícia militar") || lower.includes("policia militar")) {
      const desc = line.replace(/^pmesp(\s*\(.*?\))?:\s*/i, "").trim();
      const el = $("#descFactionPmesp");
      if (el && desc) el.textContent = desc;
    } else if (lower.startsWith("polícia civil") || lower.startsWith("policia civil") || lower.startsWith("pcesp")) {
      const desc = line.replace(/^(polícia civil|policia civil|pcesp)(\s*\(.*?\))?:\s*/i, "").trim();
      const el = $("#descFactionCivil");
      if (el && desc) el.textContent = desc;
    } else if (lower.startsWith("prf") || lower.includes("polícia rodoviária") || lower.includes("policia rodoviaria")) {
      const desc = line.replace(/^prf(\s*\(.*?\))?:\s*/i, "").trim();
      const el = $("#descFactionPrf");
      if (el && desc) el.textContent = desc;
    } else if (lower.startsWith("o ilegal") || lower.startsWith("ilegal") || lower.startsWith("facções") || lower.startsWith("faccoes")) {
      const desc = line.replace(/^(o ilegal & facções|o ilegal|ilegal & facções|ilegal|facções|faccoes)(\s*\(.*?\))?:\s*/i, "").trim();
      const el = $("#descFactionIlegal");
      if (el && desc) el.textContent = desc;
    } else if (lower.startsWith("hospital") || lower.startsWith("samu")) {
      const desc = line.replace(/^(hospital & samu 192|hospital & samu|hospital|samu 192|samu)(\s*\(.*?\))?:\s*/i, "").trim();
      const el = $("#descFactionSamu");
      if (el && desc) el.textContent = desc;
    } else if (lower.startsWith("mecânicas") || lower.startsWith("mecanicas") || lower.startsWith("oficinas")) {
      const desc = line.replace(/^(mecânicas & cultura de rua|mecanicas & cultura de rua|mecânicas & rua|mecanicas & rua|mecânicas|mecanicas|oficinas)(\s*\(.*?\))?:\s*/i, "").trim();
      const el = $("#descFactionMecanica");
      if (el && desc) el.textContent = desc;
    } else if (!lower.startsWith("estrutura das")) {
      introLines.push(line);
    }
  });

  if (descEl && introLines.length > 0) {
    descEl.textContent = introLines.join(" ");
  }
}

function renderDynamicCinematic() {
  const data = state.rules.sp_noite;
  if (!data || !data.content) return;

  const lines = data.content.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;

  const tagEl = $("#cinematicTag");
  const titleEl = $("#cinematicTitle");
  const paragraphsEl = $("#cinematicParagraphs");
  const sectionTextEl = $("#cinematicSectionText");

  if (tagEl && data.title) {
    tagEl.textContent = data.title.split("—")[0].trim().toUpperCase() || "SÃO PAULO À NOITE";
  }

  let startIndex = 0;
  if (lines[0] && lines[0].length < 60 && titleEl) {
    titleEl.textContent = lines[0];
    startIndex = 1;
  }

  const pLines = lines.slice(startIndex);
  if (pLines.length > 0) {
    if (paragraphsEl) {
      paragraphsEl.innerHTML = pLines.map(p => `<p>${escapeHtml(p)}</p>`).join("");
    } else if (sectionTextEl) {
      sectionTextEl.textContent = pLines.join(" ");
    }
  }
}

function renderDynamicKeybinds() {
  const data = state.rules.guia_sobrevivencia;
  const grid = $("#keybindsGrid");
  if (!data || !data.content || !grid) return;

  const lines = data.content.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;

  const titleEl = $("#commandsTitle");
  if (titleEl && data.title) {
    const parts = data.title.split("—");
    if (parts.length > 1) {
      titleEl.textContent = parts[1].trim().toUpperCase();
    }
  }

  const cardsHtml = lines.map(line => {
    // Formato: Tecla | Título | Descrição
    if (line.includes("|")) {
      const parts = line.split("|").map(p => p.trim());
      const keycap = parts[0] || "•";
      const title = parts[1] || "";
      const desc = parts.slice(2).join(" | ") || "";
      return `
        <div class="keybind-card">
          <div class="keycap">${escapeHtml(keycap)}</div>
          <div>
            <strong>${escapeHtml(title)}</strong>
            ${desc ? `<p>${escapeHtml(desc)}</p>` : ""}
          </div>
        </div>
      `;
    }
    // Formato com traço: Tecla - Descrição
    if (line.includes(" - ")) {
      const [keycap, ...rest] = line.split(" - ").map(p => p.trim());
      return `
        <div class="keybind-card">
          <div class="keycap">${escapeHtml(keycap)}</div>
          <div>
            <strong>${escapeHtml(rest.join(" - "))}</strong>
          </div>
        </div>
      `;
    }
    return `
      <div class="keybind-card">
        <div class="keycap">⌨️</div>
        <div>
          <strong>${escapeHtml(line)}</strong>
        </div>
      </div>
    `;
  }).join("");

  if (cardsHtml) {
    grid.innerHTML = cardsHtml;
  }
}

function renderDynamicSections() {
  renderDynamicHistory();
  renderDynamicFactions();
  renderDynamicCinematic();
  renderDynamicKeybinds();
}

/* ==========================================================================
   INICIALIZAÇÃO DO SISTEMA
   ========================================================================== */
async function init() {
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const modeText = $("#modeText");
  if (modeText) {
    modeText.textContent = "Servidor Oficial • FiveM Brasil";
  }

  loadStateFromStorage();
  checkInitialAuth();
  setupNavigation();
  setupFactionTabs();
  renderDynamicSections();

  // Ouvir alterações de regras e publicações entre abas
  window.addEventListener("storage", (e) => {
    if (e.key === "dp_rules") {
      loadStateFromStorage();
      renderDynamicSections();
      if ($("#rulesContent")) renderRules(state.currentRuleTab);
      updateRuleCounts();
    }
  });

  // Inicializar módulos de acordo com os elementos existentes na página
  setupRulesEvents();
  setupRecruitmentEvents();
  setupStatusLookupEvents();
  setupLoginEvents();

  await syncWithSupabase();
}

// Iniciar após DOM pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

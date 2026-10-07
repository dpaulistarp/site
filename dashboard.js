import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  DEFAULT_RULES,
  INITIAL_DEMO_USERS,
  INITIAL_DEMO_APPLICATIONS,
  INITIAL_DEMO_LOGS,
  DEFAULT_PERMISSIONS,
  ROLE_DISPLAY_NAMES,
  ROLE_EMOJIS
} from "./data.js";

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

const state = {
  user: null,
  role: "guest",
  content: structuredClone(DEFAULT_RULES),
  permissions: structuredClone(DEFAULT_PERMISSIONS),
  applications: [],
  team: [],
  auditLogs: [],
  currentCategory: "gerais"
};

const $ = (s, scope = document) => scope.querySelector(s);
const $$ = (s, scope = document) => [...scope.querySelectorAll(s)];

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

const toast = (message) => {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el.dataset.timeoutId);
  el.dataset.timeoutId = setTimeout(() => el.classList.remove("show"), 3200);
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return iso;
  }
};

const ROLE_DISPLAY_NAMES = {
  ceo: "CEO (Master)",
  diretor: "Diretor Geral",
  gerente: "Gerente Operacional",
  administrador: "Administrador",
  moderador: "Moderador",
  suporte: "Suporte",
  player: "Cidadão"
};

const ROLE_EMOJIS = {
  ceo: "👑", diretor: "⚜️", gerente: "💼", administrador: "⚖️", moderador: "🛡️", suporte: "🎧"
};

function hasPermission(key) {
  if (!state.user) return false;
  if (state.role === "ceo") return true;
  return Boolean(state.permissions[key]?.[state.role]);
}

function recordAuditLog(action, details) {
  const logItem = {
    id: "log-" + Date.now(),
    action,
    user: state.user ? `${state.user.name} (${ROLE_DISPLAY_NAMES[state.role] || state.role})` : "Sistema",
    details,
    timestamp: new Date().toISOString()
  };
  state.auditLogs.unshift(logItem);
  localStorage.setItem("dp_audit_logs", JSON.stringify(state.auditLogs));
  renderAuditLogs();
}

/* ==========================================================================
   AUTENTICAÇÃO & SESSÃO RESILIENTE
   ========================================================================== */
function getLocalAuthUser() {
  try {
    const raw = localStorage.getItem("dp_auth_user");
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (user && user.role && user.role !== "guest" && user.role !== "player") {
      if (user.role === "ceo" && (user.name?.includes("Arthur Pendelton") || user.name === "Arthur Pendelton | ID: 01")) {
        user.name = "Blaze / Lomba / Morgan";
        localStorage.setItem("dp_auth_user", JSON.stringify(user));
      }
      return user;
    }
  } catch (e) {
    console.warn("Erro ao ler dp_auth_user:", e);
  }
  return null;
}

async function checkAuthSession() {
  // 1. Hidratação Instantânea: se já há usuário Staff no localStorage, ativa na hora
  const localUser = getLocalAuthUser();
  if (localUser) {
    setUserData(localUser);
  }

  // 2. Se Supabase estiver conectado, sincroniza em segundo plano com timeout de segurança
  if (supabase) {
    try {
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase auth timeout")), 2500)
      );
      const { data } = await Promise.race([sessionPromise, timeoutPromise]);

      if (data?.session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", data.session.user.id)
          .maybeSingle();

        if (profile && profile.role !== "player" && profile.role !== "guest" && profile.status === "active") {
          const syncedUser = {
            id: data.session.user.id,
            name: profile.display_name || data.session.user.email,
            email: data.session.user.email,
            role: profile.role
          };
          setUserData(syncedUser);
          return;
        }
      }
    } catch (e) {
      console.warn("Sincronização com Supabase Cloud Auth:", e?.message || e);
    }
  }

  // 3. Se temos usuário autenticado localmente (Modo Demo / Staff Local), mantém ativo com segurança
  if (localUser) {
    return;
  }

  // 4. Se não há nenhuma credencial ativa, redireciona ao login
  localStorage.removeItem("dp_auth_user");
  window.location.replace("login-staff.html");
}

function setUserData(user) {
  state.user = user;
  state.role = user.role || "suporte";
  localStorage.setItem("dp_auth_user", JSON.stringify(user));

  const userNameEl = $("#dashUserName");
  if (userNameEl) userNameEl.textContent = user.name;

  const userAvatarEl = $("#dashUserAvatar");
  if (userAvatarEl) userAvatarEl.textContent = ROLE_EMOJIS[user.role] || "🛡️";

  const badge = $("#dashUserRoleBadge");
  if (badge) {
    badge.className = `user-role-badge ${user.role}-badge`;
    badge.textContent = (ROLE_DISPLAY_NAMES[user.role] || user.role).toUpperCase();
  }

  updateSidebarVisibility();
  renderUserRightsSummary();
  updateStats();
  renderApplications();
  renderTeamTable();
  renderPermissionsMatrix();
  renderAuditLogs();
  populateContentEditor();
}

function updateSidebarVisibility() {
  const canManage = hasPermission("can_manage_staff") || hasPermission("can_create_accounts");
  $("#sideLinkTeam").classList.toggle("hidden", !canManage);
  $("#sideLinkPermissions").classList.toggle("hidden", state.role !== "ceo");
  $("#sideLinkAudit").classList.toggle("hidden", !hasPermission("can_view_audit_logs"));
  $("#btnDashQuickCreate")?.classList.toggle("hidden", !hasPermission("can_create_accounts"));
}

function renderUserRightsSummary() {
  const container = $("#dashRightsSummary");
  if (!container) return;

  container.innerHTML = `
    <ul>
      ${Object.entries(state.permissions).map(([key, item]) => {
        const ok = hasPermission(key);
        return `
          <li>
            <span style="color: ${ok ? 'var(--success)' : 'var(--danger)'}; font-weight: 800;">${ok ? '✓' : '✕'}</span>
            <span>${escapeHtml(item.label)}</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

/* ==========================================================================
   EDITOR DE CONTEÚDO (REGRAS, CÓDIGO PENAL & HISTÓRIA DA CIDADE)
   ========================================================================== */
function populateContentEditor() {
  const select = $("#dashCategorySelect");
  if (!select) return;
  const key = select.value;
  state.currentCategory = key;
  const item = state.content[key] || DEFAULT_RULES[key] || { title: "", content: "" };

  $("#dashContentTitle").value = item.title || "";
  $("#dashContentBody").value = item.content || "";
  $("#dashSaveStatus").textContent = "";
}

async function savePublishedContent() {
  if (!hasPermission("can_edit_rules")) {
    toast("Você não possui permissão para editar conteúdo publicado.");
    return;
  }

  const key = $("#dashCategorySelect").value;
  const title = $("#dashContentTitle").value.trim();
  const content = $("#dashContentBody").value.trim();
  const statusEl = $("#dashSaveStatus");

  if (!title || !content) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Preencha o título e o corpo do texto.";
    return;
  }

  state.content[key] = { title, content };
  localStorage.setItem("dp_rules", JSON.stringify(state.content));

  // Se Supabase estiver conectado, atualiza no banco
  if (supabase) {
    try {
      await supabase.from("rules").upsert({
        category: key,
        title,
        content,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Supabase upsert:", e);
    }
  }

  statusEl.className = "form-status success";
  statusEl.textContent = "Publicado com sucesso no portal!";
  toast(`Conteúdo de '${title}' salvo e publicado com sucesso!`);
  const authorName = state.user?.name || "Administrador";
  recordAuditLog("Edição de Conteúdo", `Seção '${key.toUpperCase()}' atualizada por ${authorName}`);
}

/* ==========================================================================
   CANDIDATURAS (APPLICATIONS)
   ========================================================================== */
function updateStats() {
  const all = state.applications;
  const pending = all.filter(x => x.status === "pending" || x.status === "reviewing").length;
  const approved = all.filter(x => x.status === "approved").length;
  const rejected = all.filter(x => x.status === "rejected").length;

  $("#dashStatTotal").textContent = all.length;
  $("#dashStatPending").textContent = pending;
  $("#dashStatApproved").textContent = approved;
  $("#dashStatRejected").textContent = rejected;
  $("#dashPendingBadge").textContent = pending;
}

function renderApplications() {
  const filter = $("#dashAppFilter")?.value || "all";
  const search = ($("#dashAppSearch")?.value || "").toLowerCase().trim();
  const container = $("#dashApplicationsList");
  if (!container) return;

  let list = state.applications;
  if (filter !== "all") list = list.filter(a => a.status === filter);
  if (search) list = list.filter(a => a.game_name.toLowerCase().includes(search) || a.discord_tag.toLowerCase().includes(search));

  if (!list.length) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 40px;">Nenhuma candidatura encontrada.</p>`;
    return;
  }

  const canReview = hasPermission("can_review_applications");
  const canDelete = hasPermission("can_delete_applications");

  container.innerHTML = list.map(app => {
    const statusLabels = { pending: "Pendente", reviewing: "Em Análise", approved: "Aprovado", rejected: "Recusado" };
    return `
      <article class="application-card-item">
        <div class="app-card-top">
          <div class="app-player-info">
            <div class="player-avatar-badge">${ROLE_EMOJIS[app.desired_role] || "🎮"}</div>
            <div class="app-player-meta">
              <h4>${escapeHtml(app.game_name)}</h4>
              <span>Discord: <b>${escapeHtml(app.discord_tag)}</b> • Idade: <b>${app.age} anos</b></span>
            </div>
          </div>
          <div class="flex-align-center gap-12">
            <span class="role-pill ${escapeHtml(app.desired_role)}">Pretende: ${escapeHtml(app.desired_role.toUpperCase())}</span>
            <span class="badge ${escapeHtml(app.status)}">${statusLabels[app.status] || app.status}</span>
          </div>
        </div>

        <div class="app-snippet-grid">
          <div><span>Disponibilidade</span><p>${escapeHtml(app.availability)}</p></div>
          <div><span>Data de Envio</span><p>${formatDate(app.created_at)}</p></div>
          <div><span>Avaliador</span><p>${app.reviewer ? escapeHtml(app.reviewer) : "Aguardando comissão"}</p></div>
        </div>

        <div class="app-card-actions">
          <button class="btn btn-glass" onclick="openViewAppModal('${escapeHtml(app.id)}')">
            <span>👁️ Ver Respostas Completas</span>
          </button>
          ${canReview ? `
            <div class="flex-align-center gap-8">
              <button class="btn btn-success" onclick="updateAppStatus('${escapeHtml(app.id)}', 'approved')">Aprovar p/ Entrevista</button>
              <button class="btn btn-secondary" onclick="updateAppStatus('${escapeHtml(app.id)}', 'reviewing')">Em Análise</button>
              <button class="btn btn-danger" onclick="updateAppStatus('${escapeHtml(app.id)}', 'rejected')">Recusar</button>
              ${canDelete ? `<button class="btn btn-secondary-danger" onclick="deleteApplication('${escapeHtml(app.id)}')">🗑️</button>` : ""}
            </div>
          ` : `<small style="color: var(--text-subtle);">Apenas cargos autorizados podem avaliar.</small>`}
        </div>
      </article>
    `;
  }).join("");
}

function updateAppStatus(id, newStatus) {
  if (!hasPermission("can_review_applications")) {
    toast("Você não possui permissão para avaliar candidaturas.");
    return;
  }
  const app = state.applications.find(a => a.id === id);
  if (!app) return;

  app.status = newStatus;
  app.reviewer = `${state.user.name} (${ROLE_DISPLAY_NAMES[state.role]})`;
  app.review_date = new Date().toISOString();

  localStorage.setItem("dp_applications", JSON.stringify(state.applications));
  updateStats();
  renderApplications();

  const labels = { approved: "Aprovada", rejected: "Recusada", reviewing: "Em Análise", pending: "Pendente" };
  toast(`Candidatura marcada como ${labels[newStatus]}.`);
  recordAuditLog("Avaliação de Candidatura", `${app.game_name} definido como ${labels[newStatus]}`);

  const modal = $("#viewAppModal");
  if (!modal.classList.contains("hidden")) openViewAppModal(id);
}

function deleteApplication(id) {
  if (!hasPermission("can_delete_applications")) {
    toast("Sem permissão para excluir.");
    return;
  }
  if (!confirm("Deseja realmente apagar esta candidatura permanentemente?")) return;
  const app = state.applications.find(a => a.id === id);
  state.applications = state.applications.filter(a => a.id !== id);
  localStorage.setItem("dp_applications", JSON.stringify(state.applications));
  updateStats();
  renderApplications();
  toast("Candidatura removida.");
  recordAuditLog("Exclusão de Candidatura", `Candidatura de ${app?.game_name} removida`);
  closeViewAppModal();
}

function openViewAppModal(id) {
  const app = state.applications.find(a => a.id === id);
  if (!app) return;

  const modal = $("#viewAppModal");
  $("#viewAppTitle").textContent = `Ficha de ${app.game_name}`;
  const badge = $("#modalAppBadge");
  badge.className = `badge ${app.status}`;
  badge.textContent = app.status.toUpperCase();

  const contentEl = $("#viewAppContent");

  if (app.answers && typeof app.answers === "object" && Object.keys(app.answers).length > 0) {
    const entries = Object.entries(app.answers);
    contentEl.innerHTML = `
      <div style="background: rgba(10, 13, 20, 0.7); padding: 16px 20px; border-radius: var(--radius-sm); border: 1px solid var(--border-line); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px;">
        <div><span style="font-size: 0.72rem; color: var(--text-subtle); display: block; text-transform: uppercase;">Personagem</span><b style="color: var(--gold-vivid); font-size: 1.05rem;">${escapeHtml(app.game_name)}</b></div>
        <div><span style="font-size: 0.72rem; color: var(--text-subtle); display: block; text-transform: uppercase;">Discord</span><b style="color: var(--text-main);">${escapeHtml(app.discord_tag)}</b></div>
        <div><span style="font-size: 0.72rem; color: var(--text-subtle); display: block; text-transform: uppercase;">Idade Real</span><b style="color: var(--text-main);">${app.age} anos</b></div>
        <div><span style="font-size: 0.72rem; color: var(--text-subtle); display: block; text-transform: uppercase;">Data de Envio</span><b style="color: var(--text-main); font-size: 0.85rem;">${formatDate(app.created_at)}</b></div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${entries.map(([question, answer], idx) => `
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-line); border-radius: 8px; padding: 14px 16px;">
            <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px;">
              <span style="background: rgba(245, 158, 11, 0.15); color: var(--gold-vivid); font-weight: 800; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; white-space: nowrap;">
                Q${idx + 1}
              </span>
              <h5 style="color: var(--gold); font-size: 0.92rem; margin: 0; line-height: 1.4;">
                ${escapeHtml(question)}
              </h5>
            </div>
            <p style="margin: 0; color: var(--text-main); font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; padding-left: 32px;">
              ${escapeHtml(answer || "Não informado")}
            </p>
          </div>
        `).join("")}
      </div>
    `;
  } else {
    contentEl.innerHTML = `
      <div style="background: rgba(10, 13, 20, 0.6); padding: 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-line); display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
        <div><span style="font-size: 0.75rem; color: var(--text-subtle); display: block;">DISCORD</span><b style="color: var(--gold);">${escapeHtml(app.discord_tag)}</b></div>
        <div><span style="font-size: 0.75rem; color: var(--text-subtle); display: block;">IDADE</span><b>${app.age} anos</b></div>
        <div><span style="font-size: 0.75rem; color: var(--text-subtle); display: block;">CARGO PRETENDIDO</span><b style="text-transform: uppercase;">${escapeHtml(app.desired_role || "Suporte")}</b></div>
      </div>
      <div>
        <h5 style="color: var(--gold-vivid); margin-bottom: 6px;">Disponibilidade Semanal:</h5>
        <p style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid var(--border-line);">${escapeHtml(app.availability)}</p>
      </div>
      <div>
        <h5 style="color: var(--gold-vivid); margin-bottom: 6px;">Tempo de RP & Experiência Prévia:</h5>
        <p style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid var(--border-line);">${escapeHtml(app.experience)}</p>
      </div>
      <div>
        <h5 style="color: var(--gold-vivid); margin-bottom: 6px;">Cenário 1 (VDM/RDM em Praça):</h5>
        <p style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid var(--border-line);">${escapeHtml(app.scenario1 || "Não informado")}</p>
      </div>
      <div>
        <h5 style="color: var(--gold-vivid); margin-bottom: 6px;">Cenário 2 (Denúncia contra Amigo com Provas):</h5>
        <p style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid var(--border-line);">${escapeHtml(app.scenario2 || "Não informado")}</p>
      </div>
      <div>
        <h5 style="color: var(--gold-vivid); margin-bottom: 6px;">Motivação para entrar na Equipe:</h5>
        <p style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid var(--border-line);">${escapeHtml(app.motivation)}</p>
      </div>
    `;
  }

  const canReview = hasPermission("can_review_applications");
  $("#viewAppActions").innerHTML = canReview ? `
    <button class="btn btn-secondary" onclick="closeViewAppModal()">Fechar</button>
    <button class="btn btn-danger" onclick="updateAppStatus('${app.id}', 'rejected')">Recusar</button>
    <button class="btn btn-secondary" onclick="updateAppStatus('${app.id}', 'reviewing')">Em Análise</button>
    <button class="btn btn-success" onclick="updateAppStatus('${app.id}', 'approved')">Aprovar p/ Entrevista</button>
  ` : `<button class="btn btn-secondary" onclick="closeViewAppModal()">Fechar</button>`;

  modal.classList.remove("hidden");
}

function closeViewAppModal() {
  $("#viewAppModal").classList.add("hidden");
}

/* ==========================================================================
   GESTOR DE PERGUNTAS DO FORMULÁRIO DE RECRUTAMENTO
   ========================================================================== */
const DEFAULT_FORM_QUESTIONS = [
  // 1. Dados Pessoais & In-Game
  { id: "appFullName", section: "1. Dados Pessoais & In-Game", label: "Nome e sobrenome", type: "Texto Curto", placeholder: "Ex: Gabriel Silva", required: true },
  { id: "appAge", section: "1. Dados Pessoais & In-Game", label: "Idade", type: "Número", placeholder: "Ex: 19", required: true },
  { id: "appCharName", section: "1. Dados Pessoais & In-Game", label: "Nome e sobrenome do personagem ingame", type: "Texto Curto", placeholder: "Ex: Lucas Falcon", required: true },
  { id: "appCharId", section: "1. Dados Pessoais & In-Game", label: "ID do personagem", type: "Número", placeholder: "Ex: 1042", required: true },
  { id: "appDiscordTag", section: "1. Dados Pessoais & In-Game", label: "Tag do discord (exemplo: #joao123)", type: "Texto Curto", placeholder: "Ex: #joao123 ou joao123", required: true },

  // 2. Experiência em Roleplay
  { id: "appTimeFiveM", section: "2. Experiência em Roleplay", label: "Há quanto tempo você faz Roleplay no FiveM?", type: "Texto Curto", placeholder: "Ex: 2 anos (mais de 1.500 horas)", required: true },
  { id: "appTimeTotalRP", section: "2. Experiência em Roleplay", label: "Há quanto tempo você faz Roleplay?", type: "Texto Curto", placeholder: "Ex: 3 anos (contando SAMP, FiveM, etc.)", required: true },
  { id: "appCurrentCities", section: "2. Experiência em Roleplay", label: "Atualmente você faz Roleplay em quantas cidades?", type: "Texto Curto", placeholder: "Ex: Apenas no Distrito Paulista", required: true },
  { id: "appRpKnowledge", section: "2. Experiência em Roleplay", label: "Classifique o seu conhecimento sobre Roleplay", type: "Seleção (Iniciante a Mestre)", placeholder: "Opções fixas de avaliação", required: true },
  { id: "appStaffExp", section: "2. Experiência em Roleplay", label: "Você já fez ou faz parte da Staff de algum servidor? Se sim, conte brevemente sua experiência.", type: "Dissertativa", placeholder: "Servidores onde atuou, cargos que exerceu e tempo na função...", required: true },

  // 3. Motivação & Disponibilidade
  { id: "appWhyJoin", section: "3. Motivação & Disponibilidade", label: "Por que você quer fazer parte da Staff do Distrito Paulista?", type: "Dissertativa", placeholder: "Explique os motivos que despertaram sua vontade de somar com a equipe...", required: true },
  { id: "appWhatCanAdd", section: "3. Motivação & Disponibilidade", label: "O que você acredita que pode agregar à nossa equipe?", type: "Dissertativa", placeholder: "Suas qualidades, postura ética, atenção aos jogadores e diferenciais...", required: true },
  { id: "appDailyHours", section: "3. Motivação & Disponibilidade", label: "Quantas horas por dia você costuma estar disponível para ajudar na cidade?", type: "Texto Curto", placeholder: "Ex: 2 horas semanais (ou mais)", required: true },
  { id: "appSchedule", section: "3. Motivação & Disponibilidade", label: "Quais dias e horários você possui maior disponibilidade?", type: "Texto Curto", placeholder: "Ex: Seg a Sex das 19h às 01h; Fins de semana tarde/noite", required: true },

  // 4. Situações Práticas & Conduta Administrativa
  { id: "appScenarioFriend", section: "4. Situações Práticas & Conduta Administrativa", label: "Como você agiria caso um amigo próximo estivesse quebrando uma regra da cidade?", type: "Dissertativa", placeholder: "Explique detalhadamente sua conduta imparcial perante a amizade e as diretrizes...", required: true },
  { id: "appScenarioAngry", section: "4. Situações Práticas & Conduta Administrativa", label: "Como você lidaria com um jogador nervoso ou desrespeitoso durante um atendimento?", type: "Dissertativa", placeholder: "Como manter a calma, profissionalismo e aplicar as regras adequadamente sem perder o equilíbrio...", required: true },
  { id: "appScenarioUnknown", section: "4. Situações Práticas & Conduta Administrativa", label: "O que você faria caso não soubesse resolver o problema de um jogador?", type: "Dissertativa", placeholder: "Como agiria para dar o suporte correto sem passar informações erradas ao cidadão...", required: true },
  { id: "appFriendshipVsAdmin", section: "4. Situações Práticas & Conduta Administrativa", label: "Você considera importante separar amizade de decisões administrativas? Explique.", type: "Dissertativa", placeholder: "Sua visão sobre imparcialidade, justiça e a integridade da Staff...", required: true },
  { id: "appMainFunction", section: "4. Situações Práticas & Conduta Administrativa", label: "Na sua opinião, qual é a principal função de um membro da Staff?", type: "Dissertativa", placeholder: "O propósito central da Staff perante os jogadores e o bom andamento da cidade...", required: true },

  // 5. Equipe, Histórico & Recursos
  { id: "appTeamwork", section: "5. Equipe, Histórico & Recursos", label: "Você possui facilidade para trabalhar em equipe e receber orientações de superiores?", type: "Dissertativa", placeholder: "Fale sobre sua adaptação a feedbacks, hierarquia e trabalho colaborativo...", required: true },
  { id: "appPunishments", section: "5. Equipe, Histórico & Recursos", label: "Já recebeu alguma punição dentro do Distrito Paulista? Se sim, explique o ocorrido.", type: "Dissertativa", placeholder: "Caso nunca tenha sido punido, informe 'Nunca fui punido'. Se já recebeu advertência ou banimento, explique...", required: true },
  { id: "appMicReady", section: "5. Equipe, Histórico & Recursos", label: "Você possui microfone em boas condições e disponibilidade para participar de reuniões?", type: "Múltipla Escolha", placeholder: "Opções de sim/não", required: true },
  { id: "appWillingLearn", section: "5. Equipe, Histórico & Recursos", label: "Está disposto a aprender os procedimentos, comandos e regras internas da Staff?", type: "Múltipla Escolha", placeholder: "Opções de sim/não", required: true }
];

function getFormQuestions() {
  const saved = localStorage.getItem("dp_recruitment_questions");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return structuredClone(DEFAULT_FORM_QUESTIONS);
}

function openQuestionsModal() {
  const modal = $("#formQuestionsModal");
  if (!modal) return;

  const container = $("#questionsEditorList");
  const countBadge = $("#questionsCountBadge");
  const questions = getFormQuestions();

  if (countBadge) {
    countBadge.textContent = `${questions.length} perguntas ativas no formulário`;
  }

  let currentSection = "";
  let html = "";

  questions.forEach((q, idx) => {
    if (q.section !== currentSection) {
      currentSection = q.section;
      html += `
        <div class="question-section-title">
          <span>${escapeHtml(currentSection)}</span>
        </div>
      `;
    }

    html += `
      <div class="question-edit-card" data-q-id="${escapeHtml(q.id)}">
        <div class="question-edit-header">
          <div class="flex-align-center gap-8">
            <span class="q-id">#${idx + 1} • ${escapeHtml(q.id)}</span>
            <span class="q-type">${escapeHtml(q.type || "Texto")}</span>
          </div>
          <span style="font-size: 0.78rem; color: var(--gold);">${q.required ? "★ Obrigatória" : "Opcional"}</span>
        </div>

        <div class="question-edit-fields">
          <div>
            <label class="question-field-label">Enunciado da Pergunta:</label>
            <input type="text" class="input-styled q-label-input" value="${escapeHtml(q.label)}" placeholder="Digite a pergunta..." />
          </div>
          <div>
            <label class="question-field-label">Texto de Ajuda / Placeholder:</label>
            <input type="text" class="input-styled q-placeholder-input" value="${escapeHtml(q.placeholder || "")}" placeholder="Dica de preenchimento..." />
          </div>
        </div>
      </div>
    `;
  });

  if (container) container.innerHTML = html;

  const statusEl = $("#saveQuestionsStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  modal.classList.remove("hidden");
}

function closeQuestionsModal() {
  $("#formQuestionsModal")?.classList.add("hidden");
}

function saveAllFormQuestions() {
  const cards = $$(".question-edit-card", $("#questionsEditorList"));
  const currentQuestions = getFormQuestions();

  const updatedQuestions = currentQuestions.map(q => {
    const card = cards.find(c => c.dataset.qId === q.id);
    if (!card) return q;

    const labelInput = $(".q-label-input", card);
    const placeholderInput = $(".q-placeholder-input", card);

    return {
      ...q,
      label: labelInput ? labelInput.value.trim() || q.label : q.label,
      placeholder: placeholderInput ? placeholderInput.value.trim() : q.placeholder
    };
  });

  localStorage.setItem("dp_recruitment_questions", JSON.stringify(updatedQuestions));
  
  const statusEl = $("#saveQuestionsStatus");
  if (statusEl) {
    statusEl.className = "form-status success";
    statusEl.textContent = "✓ Perguntas atualizadas no site com sucesso!";
  }

  recordAuditLog("Edição do Formulário", `${updatedQuestions.length} perguntas do formulário de recrutamento foram atualizadas`);
  toast("Perguntas do formulário de candidatura salvas com sucesso!");
  setTimeout(() => closeQuestionsModal(), 900);
}

function resetQuestionsToDefault() {
  if (!confirm("Deseja restaurar todas as perguntas originais do formulário de recrutamento?")) return;
  localStorage.setItem("dp_recruitment_questions", JSON.stringify(DEFAULT_FORM_QUESTIONS));
  openQuestionsModal();
  toast("Perguntas restauradas para o padrão oficial!");
}

/* ==========================================================================
   EQUIPE & CRIAÇÃO DE LOGINS (CEO & DIREÇÃO)
   ========================================================================== */
function renderTeamTable() {
  const tbody = $("#dashTeamTableBody");
  if (!tbody) return;

  const canManage = hasPermission("can_manage_staff");
  const isCeo = state.role === "ceo";

  tbody.innerHTML = state.team.map(member => {
    const isSelf = state.user?.id === member.id;
    const isMemberCeo = member.role === "ceo";

    return `
      <tr>
        <td>
          <div class="flex-align-center gap-12">
            <span style="font-size: 1.3rem;">${ROLE_EMOJIS[member.role] || "👤"}</span>
            <div>
              <div class="flex-align-center gap-8">
                <strong>${escapeHtml(member.name)}</strong>
                <button type="button" class="btn-icon-rename" onclick="openEditMemberNameModal('${member.id}')" title="Editar nome de ${escapeHtml(member.name)}" aria-label="Editar nome">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              </div>
              ${isSelf ? `<span class="badge" style="font-size: 0.65rem; background: rgba(255,255,255,0.1);">VOCÊ</span>` : ""}
            </div>
          </div>
        </td>
        <td><code>${escapeHtml(member.email)}</code></td>
        <td>
          ${canManage && !isMemberCeo ? `
            <select class="select-inline" onchange="changeMemberRole('${member.id}', this.value)" style="padding: 6px 10px;">
              <option value="suporte" ${member.role === "suporte" ? "selected" : ""}>🎧 Suporte</option>
              <option value="moderador" ${member.role === "moderador" ? "selected" : ""}>🛡️ Moderador</option>
              <option value="administrador" ${member.role === "administrador" ? "selected" : ""}>⚖️ Administrador</option>
              <option value="gerente" ${member.role === "gerente" ? "selected" : ""}>💼 Gerente</option>
              <option value="diretor" ${member.role === "diretor" ? "selected" : ""}>⚜️ Diretor</option>
              ${isCeo ? `<option value="ceo" ${member.role === "ceo" ? "selected" : ""}>👑 CEO (Master)</option>` : ""}
            </select>
          ` : `<span class="role-pill ${member.role}">${ROLE_DISPLAY_NAMES[member.role] || member.role}</span>`}
        </td>
        <td>
          <span class="status-indicator ${member.status === "active" ? "online" : "danger"}"></span>
          <span style="font-size: 0.85rem; margin-left: 6px;">${member.status === "active" ? "Ativo" : "Bloqueado"}</span>
        </td>
        <td><small class="audit-meta">${formatDate(member.created_at)}</small></td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="openEditMemberNameModal('${member.id}')" title="Editar nome deste login" style="padding: 6px 10px; font-size: 0.78rem;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 3px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              <span>Editar Nome</span>
            </button>
            ${canManage && !isMemberCeo && !isSelf ? `
              <button class="btn btn-secondary" onclick="toggleMemberStatus('${member.id}')" style="padding: 6px 10px; font-size: 0.78rem;">
                ${member.status === "active" ? "Bloquear" : "Ativar"}
              </button>
              <button class="btn btn-secondary-danger" onclick="removeMember('${member.id}')" style="padding: 6px 10px; font-size: 0.78rem;">
                Excluir
              </button>
            ` : isMemberCeo ? `
              <span class="badge" style="font-size: 0.68rem; background: rgba(230, 184, 0, 0.15); color: var(--gold-vivid); border: 1px solid rgba(230, 184, 0, 0.3);">Cargo Protegido</span>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openEditMemberNameModal(id) {
  const member = state.team.find(m => m.id === id);
  if (!member) return;

  const modal = $("#editNameModal");
  if (!modal) return;

  const idInput = $("#editMemberId");
  const nameInput = $("#editMemberNameInput");
  const emojiEl = $("#editNameModalEmoji");
  const titleEl = $("#editNameModalTitle");
  const subtitleEl = $("#editNameModalSubtitle");
  const statusEl = $("#editNameStatus");

  if (idInput) idInput.value = member.id;
  if (nameInput) nameInput.value = member.name;
  if (emojiEl) emojiEl.textContent = ROLE_EMOJIS[member.role] || "👤";
  if (titleEl) titleEl.textContent = `Editar Nome — ${ROLE_DISPLAY_NAMES[member.role] || member.role}`;
  if (subtitleEl) subtitleEl.textContent = `Login: ${member.email}`;
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  modal.classList.remove("hidden");
  setTimeout(() => {
    nameInput?.focus();
    nameInput?.select();
  }, 100);
}

function closeEditNameModal() {
  const modal = $("#editNameModal");
  if (modal) modal.classList.add("hidden");
}

function openSelfEditModal() {
  if (state.user && state.user.id) {
    openEditMemberNameModal(state.user.id);
  } else {
    const ceo = state.team.find(m => m.role === "ceo");
    if (ceo) openEditMemberNameModal(ceo.id);
  }
}

async function handleEditMemberName(e) {
  e.preventDefault();
  const id = $("#editMemberId")?.value;
  const newName = $("#editMemberNameInput")?.value?.trim();
  const statusEl = $("#editNameStatus");

  if (!newName) {
    if (statusEl) {
      statusEl.className = "form-status error";
      statusEl.textContent = "Por favor, digite um nome válido.";
    }
    return;
  }

  const member = state.team.find(m => m.id === id);
  if (!member) {
    if (statusEl) {
      statusEl.className = "form-status error";
      statusEl.textContent = "Membro não encontrado.";
    }
    return;
  }

  const oldName = member.name;
  member.name = newName;
  localStorage.setItem("dp_team_members", JSON.stringify(state.team));

  // Atualiza sessão ativa se for o usuário conectado no momento
  if (state.user && (state.user.id === member.id || state.user.email === member.email)) {
    state.user.name = newName;
    localStorage.setItem("dp_auth_user", JSON.stringify(state.user));
    const userNameEl = $("#dashUserName");
    if (userNameEl) userNameEl.textContent = newName;
  }

  // Tenta sincronizar com o Supabase profiles se conectado
  if (supabase) {
    try {
      await supabase
        .from("profiles")
        .update({ display_name: newName, updated_at: new Date().toISOString() })
        .eq("email", member.email);
    } catch (err) {
      console.warn("Supabase profile display_name update:", err);
    }
  }

  recordAuditLog("Edição de Login", `Nome de '${oldName}' alterado para '${newName}' (${ROLE_DISPLAY_NAMES[member.role] || member.role})`);
  renderTeamTable();
  closeEditNameModal();
  toast(`Nome alterado para "${newName}" com sucesso!`);
}

function changeMemberRole(id, newRole) {
  if (!hasPermission("can_manage_staff")) {
    toast("Sem permissão para alterar cargos.");
    return;
  }
  const member = state.team.find(m => m.id === id);
  if (!member) return;
  const oldRole = member.role;
  member.role = newRole;
  localStorage.setItem("dp_team_members", JSON.stringify(state.team));
  renderTeamTable();
  toast(`Cargo de ${member.name} alterado para ${ROLE_DISPLAY_NAMES[newRole]}!`);
  recordAuditLog("Alteração de Cargo", `${member.name}: ${oldRole.toUpperCase()} ➔ ${newRole.toUpperCase()}`);
}

function toggleMemberStatus(id) {
  const member = state.team.find(m => m.id === id);
  if (!member) return;
  member.status = member.status === "active" ? "suspended" : "active";
  localStorage.setItem("dp_team_members", JSON.stringify(state.team));
  renderTeamTable();
  toast(`Status de ${member.name} alterado para ${member.status === "active" ? "Ativo" : "Bloqueado"}.`);
}

function removeMember(id) {
  if (!confirm("Remover este membro da equipe permanentemente?")) return;
  state.team = state.team.filter(m => m.id !== id);
  localStorage.setItem("dp_team_members", JSON.stringify(state.team));
  renderTeamTable();
  toast("Membro removido.");
}

function openCreateUserModal() {
  if (!hasPermission("can_create_accounts")) {
    toast("Apenas o CEO pode criar novos logins.");
    return;
  }
  $("#createUserForm").reset();
  $("#newStaffPassword").value = generateSecurePassword();
  $("#createUserStatus").textContent = "";
  $("#createUserModal").classList.remove("hidden");
}

function closeCreateUserModal() {
  $("#createUserModal").classList.add("hidden");
}

function generateSecurePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 12; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
}

function handleCreateUser(e) {
  e.preventDefault();
  const name = $("#newStaffName").value.trim();
  const email = $("#newStaffEmail").value.trim().toLowerCase();
  const role = $("#newStaffRole").value;
  const statusEl = $("#createUserStatus");

  if (!name || !email) {
    statusEl.className = "form-status error";
    statusEl.textContent = "Preencha todos os campos.";
    return;
  }

  const newMember = {
    id: "user-" + Date.now(),
    name,
    email,
    role,
    status: "active",
    created_at: new Date().toISOString()
  };

  state.team.push(newMember);
  localStorage.setItem("dp_team_members", JSON.stringify(state.team));
  renderTeamTable();
  toast(`Conta criada com sucesso para ${name}!`);
  recordAuditLog("Criação de Conta Staff", `${name} (${email}) cadastrado como ${role.toUpperCase()}`);
  closeCreateUserModal();
}

/* ==========================================================================
   MATRIZ DE PERMISSÕES & AUDITORIA
   ========================================================================== */
function renderPermissionsMatrix() {
  const tbody = $("#dashPermsTableBody");
  if (!tbody) return;

  const roles = ["suporte", "moderador", "administrador", "gerente", "diretor", "ceo"];

  tbody.innerHTML = Object.entries(state.permissions).map(([permKey, permData]) => {
    const cells = roles.map(role => {
      const isCeo = role === "ceo";
      const isChecked = isCeo ? true : Boolean(permData[role]);
      return `
        <td class="text-center">
          <input type="checkbox"
                 class="perm-toggle-checkbox"
                 data-perm="${permKey}"
                 data-role="${role}"
                 ${isChecked ? "checked" : ""}
                 ${isCeo ? "disabled title='CEO possui todas as permissões permanentemente'" : ""} />
        </td>
      `;
    }).join("");

    return `
      <tr>
        <td><strong>${escapeHtml(permData.label)}</strong></td>
        ${cells}
      </tr>
    `;
  }).join("");

  $$(".perm-toggle-checkbox", tbody).forEach(checkbox => {
    checkbox.addEventListener("change", (e) => {
      const permKey = e.target.dataset.perm;
      const role = e.target.dataset.role;
      if (role === "ceo") return;
      state.permissions[permKey][role] = e.target.checked;
    });
  });
}

function savePermissions() {
  if (state.role !== "ceo") {
    toast("Apenas o CEO pode salvar a matriz de permissões.");
    return;
  }
  localStorage.setItem("dp_permissions", JSON.stringify(state.permissions));
  updateSidebarVisibility();
  renderUserRightsSummary();
  renderApplications();
  renderTeamTable();
  toast("Matriz de permissões salva com sucesso!");
  recordAuditLog("Matriz de Permissões Atualizada", "CEO redefiniu privilégios do sistema");
}

function renderAuditLogs() {
  const container = $("#dashAuditContainer");
  if (!container) return;

  if (!state.auditLogs.length) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhum log gravado.</p>`;
    return;
  }

  container.innerHTML = state.auditLogs.slice(0, 40).map(log => `
    <div class="audit-log-row">
      <div>
        <strong style="color: #fff; font-size: 0.95rem;">${escapeHtml(log.action)}</strong>
        <p style="color: var(--text-muted); font-size: 0.82rem; margin-top: 2px;">${escapeHtml(log.details)}</p>
      </div>
      <div style="text-align: right;">
        <span style="display: block; color: var(--gold-vivid); font-weight: 700; font-size: 0.8rem;">${escapeHtml(log.user)}</span>
        <small class="audit-meta">${formatDate(log.timestamp)}</small>
      </div>
    </div>
  `).join("");
}

function clearAuditLogs() {
  if (!hasPermission("can_clear_audit_logs")) {
    toast("Apenas o CEO pode limpar os logs.");
    return;
  }
  if (!confirm("Limpar todo o histórico de auditoria?")) return;
  state.auditLogs = [];
  localStorage.setItem("dp_audit_logs", JSON.stringify(state.auditLogs));
  renderAuditLogs();
  toast("Auditoria limpa.");
}

/* ==========================================================================
   CONTROLE DE STATUS DO FORMULÁRIO DE RECRUTAMENTO (ABERTO / FECHADO)
   ========================================================================== */
function renderRecruitmentControl() {
  const isOpen = localStorage.getItem("dp_recruitment_open") !== "false";
  const badge = $("#dashRecruitmentStatusBadge");
  const text = $("#dashRecruitmentStatusText");
  const btnOpen = $("#btnRecruitmentOpen");
  const btnClose = $("#btnRecruitmentClose");

  if (isOpen) {
    if (badge) {
      badge.className = "recruitment-status-pill open";
      const dot = badge.querySelector(".status-indicator");
      if (dot) dot.className = "status-indicator online pulse";
    }
    if (text) text.textContent = "INSCRIÇÕES ABERTAS";
    if (btnOpen) {
      btnOpen.style.opacity = "0.4";
      btnOpen.style.cursor = "default";
      btnOpen.setAttribute("disabled", "true");
    }
    if (btnClose) {
      btnClose.style.opacity = "1";
      btnClose.style.cursor = "pointer";
      btnClose.removeAttribute("disabled");
    }
  } else {
    if (badge) {
      badge.className = "recruitment-status-pill closed";
      const dot = badge.querySelector(".status-indicator");
      if (dot) dot.className = "status-indicator";
    }
    if (text) text.textContent = "INSCRIÇÕES FECHADAS";
    if (btnOpen) {
      btnOpen.style.opacity = "1";
      btnOpen.style.cursor = "pointer";
      btnOpen.removeAttribute("disabled");
    }
    if (btnClose) {
      btnClose.style.opacity = "0.4";
      btnClose.style.cursor = "default";
      btnClose.setAttribute("disabled", "true");
    }
  }
}

function setRecruitmentStatus(isOpen) {
  if (!hasPermission("can_review_applications") && state.role !== "ceo" && state.role !== "diretor") {
    toast("Você não possui permissão para alterar o status do recrutamento.");
    return;
  }

  localStorage.setItem("dp_recruitment_open", isOpen ? "true" : "false");
  renderRecruitmentControl();

  const msg = isOpen
    ? "Formulário ABERTO! Os jogadores agora conseguem visualizar e preencher as 26 perguntas no site."
    : "Formulário FECHADO! O formulário foi ocultado do site e substituído pelo aviso de inscrições encerradas.";
  toast(msg);
  recordAuditLog(
    "Status de Recrutamento",
    isOpen ? "Inscrições da Staff abertas ao público" : "Inscrições da Staff fechadas ao público"
  );
}

async function handleLogout() {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
  }
  localStorage.removeItem("dp_auth_user");
  recordAuditLog("Logout Administrativo", "Sessão encerrada pelo usuário");
  window.location.replace("login-staff.html");
}

/* ==========================================================================
   NAVEGAÇÃO POR ABAS NO DASHBOARD
   ========================================================================== */
function switchTab(tabKey) {
  if (!tabKey) return;
  $$(".dash-side-link").forEach(link => {
    link.classList.toggle("active", link.dataset.tab === tabKey);
  });
  $$(".dash-pane").forEach(pane => {
    pane.classList.remove("active");
  });
  const paneId = `pane${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`;
  const target = $(`#${paneId}`);
  if (target) {
    target.classList.add("active");
  }
}

function setupTabs() {
  $$(".dash-side-link").forEach(link => {
    link.addEventListener("click", () => {
      switchTab(link.dataset.tab);
    });
  });

  $("#dashCategorySelect")?.addEventListener("change", populateContentEditor);
  $("#dashSaveContentBtn")?.addEventListener("click", savePublishedContent);
  $("#btnDashSavePerms")?.addEventListener("click", savePermissions);
  $("#btnDashClearAudit")?.addEventListener("click", clearAuditLogs);
  $("#dashLogoutBtn")?.addEventListener("click", handleLogout);

  $("#dashAppFilter")?.addEventListener("change", renderApplications);
  $("#dashAppSearch")?.addEventListener("input", renderApplications);

  $("#btnRecruitmentOpen")?.addEventListener("click", () => setRecruitmentStatus(true));
  $("#btnRecruitmentClose")?.addEventListener("click", () => setRecruitmentStatus(false));

  $("#createUserForm")?.addEventListener("submit", handleCreateUser);
  $("#editNameForm")?.addEventListener("submit", handleEditMemberName);
  $("#btnGeneratePass")?.addEventListener("click", () => {
    const pwdInput = $("#newStaffPassword");
    if (pwdInput) pwdInput.value = generateSecurePassword();
  });
}

function loadInitialData() {
  const RULES_VERSION = "2026.10_v2";
  if (localStorage.getItem("dp_rules_version") !== RULES_VERSION) {
    localStorage.removeItem("dp_rules");
    localStorage.setItem("dp_rules_version", RULES_VERSION);
  }

  // Regras e conteúdo
  const savedRules = localStorage.getItem("dp_rules");
  if (savedRules) {
    try { state.content = { ...DEFAULT_RULES, ...JSON.parse(savedRules) }; } catch {}
  } else {
    state.content = structuredClone(DEFAULT_RULES);
  }

  // Candidaturas
  const savedApps = localStorage.getItem("dp_applications");
  if (savedApps) {
    try { state.applications = JSON.parse(savedApps); } catch {}
  }
  if (!state.applications) {
    state.applications = [];
  }

  // Equipe
  const savedTeam = localStorage.getItem("dp_team_members");
  if (savedTeam) {
    try { state.team = JSON.parse(savedTeam); } catch {}
  }
  if (!state.team || !state.team.length) {
    state.team = [
      { id: "user-ceo-01", name: "Blaze / Lomba / Morgan", email: "dpaulistarp@gmail.com", role: "ceo", status: "active" }
    ];
    localStorage.setItem("dp_team_members", JSON.stringify(state.team));
  } else {
    let teamUpdated = false;
    state.team.forEach(m => {
      if (m.role === "ceo" && (m.name?.includes("Arthur Pendelton") || m.name === "Arthur Pendelton | ID: 01")) {
        m.name = "Blaze / Lomba / Morgan";
        teamUpdated = true;
      }
    });
    if (teamUpdated) {
      localStorage.setItem("dp_team_members", JSON.stringify(state.team));
    }
  }

  // Atualiza sessão ativa caso o usuário logado seja o CEO com o nome antigo
  if (state.user && state.user.role === "ceo" && (state.user.name?.includes("Arthur Pendelton") || state.user.name === "Arthur Pendelton | ID: 01")) {
    state.user.name = "Blaze / Lomba / Morgan";
    localStorage.setItem("dp_auth_user", JSON.stringify(state.user));
  }

  // Permissões
  const savedPerms = localStorage.getItem("dp_permissions");
  if (savedPerms) {
    try { state.permissions = JSON.parse(savedPerms); } catch {}
  } else {
    state.permissions = structuredClone(DEFAULT_PERMISSIONS);
  }

  // Logs
  const savedLogs = localStorage.getItem("dp_audit_logs");
  if (savedLogs) {
    try { state.auditLogs = JSON.parse(savedLogs); } catch {}
  }
  if (!state.auditLogs) {
    state.auditLogs = [];
  }
}

// Expor funções globais no window para os botões do dashboard
window.switchTab = switchTab;
window.openCreateUserModal = openCreateUserModal;
window.closeCreateUserModal = closeCreateUserModal;
window.openEditMemberNameModal = openEditMemberNameModal;
window.closeEditNameModal = closeEditNameModal;
window.openSelfEditModal = openSelfEditModal;
window.openViewAppModal = openViewAppModal;
window.closeViewAppModal = closeViewAppModal;
window.openQuestionsModal = openQuestionsModal;
window.closeQuestionsModal = closeQuestionsModal;
window.saveAllFormQuestions = saveAllFormQuestions;
window.resetQuestionsToDefault = resetQuestionsToDefault;
window.updateAppStatus = updateAppStatus;
window.deleteApplication = deleteApplication;
window.changeMemberRole = changeMemberRole;
window.toggleMemberStatus = toggleMemberStatus;
window.removeMember = removeMember;
window.setRecruitmentStatus = setRecruitmentStatus;

async function init() {
  loadInitialData();
  setupTabs();
  renderRecruitmentControl();
  await checkAuthSession();
}

init();

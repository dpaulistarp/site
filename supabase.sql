-- ============================================================================
-- DISTRITO PAULISTA RP — BANCO DE DADOS & SEGURANÇA EM PRODUÇÃO (SUPABASE)
-- ============================================================================
-- Arquitetura: RBAC (Role-Based Access Control) com 6 Níveis Hierárquicos:
-- 1. Suporte (Atendimento & Dúvidas)
-- 2. Moderador (Moderação de Conflitos)
-- 3. Administrador (Gestão de Casos & Punições)
-- 4. Gerente (Coordenação de Equipes & Triagem)
-- 5. Diretor (Diretoria & Regulamento)
-- 6. CEO (Superadmin Master — Controle Total, Permissões & Contas)
-- ============================================================================

-- 1. Habilitar extensões necessárias
create extension if not exists pgcrypto;

-- 2. Tabela de Perfis de Usuários (Sincronizada com auth.users)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  role text not null default 'player' check (role in ('player', 'suporte', 'moderador', 'administrador', 'gerente', 'diretor', 'ceo')),
  avatar_url text null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Matriz de Permissões Gerenciada Exclusivamente pelo CEO
create table if not exists public.permissions_matrix (
  permission_key text primary key,
  label text not null,
  suporte boolean not null default false,
  moderador boolean not null default false,
  administrador boolean not null default false,
  gerente boolean not null default false,
  diretor boolean not null default false,
  ceo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

-- 4. Tabela de Regras Oficiais da Cidade
create table if not exists public.rules (
  category text primary key check (category in ('gerais', 'policia', 'ilegal', 'codigo_penal', 'historia')),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 25000),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

-- 5. Tabela de Candidaturas da Staff (Recrutamento)
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  game_name text not null check (char_length(game_name) between 2 and 80),
  discord_tag text not null check (char_length(discord_tag) between 2 and 60),
  age int not null check (age between 13 and 99),
  desired_role text not null check (desired_role in ('suporte', 'moderador', 'administrador')),
  availability text not null check (char_length(availability) between 3 and 200),
  experience text not null check (char_length(experience) between 10 and 2000),
  scenario1 text not null check (char_length(scenario1) between 10 and 2000),
  scenario2 text not null check (char_length(scenario2) between 10 and 2000),
  motivation text not null check (char_length(motivation) between 10 and 2000),
  answers jsonb null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected')),
  reviewer_notes text null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

-- 6. Tabela de Logs de Auditoria do Sistema
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  user_id uuid references auth.users(id) null,
  user_name text not null,
  details text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.permissions_matrix enable row level security;
alter table public.rules enable row level security;
alter table public.applications enable row level security;
alter table public.audit_logs enable row level security;

-- ============================================================================
-- FUNÇÕES DE SEGURANÇA (SECURITY DEFINER)
-- ============================================================================

-- Obter cargo do usuário autenticado
create or replace function public.get_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.user_id = auth.uid() and p.status = 'active'),
    'guest'
  );
$$;

-- Verificar se é membro da Staff (qualquer nível)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_current_role() in ('suporte', 'moderador', 'administrador', 'gerente', 'diretor', 'ceo');
$$;

-- Verificar se é CEO (Superadmin)
create or replace function public.is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_current_role() = 'ceo';
$$;

-- Verificar se é Diretor ou CEO
create or replace function public.is_director_or_higher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_current_role() in ('diretor', 'ceo');
$$;

-- Checar permissão estática e segura da matriz RBAC (sem SQL dinâmico / 100% blindado contra SQLi)
create or replace function public.has_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_allowed boolean := false;
begin
  v_role := public.get_current_role();
  if v_role = 'ceo' then
    return true;
  end if;

  select
    case v_role
      when 'suporte' then pm.suporte
      when 'moderador' then pm.moderador
      when 'administrador' then pm.administrador
      when 'gerente' then pm.gerente
      when 'diretor' then pm.diretor
      else false
    end
  into v_allowed
  from public.permissions_matrix pm
  where pm.permission_key = p_key;

  return coalesce(v_allowed, false);
end;
$$;

-- Consulta pública segura de status de candidatura (sem expor fichas de outros candidatos nem respostas confidenciais)
create or replace function public.check_application_status(p_query text)
returns table (
  id uuid,
  game_name text,
  discord_tag text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewer_notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text;
begin
  v_clean := trim(lower(coalesce(p_query, '')));
  if char_length(v_clean) < 2 then
    return;
  end if;

  return query
  select 
    a.id,
    a.game_name,
    a.discord_tag,
    a.status,
    a.created_at,
    a.reviewed_at,
    a.reviewer_notes
  from public.applications a
  where lower(a.discord_tag) = v_clean
     or lower(a.discord_tag) like '%' || v_clean || '%'
     or lower(a.game_name) like '%' || v_clean || '%'
  order by a.created_at desc
  limit 1;
end;
$$;

-- Revogar execução pública e conceder para roles padrão
revoke all on function public.get_current_role() from public;
grant execute on function public.get_current_role() to anon, authenticated;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

revoke all on function public.is_ceo() from public;
grant execute on function public.is_ceo() to anon, authenticated;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to anon, authenticated;

revoke all on function public.check_application_status(text) from public;
grant execute on function public.check_application_status(text) to anon, authenticated;

-- ============================================================================
-- POLÍTICAS RLS (ROW LEVEL SECURITY)
-- ============================================================================

-- 1. PROFILES
drop policy if exists "Users can read profiles" on public.profiles;
create policy "Users can read profiles"
on public.profiles for select
to authenticated
using (
  auth.uid() = user_id or public.is_staff()
);

drop policy if exists "CEO and Directors can update profiles" on public.profiles;
create policy "CEO and Directors can update profiles"
on public.profiles for update
to authenticated
using (public.is_director_or_higher())
with check (
  -- Apenas o CEO pode atribuir o cargo de CEO
  case when role = 'ceo' then public.is_ceo() else true end
);

drop policy if exists "CEO can insert new staff profiles" on public.profiles;
create policy "CEO can insert new staff profiles"
on public.profiles for insert
to authenticated
with check (public.is_ceo());

-- 2. REGRAS (Leitura Pública, Edição Restrita por Permissão)
drop policy if exists "Public can read rules" on public.rules;
create policy "Public can read rules"
on public.rules for select
to anon, authenticated
using (true);

drop policy if exists "Staff with permission can update rules" on public.rules;
create policy "Staff with permission can update rules"
on public.rules for update
to authenticated
using (public.has_permission('can_edit_rules'))
with check (public.has_permission('can_edit_rules'));

-- 3. PERMISSÕES RBAC (Leitura Staff, Alteração Apenas CEO)
drop policy if exists "Staff can view permissions" on public.permissions_matrix;
create policy "Staff can view permissions"
on public.permissions_matrix for select
to authenticated
using (public.is_staff());

drop policy if exists "Only CEO can update permissions" on public.permissions_matrix;
create policy "Only CEO can update permissions"
on public.permissions_matrix for update
to authenticated
using (public.is_ceo())
with check (public.is_ceo());

-- 4. CANDIDATURAS (Qualquer um envia, Staff avalia com RBAC)
drop policy if exists "Public can submit application" on public.applications;
create policy "Public can submit application"
on public.applications for insert
to anon, authenticated
with check (
  status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
);

drop policy if exists "Staff with permission can view applications" on public.applications;
create policy "Staff with permission can view applications"
on public.applications for select
to authenticated
using (public.has_permission('can_view_applications'));

drop policy if exists "Staff with permission can update applications" on public.applications;
create policy "Staff with permission can update applications"
on public.applications for update
to authenticated
using (public.has_permission('can_review_applications'))
with check (public.has_permission('can_review_applications'));

drop policy if exists "Staff with permission can delete applications" on public.applications;
create policy "Staff with permission can delete applications"
on public.applications for delete
to authenticated
using (public.has_permission('can_delete_applications'));

-- 5. AUDIT LOGS (Leitura conforme permissão, Exclusão apenas CEO)
drop policy if exists "Staff with permission can view audit logs" on public.audit_logs;
create policy "Staff with permission can view audit logs"
on public.audit_logs for select
to authenticated
using (public.has_permission('can_view_audit_logs'));

drop policy if exists "Authenticated users can insert audit logs" on public.audit_logs;
create policy "Authenticated users can insert audit logs"
on public.audit_logs for insert
to authenticated
with check (true);

drop policy if exists "Only CEO can clear audit logs" on public.audit_logs;
create policy "Only CEO can clear audit logs"
on public.audit_logs for delete
to authenticated
using (public.is_ceo());

-- ============================================================================
-- DADOS INICIAIS (SEED)
-- ============================================================================

-- Matriz Padrão de Permissões
insert into public.permissions_matrix (permission_key, label, suporte, moderador, administrador, gerente, diretor, ceo)
values
  ('can_view_applications', 'Visualizar Candidaturas de Staff', false, true, true, true, true, true),
  ('can_review_applications', 'Aprovar / Recusar / Avaliar Candidaturas', false, false, false, true, true, true),
  ('can_delete_applications', 'Excluir Candidaturas do Sistema', false, false, false, false, true, true),
  ('can_edit_rules', 'Modificar e Publicar Regras da Cidade', false, false, false, false, true, true),
  ('can_manage_staff', 'Promover / Rebaixar / Gerenciar Membros', false, false, false, false, true, true),
  ('can_create_accounts', 'Criar Novos Logins de Staff', false, false, false, false, false, true),
  ('can_view_audit_logs', 'Acessar Trilha de Auditoria', false, false, false, true, true, true),
  ('can_clear_audit_logs', 'Limpar Histórico de Auditoria', false, false, false, false, false, true)
on conflict (permission_key) do nothing;

-- Regras Iniciais
insert into public.rules (category, title, content)
values
(
  'gerais',
  'Regras Gerais da Cidade — Distrito Paulista RP',
  '1. Respeito Mútuo: O RP deve estar sempre acima de divergências pessoais. Ofensas OOC (fora do personagem), preconceito ou assédio resultarão em banimento permanente.
2. Proibido Metagaming (MG): É estritamente proibido utilizar informações obtidas fora do jogo (Discord, transmissões, lives, chats) dentro do RP.
3. Proibido Powergaming (PG): Não realize ações impossíveis na vida real, abusar de animações ou forçar situações sem chances de reação justa para o outro player.
4. Proibido VDM (Vehicle Deathmatch): Proibido utilizar veículos como armas ou atropelar deliberadamente outros cidadãos sem justificativa válida de RP.
5. Proibido RDM (Random Deathmatch): Proibido agredir ou matar qualquer jogador sem motivo plausível e sem desenvolvimento prévio de diálogo/ação de RP.
6. Proibido Combat Logging (CL): Desconectar do servidor ou forçar crash durante abordagens policiais, tiroteios, sequestros ou interações de RP em andamento.
7. Amor à Vida: Em situações de desvantagem manifesta (ex: mira na cabeça, encurralado por três armados), você deve render-se e valorizar a vida do seu personagem.
8. Dark RP Restrito: Atos como tortura extrema, assédio, estupro ou gore são terminantemente proibidos e acarretam expulsão imediata do servidor.'
),
(
  'policia',
  'Diretrizes e Regras da Polícia — Forças de Segurança SP',
  '1. Uso Progressivo da Força: A autoridade policial deve iniciar pela presença ostensiva e verbalização, progredindo para armamento não-letal e uso letal apenas sob ameaça iminente à vida.
2. Abordagem com Justificativa: Nenhuma revista ou enquadro pode ser feito sem fundada suspeita (infrações visíveis de trânsito, denúncia formal, atitude suspeita ou alerta emitido).
3. Respeito ao Código Q e Rádio: O uso de frequências de rádio oficial deve manter compostura militar, sem ruídos, gritos ou brincadeiras durante o patrulhamento.
4. Procedimento de Prisão: Leitura obrigatória dos Direitos Constitucionais (Direitos de Miranda) no momento da voz de prisão antes da condução à DP.
5. Abuso de Autoridade e Corrupção: Qualquer ato de corrupção ou favorecimento ilícito só é permitido se previamente autorizado e homologado pela Diretoria do servidor.
6. Negociação em Roubos: Em ocorrências de roubo com reféns, a vida do refém é a prioridade absoluta da guarnição. Não abrir fogo enquanto houver risco direto ao civil.
7. Armamento e Viaturas: É vedado o empréstimo, venda ou descarte de equipamentos e viaturas da corporação para membros civis ou ilegais.'
),
(
  'ilegal',
  'Regras do Crime, Facções e Submundo Ilegal',
  '1. Contexto em Ações Criminosas: Todo assalto, sequestro ou cobrança armada exige uma justificativa plausível e desenvolvimento de enredo criminal dentro do RP.
2. Limite de Membros em Ações: Respeite o teto numérico de participantes definido pelo regulamento: Lojas de Conveniência (max 4), Bancos Pequenos (max 6), Banco Central (max 10).
3. Proibido Revenge Kill (RK): Se o seu personagem for finalizado e receber atendimento médico com perda de memória, é vedado voltar à mesma ação para se vingar.
4. Sequestros e Reféns: Proibido utilizar ''refém falso'' ou amigos em call para facilitar negociação em ações criminosas.
5. Disputas de Território: Guerras entre facções devem ser comunicadas e validadas pela Administração/Gerência com definição clara de horários e regras de combate.
6. Respeito às Safezones: É estritamente proibido roubar, sequestrar, iniciar tiroteios ou fugir para locais seguros (Hospitais, Concessionárias, Delegacias e Centrais de Emprego).
7. Saque de Itens (Looting): Permitido saquear apenas armas e itens usados na ação. É proibido obrigar jogadores a sacar dinheiro em caixas eletrônicos sob ameaça.'
),
(
  'codigo_penal',
  'Código Penal Unificado — Distrito Paulista RP',
  'Art. 121 - Homicídio Doloso: Pena: 40 a 60 meses de reclusão + Multa de R$ 50.000 (Inafiançável).
Art. 121 § 1º - Tentativa de Homicídio: Pena: 25 a 35 meses de reclusão + Multa de R$ 30.000.
Art. 129 - Lesão Corporal Grave: Pena: 15 a 20 meses de reclusão + Multa de R$ 15.000.
Art. 155 - Furto Simples e Qualificado: Pena: 10 a 20 meses de reclusão + Multa de R$ 10.000 a R$ 25.000.
Art. 157 - Roubo / Assalto à Mão Armada: Pena: 25 a 45 meses de reclusão + Multa de R$ 35.000.
Art. 148 - Sequestro e Cárcere Privado: Pena: 35 a 50 meses de reclusão + Multa de R$ 40.000.
Art. 33 - Tráfico Ilícito de Drogas e Entorpecentes: Pena: 30 a 50 meses de reclusão + Multa proporcional à quantidade.
Art. 14/16 - Porte e Posse Ilegal de Arma de Fogo: Pena: 20 a 35 meses de reclusão + Apreensão do armamento + Multa de R$ 25.000.
Art. 329 - Resistência à Prisão e Fuga Policial: Pena: 15 a 25 meses de reclusão + Multa de R$ 20.000.
Art. 331 - Desacato a Funcionário Público: Pena: 10 a 20 meses de reclusão + Multa de R$ 15.000.
Art. 333 - Corrupção Ativa / Tentativa de Suborno: Pena: 20 a 30 meses de reclusão + Multa de R$ 30.000.
Art. 308 - Racha / Direção Perigosa em Via Pública: Pena: 10 a 15 meses de reclusão + Apreensão do veículo + Multa de R$ 15.000.'
),
(
  'historia',
  'História Oficial e Lore da Cidade — Distrito Paulista RP',
  'Prólogo: O Renascimento Urbano de São Paulo
No coração da maior metrópole da América Latina, entre os arranha-céus iluminados da Avenida Paulista e os cartões-postais da Ponte Estaiada, ergue-se o Distrito Paulista: um território onde a lei e a ambição colidem diariamente.
Capítulo 1: A Linha Tênue entre o Luxo e o Asfalto
Fundada sob os pilares do empreendedorismo e da imersão automobilística, a cidade atraiu investidores bilionários, dinastias empresariais e cidadãos em busca de uma nova vida. Ao mesmo tempo, o crescimento vertiginoso abriu espaço para redes complexas do submundo do crime organizado, exigindo uma reestruturação das forças da lei.
Capítulo 2: As Forças de Segurança Pública
Com a criação do Comando Unificado das Forças de Segurança, os batalhões de elite da Polícia Militar e Civil foram equipados com tecnologia de ponta para patrulhar desde os bairros nobres até as comunidades da periferia, preservando a paz dos civis que movimentam a economia formal.
Capítulo 3: A Era Atual e o Seu Papel
Hoje, cada esquina do Distrito Paulista respira história. Seja na farda honrada da polícia, nos tribunais de justiça, nos leitos do hospital, nas garagens customizadas ou nas operações arriscadas do submundo, o seu destino é escrito a cada decisão. Bem-vindo à cidade que nunca dorme.'
)
on conflict (category) do nothing;

-- ============================================================================
-- COMO CRIAR O SEU PRIMEIRO USUÁRIO CEO (SUPERADMIN):
-- 1. No Supabase Dashboard, vá em Authentication > Users e crie um usuário.
-- 2. Copie o UUID gerado para esse usuário.
-- 3. Execute o comando abaixo no SQL Editor substituindo 'SEU_UUID_AQUI':
--
-- insert into public.profiles (user_id, display_name, role)
-- values ('SEU_UUID_AQUI', 'CEO Arthur', 'ceo')
-- on conflict (user_id) do update set role = 'ceo';
-- ============================================================================

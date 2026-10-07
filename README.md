# Distrito Paulista RP — Portal Oficial & Dashboard SaaS Staff

Sistema Web Full-Stack moderno desenvolvido para o servidor de FiveM **Distrito Paulista RP**, com foco rigoroso em **Segurança de Nível de Produção**, **Arquitetura Limpa**, **Controle de Acesso Baseado em Cargos (RBAC)** e uma identidade visual inspirada nas interfaces FiveM NUI em tons de preto e dourado âmbar.

---

## 📸 Identidade Visual & Ativos Integrados
Os ativos oficiais do servidor foram integrados diretamente no projeto:
- `assets/logo.png`: Logotipo oficial 3D em cromo prateado com grafite dourado e coroa.
- `assets/skyline_banner.jpg`: Skyline noturno de São Paulo com iluminação âmbar e Ponte Estaiada.
- `assets/dashboard_bg.jpg`: Plano de fundo urbano com estética de luxo e reflexos no asfalto molhado.
- `assets/gameplay_bg.png`: Imagem de HUD e ambiente FiveM.
- `assets/pmesp.png`: Brasão oficial da Polícia Militar do Estado de São Paulo.
- `assets/civil.png`: Distintivo oficial da Polícia Civil do Estado de São Paulo (PCESP).
- `assets/prf.png`: Distintivo oficial da Polícia Rodoviária Federal (PRF).

---

## 🚀 Funcionalidades Principais

### 1. Manual Interativo de Regras da Cidade
- **Divisão por Categorias Essenciais**:
  - ⚖️ **Regras Gerais**: Conceitos de RP, Metagaming, Powergaming, VDM, RDM, Combat Logging, Amor à Vida, Dark RP.
  - 🚓 **Regras da Polícia & Forças da Lei**: Uso progressivo da força, fundamentação de abordagens, conduta e negociações com reféns.
  - 💀 **Regras do Ilegal & Facções**: Limites de participantes por ação, regras de Revenge Kill (RK), guerras territoriais e safezones.
  - 🚨 **Código Penal SP**: Dosimetria de penas, multas e fianças estruturadas.
- **Busca em Tempo Real com Realce (`<mark>`)**:
  - Filtro instantâneo com tecla de atalho rápida **`Ctrl + K`**.
  - Botão de cópia rápida de artigos normativos individuais ou categoria completa.

### 2. Recrutamento da Staff & Acompanhamento
- **Formulário Completo e Seguro**:
  - Validação estrita (Nome no Jogo / ID, Discord Tag, Idade, Disponibilidade, Tempo de RP e Experiência prévia).
  - **Perguntas Situacionais**: Resoluções de conflitos (Cenário 1: VDM/RDM em praça; Cenário 2: Denúncia contra amigo próximo).
  - Sanitização de entidades HTML contra XSS e prevenção de envios duplicados.
- **Consulta de Status para Jogadores**:
  - Jogadores podem pesquisar seu Discord ou ID para conferir o andamento da sua inscrição (*Pendente*, *Em Análise*, *Aprovado para Entrevista*, *Recusado*).

### 3. Painel Administrativo / Dashboard SaaS com RBAC de 6 Níveis
Hierarquia oficial implementada:
1. **👑 CEO (Master / Superadmin)**:
   - Controle total irrestrito do ecossistema.
   - **Criação de Logins**: Cadastro de novos membros com e-mail, senha e cargo inicial.
   - **Matriz de Permissões Interativa**: Ativa ou desativa poderes específicos para cada um dos outros cargos.
   - **Gestão de Usuários**: Promover, rebaixar, bloquear ou excluir membros da staff.
   - **Auditoria do Sistema**: Visualização e limpeza da trilha de logs imutável.
2. **⚜️ Diretor**:
   - Gestão de candidaturas (Aprovação, recusa, exclusão).
   - Edição e publicação das regras da cidade.
   - Gerenciamento de cargos inferiores (Gerente, Admin, Moderador, Suporte).
   - Visualização de logs de auditoria.
3. **💼 Gerente**:
   - Triagem e avaliação de candidaturas de staff.
   - Visualização de membros e auditoria de ações.
4. **⚖️ Administrador**:
   - Moderação ativa e visualização de candidaturas.
5. **🛡️ Moderador**:
   - Consulta de candidaturas para entrevistas e apoio à moderação.
6. **🎧 Suporte**:
   - Acesso básico para suporte a novos membros e consulta às diretrizes.

---

## 🔒 Conexão com Supabase em Produção

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto.
2. Vá até o **SQL Editor**.
3. Copie todo o conteúdo do arquivo [`supabase.sql`](supabase.sql) e execute.
4. No arquivo `script.js` e `dashboard.js`, confirme suas credenciais:
   ```javascript
   const SUPABASE_URL = "https://seu-projeto.supabase.co";
   const SUPABASE_ANON_KEY = "sua-anon-key-aqui";
   ```

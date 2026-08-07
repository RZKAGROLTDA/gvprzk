# Controle de versão por usuário

Objetivo: registrar automaticamente qual build cada usuário está usando e exibir isso em uma tela administrativa, sem criar novo mecanismo de atualização.

## 1. Migration (nova tabela)

```sql
CREATE TABLE public.user_app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  build_hash text NOT NULL,
  build_time timestamptz,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_app_versions_build_hash ON public.user_app_versions(build_hash);
CREATE INDEX idx_user_app_versions_last_seen ON public.user_app_versions(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_app_versions TO authenticated;
GRANT ALL ON public.user_app_versions TO service_role;

ALTER TABLE public.user_app_versions ENABLE ROW LEVEL SECURITY;
```

Trigger de `updated_at` reutilizando a função existente do projeto.
`user_id` é `UNIQUE` — garante 1 registro por usuário e habilita `upsert` por conflito.
Nenhuma tabela existente é alterada.

## 2. RLS (apenas políticas novas nesta tabela)

- Inserir: `auth.uid() = user_id` (somente o próprio registro).
- Atualizar: `auth.uid() = user_id`.
- Ler o próprio registro: `auth.uid() = user_id`.
- Ler todos: `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')`.
- Excluir: nenhuma política (bloqueado).

Vendedor/consultor/supervisor não conseguem ver registros de terceiros.
Nenhuma política existente de outra tabela é tocada.

## 3. Fluxo de upsert (frontend)

Novo hook `useVersionHeartbeat`, chamado depois de auth + profile liberados (dentro do app autenticado):

```text
usuário autenticado + profile pronto
        |
        v
já enviou nesta sessão para este buildHash?  -- sim --> não faz nada
        |
        nao
        v
upsert user_app_versions (onConflict: user_id)
  user_id, build_hash = VITE_BUILD_HASH,
  build_time = VITE_BUILD_TIME, app_version = VITE_APP_VERSION,
  last_seen_at = now()
        |
        v
marca sessionStorage: version-reported:<buildHash>
```

Gatilhos: login, abertura do app, e reentrada após atualização automática (o reload gera novo boot com novo hash, logo novo envio). Guarda extra de intervalo mínimo (6h) em `localStorage` para evitar carga. Sem execução offline; falha é silenciosa (não bloqueia acesso).

## 4. Tela administrativa

Rota `/versoes-usuarios`, item "Versões dos Usuários" em Administração (visível a admin/manager).

Cards do topo (labels e disposição exatos):

```text
Versão publicada        Build atual        Build mínimo
v2026.08.07.1305        o8koi43l           o8koi43l
─────────────────────────────────────────────────────────
Usuários online   Atualizados   Desatualizados   Sem informação
      18               84              3                2
```

Primeira linha = informação de versão (publicada / atual / mínima), separada por divisor da segunda linha = contagens de usuários. "Versão publicada" e "Build atual" vêm do `version.json` remoto e do bundle; "Build mínimo" vem de `VITE_MIN_BUILD_TIME` / `version.json`. Ficam em cards distintos e rotulados, deixando claro que compatível ≠ mais recente.


Tabela: Usuário · Filial · Perfil · Build em uso · Versão · Último acesso · Status.

Status calculado no frontend:
- Atualizado: `build_hash` = build publicado atual
- Compatível: `build_time >= minBuildTime`, mas hash diferente do atual
- Desatualizado: `build_time < minBuildTime`
- Sem informação: usuário sem registro

Fonte dos usuários: diretório já existente (`profiles` ativos + filial + role), com `left join` em memória contra `user_app_versions`.

Filtros: status, filial, perfil, busca por nome/e-mail.

## 5. Fora de escopo

Sem mudanças em auth, RLS existentes, tarefas, checklist, máquinas, mídia, fila offline, nem novo mecanismo de atualização.

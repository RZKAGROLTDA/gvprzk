# Controle de versão por usuário e dispositivo

Objetivo: saber qual build cada usuário/dispositivo está usando e identificar usuários com algum dispositivo ativo ainda em versão antiga. Módulo apenas de monitoramento do mecanismo de atualização já existente.

## 1. Migration completa

```sql
CREATE TABLE public.user_app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  platform text,
  user_agent text,
  build_hash text NOT NULL,
  build_time timestamptz,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_app_versions_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX idx_uav_user ON public.user_app_versions(user_id);
CREATE INDEX idx_uav_build_hash ON public.user_app_versions(build_hash);
CREATE INDEX idx_uav_last_seen ON public.user_app_versions(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_app_versions TO authenticated;
GRANT ALL ON public.user_app_versions TO service_role;

ALTER TABLE public.user_app_versions ENABLE ROW LEVEL SECURITY;
```

Trigger de `updated_at` reutilizando a função existente do projeto.
Sem UNIQUE em `user_id` isolado: a chave é `(user_id, device_id)`, então celular, computador e PWA ficam em linhas separadas, cada um com seu próprio build.
Nenhuma tabela existente é alterada.

## 2. Policies

```sql
CREATE POLICY "own device version insert" ON public.user_app_versions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own device version update" ON public.user_app_versions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own device version select" ON public.user_app_versions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admins and managers view all versions" ON public.user_app_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
```

Sem política de DELETE — usuários comuns não excluem registros. Consultor/vendedor/supervisor não veem registros de terceiros. Nenhuma política existente de outra tabela é tocada.

## 3. Geração do device_id

- Gerado uma única vez por instalação: `crypto.randomUUID()`.
- Guardado em `localStorage` com a chave `app-device-id` e reutilizado em todos os boots (PWA instalada tem storage próprio, logo device_id próprio).
- Sem qualquer dado pessoal na composição do ID (aleatório puro, sem e-mail, nome, IP ou fingerprint).
- `platform`: derivado de forma grosseira (`ios` / `android` / `desktop` + flag `pwa` quando em display-mode standalone).
- `user_agent`: string do navegador, apenas para suporte técnico.

## 4. Frequência do heartbeat

```text
boot do app (auth + profile liberados)
        |
        v
upsert imediato  (onConflict: user_id,device_id)
  build_hash / build_time / app_version / platform / user_agent / last_seen_at = now()
        |
        v
enquanto o app está aberto e visível:
  a cada 30 min -> update leve de last_seen_at (e do build, se mudou)
        |
        v
após atualização automática (novo bundle carregado):
  novo boot -> upsert imediato com o novo build
```

- Registro imediato na abertura/login; depois apenas 1 update a cada 30 minutos.
- Nada é enviado offline; falhas são silenciosas e não bloqueiam o acesso.

## 5. Regra de classificação

Dispositivo é considerado **ativo** se `last_seen_at >= now() - JANELA`, com `JANELA` configurável e inicialmente **30 dias**. Dispositivos fora da janela são ignorados na classificação (um celular parado há meses não deixa o usuário eternamente desatualizado).

Status do dispositivo ativo:
- Atualizado: `build_hash` = build publicado atual
- Compatível: `build_time >= minBuildTime`, mas hash diferente do atual
- Desatualizado: `build_time < minBuildTime`

Status do usuário (agregado dos dispositivos ativos):
- Sem informação: nenhum heartbeat / nenhum dispositivo ativo
- Desatualizado: pelo menos um dispositivo ativo abaixo do build mínimo
- Compatível: nenhum abaixo do mínimo, mas existe dispositivo em build anterior ao atual
- Atualizado: todos os dispositivos ativos no build atual

## 6. Tela administrativa

Rota `/versoes-usuarios`, item "Versões dos Usuários" em Administração (admin/manager).

Cards do topo:

```text
Build publicado atual        Build mínimo obrigatório
o8koi43l (v2026.08.07.1305)  o8koi43l
──────────────────────────────────────────────────────────────
Usuários ativos   100% atualizados   Com dispositivo desatualizado
Dispositivos atualizados   Dispositivos desatualizados   Sem informação
```

Build publicado atual e build mínimo ficam em cards separados e rotulados: compatível não significa estar na última versão.

Tabela principal — uma linha por usuário:

Usuário · Filial · Perfil · Último acesso · Build mais recente · Status

Linha expansível mostrando os dispositivos do usuário:

Dispositivo (id curto) · Plataforma · Build · Última atividade · Status

Filtros: status, filial, perfil, busca por nome/e-mail. Janela de atividade ajustável (padrão 30 dias).

## 7. Fora de escopo

Nenhum mecanismo novo de atualização. Sem mudanças em auth, RLS existentes, tarefas, checklist, máquinas, mídia, fila offline ou regras de negócio.

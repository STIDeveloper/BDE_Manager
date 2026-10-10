-- ============================================================
-- BDE Manager — Administration des formulaires (serveur)
-- Migration 0003 : temps réel des réponses, évaluations des candidatures
-- côté serveur (grilles, notes, mode aveugle, agrégats), compteurs
-- anonymisés de brouillons (complétion / abandons).
-- ============================================================
-- Prérequis : 0001_init.sql puis 0002_forms.sql déjà exécutées (elles ne
-- sont PAS modifiées). À exécuter dans Supabase › SQL Editor (copier-coller
-- du fichier entier puis « Run »). Idempotent : relançable sans effet de bord.
--
-- Principes :
--  * Temps réel : form_responses est ajoutée à la publication
--    supabase_realtime. Supabase Realtime (postgres_changes) applique la
--    politique RLS de SELECT de l'abonné (son JWT) à chaque changement : seul
--    un compte ayant « forms » ≥ read dans l'espace reçoit les événements ;
--    anon n'a aucun privilège sur la table → rien. Les suppressions physiques
--    sont impossibles (suppression logique) : aucun événement DELETE non
--    filtré ne peut fuiter de données (identité de réplica par défaut = clé).
--  * Évaluations : un évaluateur (forms ≥ write) ne crée / modifie / supprime
--    QUE ses propres évaluations (evaluator = auth.uid(), imposé par trigger
--    et vérifié par RLS). Les évaluations individuelles sont lisibles par
--    leur auteur et par l'administration (forms ≥ write) ; un compte en
--    simple lecture n'obtient que les agrégats (form_evaluation_summary).
--  * Mode aveugle : list_responses_for_evaluation renvoie les réponses SANS
--    identité (aucune colonne respondent_*, ni étiquettes, ni responsable,
--    ni valeurs calculées ; questions nom / e-mail / téléphone / adresse /
--    signature / membre et questions marquées « sensibles » retirées, y
--    compris dans les sections répétables).
--  * Brouillons : seuls des COMPTEURS sont tenus (démarrés, envoyés,
--    expirés), alimentés par trigger ; form_funnel ne renvoie que des nombres.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Capacités « forms » / « tasks » (filet de sécurité : 0002 les crée déjà ;
--    rien n'est écrasé si elles existent)
-- ------------------------------------------------------------
insert into public.capabilities (id, label) values ('forms', 'Formulaires'), ('tasks', 'Tâches')
on conflict (id) do nothing;
insert into public.collection_capabilities (prefix, capability) values ('forms.', 'forms'), ('tasks.', 'tasks')
on conflict (prefix) do nothing;
insert into public.roles_grants (workspace_id, role, capability, level)
select w.id, r.role, r.capability, r.level
from public.workspaces w
cross join (values
  ('owner', 'forms', 'manage'), ('bureau', 'forms', 'write'), ('tresorier', 'forms', 'read'),
  ('membre', 'forms', 'read'), ('lecteur', 'forms', 'read'),
  ('owner', 'tasks', 'manage'), ('bureau', 'tasks', 'write'), ('tresorier', 'tasks', 'write'),
  ('membre', 'tasks', 'read'), ('lecteur', 'tasks', 'read')
) as r(role, capability, level)
on conflict (workspace_id, role, capability) do nothing;

-- ------------------------------------------------------------
-- 1. Temps réel des réponses
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'form_responses') then
    execute 'alter publication supabase_realtime add table public.form_responses';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Évaluations des candidatures
-- ------------------------------------------------------------
create table if not exists public.form_evaluation_grids (
  form_id      uuid primary key references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  criteria     jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array' and octet_length(criteria::text) <= 20000),
  blind        boolean not null default true,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create table if not exists public.form_evaluations (
  id            uuid primary key default gen_random_uuid(),
  response_id   uuid not null references public.form_responses (id) on delete cascade,
  form_id       uuid not null references public.forms (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  evaluator     uuid not null,
  scores        jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object' and octet_length(scores::text) <= 10000),
  comment       text check (comment is null or char_length(comment) <= 2000),
  conflict      boolean not null default false,
  conflict_note text check (conflict_note is null or char_length(conflict_note) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (response_id, evaluator)
);
create index if not exists form_evaluations_form_idx on public.form_evaluations (form_id);
create index if not exists form_evaluations_ws_idx on public.form_evaluations (workspace_id);

-- Grille par défaut (identique à DEFAULT_CRITERIA côté application).
create or replace function public.forms_default_criteria()
returns jsonb language sql immutable set search_path = public as $$
  select '[{"id":"motivation","label":"Motivation","max":5,"weight":1},
           {"id":"disponibilite","label":"Disponibilité","max":5,"weight":1},
           {"id":"experience","label":"Expérience / compétences","max":5,"weight":1},
           {"id":"equipe","label":"Esprit d''équipe","max":5,"weight":1}]'::jsonb
$$;

-- Critères effectifs d'un formulaire (grille enregistrée, sinon défaut).
create or replace function public.forms_eval_criteria(p_form uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select criteria from public.form_evaluation_grids
                   where form_id = p_form and jsonb_array_length(criteria) > 0), public.forms_default_criteria())
$$;

create or replace function public.form_evaluation_grids_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
  v_c jsonb;
begin
  select workspace_id into v_ws from public.forms where id = new.form_id;
  if v_ws is null then raise exception 'Formulaire introuvable' using errcode = 'P0002'; end if;
  if tg_op = 'UPDATE' and new.form_id <> old.form_id then
    raise exception 'Formulaire non modifiable' using errcode = '42501';
  end if;
  new.workspace_id := v_ws;
  if jsonb_array_length(new.criteria) not between 1 and 30 then
    raise exception 'La grille doit contenir de 1 à 30 critères' using errcode = '22023';
  end if;
  for v_c in select * from jsonb_array_elements(new.criteria) loop
    if jsonb_typeof(v_c) <> 'object'
       or coalesce(v_c ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or char_length(btrim(coalesce(v_c ->> 'label', ''))) not between 1 and 80
       or (case when jsonb_typeof(v_c -> 'max') = 'number' then (v_c ->> 'max')::numeric not between 1 and 100 else true end)
       or (case when coalesce(v_c -> 'weight', 'null'::jsonb) = 'null'::jsonb then false
               when jsonb_typeof(v_c -> 'weight') = 'number' then (v_c ->> 'weight')::numeric not between 0 and 100
               else true end) then
      raise exception 'Critère invalide (identifiant, intitulé 1–80 caractères, barème 1–100, coefficient 0–100)' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct e ->> 'id') from jsonb_array_elements(new.criteria) e) <> jsonb_array_length(new.criteria) then
    raise exception 'Deux critères ont le même identifiant' using errcode = '22023';
  end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists form_evaluation_grids_before_write on public.form_evaluation_grids;
create trigger form_evaluation_grids_before_write before insert or update on public.form_evaluation_grids
  for each row execute function public.form_evaluation_grids_before_write();

create or replace function public.form_evaluations_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_form uuid;
  v_ws uuid;
  v_key text;
  v_val jsonb;
  v_crit jsonb;
begin
  if tg_op = 'INSERT' then
    -- L'évaluateur est TOUJOURS le compte connecté (impossible d'écrire au nom d'un autre).
    if auth.uid() is not null then new.evaluator := auth.uid(); end if;
    if new.evaluator is null then raise exception 'Évaluateur inconnu' using errcode = '42501'; end if;
    select form_id, workspace_id into v_form, v_ws from public.form_responses where id = new.response_id;
    if v_form is null then raise exception 'Réponse introuvable' using errcode = 'P0002'; end if;
    new.form_id := v_form;
    new.workspace_id := v_ws;
    new.created_at := clock_timestamp();
  else
    if new.id <> old.id or new.response_id <> old.response_id or new.evaluator <> old.evaluator
       or new.form_id <> old.form_id or new.workspace_id <> old.workspace_id or new.created_at <> old.created_at then
      raise exception 'Champs non modifiables (réponse, évaluateur)' using errcode = '42501';
    end if;
  end if;

  if new.conflict then
    new.scores := '{}'::jsonb;      -- conflit d'intérêts : aucune note
  else
    new.conflict_note := null;
    if (select count(*) from jsonb_object_keys(new.scores)) > 30 then
      raise exception 'Trop de critères notés' using errcode = '22023';
    end if;
    v_crit := public.forms_eval_criteria(new.form_id);
    for v_key, v_val in select * from jsonb_each(new.scores) loop
      if v_val = 'null'::jsonb then continue; end if;
      if (case when jsonb_typeof(v_val) = 'number'
              then (v_val #>> '{}')::numeric < 0
                or (v_val #>> '{}')::numeric > coalesce((select (c ->> 'max')::numeric from jsonb_array_elements(v_crit) c where c ->> 'id' = v_key), -1)
              else true end) then
        raise exception 'Note invalide pour le critère « % » (critère inconnu ou hors barème)', left(v_key, 40) using errcode = '22023';
      end if;
    end loop;
  end if;
  new.comment := nullif(btrim(coalesce(new.comment, '')), '');
  new.conflict_note := nullif(btrim(coalesce(new.conflict_note, '')), '');
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists form_evaluations_before_write on public.form_evaluations;
create trigger form_evaluations_before_write before insert or update on public.form_evaluations
  for each row execute function public.form_evaluations_before_write();

-- Note /20 d'une évaluation selon la grille (critères non notés ignorés ;
-- même calcul que evaluationTotal côté application).
create or replace function public.forms_eval_total(p_scores jsonb, p_criteria jsonb)
returns numeric language sql immutable set search_path = public as $$
  select case when sum((c ->> 'max')::numeric * coalesce((c ->> 'weight')::numeric, 1)) > 0
    then sum(least(greatest((p_scores ->> (c ->> 'id'))::numeric, 0), (c ->> 'max')::numeric) * coalesce((c ->> 'weight')::numeric, 1))
         / sum((c ->> 'max')::numeric * coalesce((c ->> 'weight')::numeric, 1)) * 20 end
  from jsonb_array_elements(p_criteria) c
  where jsonb_typeof(p_scores -> (c ->> 'id')) = 'number'
$$;

-- Agrégats par réponse (forms ≥ read) : { <response_id>: { n, mean, sd, conflicts } }
-- n, moyenne et écart-type (échantillon) excluent les conflits d'intérêts.
create or replace function public.form_evaluation_summary(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid;
  v_crit jsonb;
begin
  select workspace_id into v_ws from public.forms where id = p_form;
  if v_ws is null or not public.has_capability(v_ws, 'forms', 'read') then
    raise exception 'Droit « formulaires » en lecture requis' using errcode = '42501';
  end if;
  v_crit := public.forms_eval_criteria(p_form);
  return coalesce((
    select jsonb_object_agg(response_id, jsonb_build_object(
      'n', n, 'mean', round(mean, 4),
      'sd', case when n > 1 then round(sd, 4) when n = 1 then 0 end,
      'conflicts', conflicts))
    from (
      select e.response_id,
             count(t.total) filter (where not e.conflict) as n,
             avg(t.total) filter (where not e.conflict) as mean,
             stddev_samp(t.total) filter (where not e.conflict) as sd,
             count(*) filter (where e.conflict) as conflicts
      from public.form_evaluations e
      cross join lateral (select public.forms_eval_total(e.scores, v_crit) as total) t
      where e.form_id = p_form
      group by e.response_id) s), '{}'::jsonb);
end $$;

-- Clés des questions d'identité (et « sensibles ») d'une définition.
create or replace function public.forms_identity_keys(p_def jsonb)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(q ->> 'key'), '{}')
  from public.forms_questions(p_def) q
  where q ->> 'type' in ('name', 'email', 'phone', 'address', 'signature', 'member_picker')
     or coalesce(q ->> 'sensitive', 'false') = 'true'
$$;

-- Retire ces clés des réponses (niveau racine et lignes des sections répétables).
create or replace function public.forms_strip_identity(p_answers jsonb, p_keys text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k,
    case when jsonb_typeof(v) = 'array' then
      (select coalesce(jsonb_agg(case when jsonb_typeof(e) = 'object' then e - p_keys else e end order by o), '[]'::jsonb)
       from jsonb_array_elements(v) with ordinality as x(e, o))
    else v end), '{}'::jsonb)
  from jsonb_each(coalesce(p_answers, '{}'::jsonb)) as a(k, v)
  where not (k = any (p_keys))
$$;

-- Réponses pour l'évaluation à l'aveugle (forms ≥ read) : aucune identité.
create or replace function public.list_responses_for_evaluation(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.forms where id = p_form;
  if v_ws is null or not public.has_capability(v_ws, 'forms', 'read') then
    raise exception 'Droit « formulaires » en lecture requis' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'status', r.status,
      'answers', public.forms_strip_identity(r.answers, k.keys),
      'score', r.score, 'waitlisted', r.waitlisted, 'created_at', r.created_at) order by r.created_at)
    from (select * from public.form_responses where form_id = p_form and deleted_at is null
          order by created_at limit 5000) r
    join (select version, public.forms_identity_keys(definition) as keys from public.form_versions where form_id = p_form) k
      on k.version = r.version), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------
-- 3. Compteurs anonymisés de brouillons (complétion / abandons)
-- ------------------------------------------------------------
create table if not exists public.form_draft_counters (
  form_id   uuid primary key references public.forms (id) on delete cascade,
  started   int not null default 0 check (started >= 0),     -- brouillons créés
  converted int not null default 0 check (converted >= 0),   -- brouillons consommés par un envoi
  expired   int not null default 0 check (expired >= 0),     -- brouillons expirés (30 j) sans envoi
  since     timestamptz not null default now()               -- début du comptage
);

create or replace function public.form_drafts_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.form_draft_counters as c (form_id, started) values (new.form_id, 1)
      on conflict (form_id) do update set started = c.started + 1;
    return null;
  end if;
  -- Suppression : envoi définitif (forms_delete_draft) ou purge d'un brouillon expiré.
  if not exists (select 1 from public.forms where id = old.form_id) then return null; end if;   -- formulaire supprimé
  if old.expires_at <= now() then
    insert into public.form_draft_counters as c (form_id, started, expired) values (old.form_id, 1, 1)
      on conflict (form_id) do update set expired = c.expired + 1;
  else
    insert into public.form_draft_counters as c (form_id, started, converted) values (old.form_id, 1, 1)
      on conflict (form_id) do update set converted = c.converted + 1;
  end if;
  return null;
end $$;

-- Brouillons déjà présents à l'installation : comptés comme démarrés.
insert into public.form_draft_counters (form_id, started)
select form_id, count(*) from public.form_drafts group by form_id
on conflict (form_id) do nothing;

drop trigger if exists form_drafts_count on public.form_drafts;
create trigger form_drafts_count after insert or delete on public.form_drafts
  for each row execute function public.form_drafts_count();

-- Entonnoir (forms ≥ read) : nombres uniquement, aucune donnée de réponse.
create or replace function public.form_funnel(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_form public.forms%rowtype;
  v_c public.form_draft_counters%rowtype;
  v_active int;
  v_stale int;
  v_sub int;
  v_drafts boolean;
  v_abandoned int;
begin
  select * into v_form from public.forms where id = p_form;
  if not found or not public.has_capability(v_form.workspace_id, 'forms', 'read') then
    raise exception 'Droit « formulaires » en lecture requis' using errcode = '42501';
  end if;
  select * into v_c from public.form_draft_counters where form_id = p_form;
  select count(*) filter (where updated_at >= now() - interval '24 hours' and expires_at > now()),
         count(*) filter (where updated_at < now() - interval '24 hours' or expires_at <= now())
    into v_active, v_stale
    from public.form_drafts where form_id = p_form;
  select count(*) into v_sub from public.form_responses where form_id = p_form and deleted_at is null;
  select coalesce((definition #>> '{settings,saveDraft}')::boolean, false) into v_drafts
    from public.form_versions where form_id = p_form and version = v_form.current_version;
  v_abandoned := v_stale + coalesce(v_c.expired, 0);
  return jsonb_build_object(
    'drafts_enabled', coalesce(v_drafts, false),
    'since', v_c.since,
    'started', coalesce(v_c.started, 0),
    'in_progress', v_active,
    'abandoned', v_abandoned,
    'submitted_from_draft', coalesce(v_c.converted, 0),
    'submissions', v_sub,
    'completion_rate', case when coalesce(v_c.started, 0) > 0 then round(100.0 * v_c.converted / v_c.started, 1) end,
    'abandon_rate', case when coalesce(v_c.started, 0) > 0 then round(100.0 * v_abandoned / v_c.started, 1) end);
end $$;

-- ------------------------------------------------------------
-- 4. Row Level Security
-- ------------------------------------------------------------
alter table public.form_evaluation_grids enable row level security;
alter table public.form_evaluations enable row level security;
alter table public.form_draft_counters enable row level security;

drop policy if exists form_evaluation_grids_read on public.form_evaluation_grids;
create policy form_evaluation_grids_read on public.form_evaluation_grids for select to authenticated
  using (public.has_capability(workspace_id, 'forms', 'read'));
drop policy if exists form_evaluation_grids_insert on public.form_evaluation_grids;
create policy form_evaluation_grids_insert on public.form_evaluation_grids for insert to authenticated
  with check (public.has_capability(workspace_id, 'forms', 'write'));
drop policy if exists form_evaluation_grids_update on public.form_evaluation_grids;
create policy form_evaluation_grids_update on public.form_evaluation_grids for update to authenticated
  using (public.has_capability(workspace_id, 'forms', 'write'))
  with check (public.has_capability(workspace_id, 'forms', 'write'));

-- Lecture : ses propres évaluations, ou toutes si forms ≥ write (comité).
drop policy if exists form_evaluations_read on public.form_evaluations;
create policy form_evaluations_read on public.form_evaluations for select to authenticated
  using ((evaluator = auth.uid() and public.is_member(workspace_id)) or public.has_capability(workspace_id, 'forms', 'write'));
drop policy if exists form_evaluations_insert on public.form_evaluations;
create policy form_evaluations_insert on public.form_evaluations for insert to authenticated
  with check (evaluator = auth.uid() and public.has_capability(workspace_id, 'forms', 'write'));
drop policy if exists form_evaluations_update on public.form_evaluations;
create policy form_evaluations_update on public.form_evaluations for update to authenticated
  using (evaluator = auth.uid() and public.has_capability(workspace_id, 'forms', 'write'))
  with check (evaluator = auth.uid() and public.has_capability(workspace_id, 'forms', 'write'));
drop policy if exists form_evaluations_delete on public.form_evaluations;
create policy form_evaluations_delete on public.form_evaluations for delete to authenticated
  using (evaluator = auth.uid() and public.has_capability(workspace_id, 'forms', 'write'));
-- form_draft_counters : AUCUNE politique → RPC form_funnel uniquement.

-- ------------------------------------------------------------
-- 5. Privilèges (Supabase accorde par défaut tout aux nouveaux objets)
-- ------------------------------------------------------------
revoke all on public.form_evaluation_grids, public.form_evaluations, public.form_draft_counters from anon, authenticated, public;
grant select on public.form_evaluation_grids, public.form_evaluations to authenticated;
grant insert (form_id, criteria, blind), update (form_id, criteria, blind) on public.form_evaluation_grids to authenticated;
grant insert (response_id, form_id, evaluator, scores, comment, conflict, conflict_note),
      update (response_id, form_id, evaluator, scores, comment, conflict, conflict_note) on public.form_evaluations to authenticated;
grant delete on public.form_evaluations to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.form_evaluation_grids, public.form_evaluations, public.form_draft_counters to service_role';
  end if;
end $$;

do $$
declare
  r record;
  v_internal text[] := array['forms_default_criteria', 'forms_eval_criteria', 'forms_eval_total', 'forms_identity_keys',
    'forms_strip_identity', 'form_evaluation_grids_before_write', 'form_evaluations_before_write', 'form_drafts_count',
    'form_evaluation_summary', 'list_responses_for_evaluation', 'form_funnel'];
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (v_internal) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- RPC exposées aux comptes connectés (droits vérifiés à l'intérieur).
grant execute on function public.form_evaluation_summary(uuid), public.list_responses_for_evaluation(uuid),
  public.form_funnel(uuid) to authenticated;
-- Fonctions de triggers des tables écrites directement (comme 0001 / 0002).
grant execute on function public.form_evaluation_grids_before_write(), public.form_evaluations_before_write() to authenticated;

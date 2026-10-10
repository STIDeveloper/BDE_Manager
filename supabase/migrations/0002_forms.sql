-- ============================================================
-- BDE Manager — Studio Formulaires (serveur)
-- Migration 0002 : formulaires publiés, réponses, brouillons, vote anonyme,
-- automatisations (file d'attente), limitation de débit, stockage.
-- ============================================================
-- Prérequis : 0001_init.sql déjà exécutée. À exécuter dans Supabase ›
-- SQL Editor (copier-coller du fichier entier puis « Run »). Idempotent.
--
-- Principes :
--  * Les définitions de formulaires (brouillons) vivent dans l'application
--    (collection forms.*). PUBLIER fige une copie immuable (form_versions).
--  * Aucun accès anonyme direct aux tables : tout passe par la fonction Edge
--    forms-submit (clé de service, côté serveur) ou par des RPC contrôlées.
--  * Vote anonyme : identité (vote_rolls), droit consommé (vote_rights) et
--    bulletin (vote_ballots) sont stockés SANS colonne commune ni horodatage
--    précis ; aucun rôle applicatif ne peut lire ces tables.
--  * Toutes les fonctions sont « security definer » avec search_path fixé.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Capacités « forms » et « tasks », droits par défaut
-- ------------------------------------------------------------
insert into public.capabilities (id, label) values
  ('forms', 'Formulaires'), ('tasks', 'Tâches')
on conflict (id) do update set label = excluded.label;

insert into public.collection_capabilities (prefix, capability) values
  ('forms.', 'forms'), ('tasks.', 'tasks')
on conflict (prefix) do update set capability = excluded.capability;

-- Droits par défaut des NOUVEAUX espaces (remplace la version de 0001 :
-- identique, plus forms / tasks pour trésorier, membre).
create or replace function public.seed_default_grants(p_ws uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.roles_grants (workspace_id, role, capability, level)
  select p_ws, r.role, c.id,
    case r.role
      when 'owner' then 'manage'
      when 'bureau' then case c.id when 'admin' then 'read' else 'write' end
      when 'tresorier' then case c.id
        when 'finance' then 'validate' when 'membership' then 'write' when 'documents' then 'write'
        when 'members' then 'read' when 'organization' then 'read' when 'catalog' then 'read'
        when 'events' then 'read' when 'calendar' then 'read' when 'drive' then 'read'
        when 'handover' then 'read' when 'forms' then 'read' when 'tasks' then 'write' else 'none' end
      when 'membre' then case c.id
        when 'events' then 'read' when 'calendar' then 'read' when 'documents' then 'read'
        when 'organization' then 'read' when 'catalog' then 'read'
        when 'forms' then 'read' when 'tasks' then 'read' else 'none' end
      when 'lecteur' then case c.id
        when 'vault' then 'none' when 'recruitment' then 'none' when 'admin' then 'none' else 'read' end
    end
  from (values ('owner'), ('bureau'), ('tresorier'), ('membre'), ('lecteur')) as r(role)
  cross join public.capabilities c
  on conflict (workspace_id, role, capability) do nothing;
end $$;

-- Espaces EXISTANTS : ajout des droits manquants (ne remplace jamais un
-- réglage fait par le propriétaire → relançable sans effet de bord).
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
-- 1. Outils
-- ------------------------------------------------------------
create or replace function public.forms_sha256(p text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;

-- 64 caractères hexadécimaux aléatoires (2 × 122 bits de gen_random_uuid).
create or replace function public.forms_random_token()
returns text language sql volatile set search_path = public as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- Clé d'électeur : empreinte propre au formulaire (aucune réutilisation
-- d'un vote à l'autre). p_subject = 'user:<uuid>' ou 'email:<adresse>'.
create or replace function public.forms_voter_key(p_form uuid, p_subject text)
returns text language sql immutable set search_path = public as $$
  select public.forms_sha256(p_form::text || '|' || lower(btrim(p_subject)))
$$;

create or replace function public.forms_parse_ts(p text)
returns timestamptz language plpgsql stable set search_path = public as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return p::timestamptz;
exception when others then return null;
end $$;

-- Toutes les questions d'une définition (pages, sections, colonnes).
create or replace function public.forms_questions(p_def jsonb)
returns setof jsonb language sql immutable set search_path = public as $$
  select q from jsonb_path_query(coalesce(p_def -> 'pages', '[]'::jsonb), 'strict $.**') q
  where jsonb_typeof(q) = 'object' and q ->> 'kind' = 'question' and q ? 'key'
$$;

-- Retire d'une définition ce qui ne doit jamais être servi au public :
-- destinataires des notifications, liste électorale, bonnes réponses d'un quiz.
create or replace function public.forms_strip_answers(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_out jsonb;
  v_key text;
  v_val jsonb;
begin
  if jsonb_typeof(p) = 'array' then
    select coalesce(jsonb_agg(public.forms_strip_answers(e) order by o), '[]'::jsonb) into v_out
      from jsonb_array_elements(p) with ordinality as t(e, o);
    return v_out;
  elsif jsonb_typeof(p) = 'object' then
    v_out := '{}'::jsonb;
    for v_key, v_val in select * from jsonb_each(p) loop
      if v_key = 'score' and p ->> 'kind' = 'question' and jsonb_typeof(v_val) = 'object' then
        v_out := v_out || jsonb_build_object(v_key, v_val - 'correct' - 'perOption');
      else
        v_out := v_out || jsonb_build_object(v_key, public.forms_strip_answers(v_val));
      end if;
    end loop;
    return v_out;
  end if;
  return p;
end $$;

create or replace function public.forms_public_definition(p_def jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select public.forms_strip_answers(
    (p_def - 'automations' - 'createdBy')
      #- '{settings,notifications}' #- '{settings,vote,list}' #- '{settings,invited}')
$$;

-- Validation SQL basique d'une définition (le moteur fait le reste).
create or replace function public.forms_validate_definition(p_def jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare
  v_keys text[];
  v_kind text := coalesce(p_def ->> 'kind', 'standard');
begin
  if p_def is null or jsonb_typeof(p_def) <> 'object' then
    raise exception 'Définition invalide (objet JSON attendu)' using errcode = '22023';
  end if;
  if octet_length(p_def::text) > 1000000 then
    raise exception 'Définition trop volumineuse (1 Mo maximum)' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_def ->> 'title', ''))) not between 1 and 200 then
    raise exception 'Titre du formulaire requis (1 à 200 caractères)' using errcode = '22023';
  end if;
  if v_kind not in ('standard', 'registration', 'application', 'vote', 'booking', 'quiz', 'survey') then
    raise exception 'Type de formulaire inconnu' using errcode = '22023';
  end if;
  if jsonb_typeof(p_def -> 'pages') is distinct from 'array' or jsonb_array_length(p_def -> 'pages') not between 1 and 50 then
    raise exception 'Le formulaire doit contenir de 1 à 50 pages' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_def -> 'pages') pg
             where jsonb_typeof(pg) <> 'object' or jsonb_typeof(pg -> 'items') is distinct from 'array') then
    raise exception 'Page invalide (liste d''éléments attendue)' using errcode = '22023';
  end if;
  select array_agg(q ->> 'key') into v_keys from public.forms_questions(p_def) q;
  if coalesce(array_length(v_keys, 1), 0) = 0 then
    raise exception 'Le formulaire ne contient aucune question' using errcode = '22023';
  end if;
  if array_length(v_keys, 1) > 500 then
    raise exception 'Trop de questions (500 maximum)' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_keys) k where k is null or k !~ '^[a-z][a-z0-9_]{0,48}$') then
    raise exception 'Clé de question invalide (lettres minuscules, chiffres, _)' using errcode = '22023';
  end if;
  if (select count(distinct k) from unnest(v_keys) k) <> array_length(v_keys, 1) then
    raise exception 'Deux questions ont la même clé' using errcode = '22023';
  end if;
  if coalesce(p_def #>> '{settings,access}', 'link') not in ('public', 'link', 'members', 'invited') then
    raise exception 'Mode d''accès invalide' using errcode = '22023';
  end if;
  if coalesce(p_def #>> '{settings,identity}', 'anonymous') not in ('anonymous', 'optional', 'required') then
    raise exception 'Mode d''identification invalide' using errcode = '22023';
  end if;
  if v_kind = 'vote' then
    if coalesce(p_def #>> '{settings,vote,electoralRoll}', 'members') not in ('members', 'list') then
      raise exception 'Liste électorale invalide' using errcode = '22023';
    end if;
    if coalesce(p_def #>> '{settings,vote,majority}', 'simple') not in ('simple', 'absolute', 'two_thirds') then
      raise exception 'Règle de majorité invalide' using errcode = '22023';
    end if;
    if coalesce(p_def #>> '{settings,vote,resultsVisibility}', 'after_close') not in ('after_close', 'live', 'admins') then
      raise exception 'Visibilité des résultats invalide' using errcode = '22023';
    end if;
    if exists (select 1 from public.forms_questions(p_def) q
               where q ->> 'type' not in ('single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'ranking')) then
      raise exception 'Un vote ne peut contenir que des questions à choix (choix unique, multiple, liste, oui/non, classement)' using errcode = '22023';
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------
create table if not exists public.forms (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  client_id       text check (client_id is null or char_length(client_id) between 1 and 200),  -- id du brouillon dans l'app
  slug            text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  title           text not null check (char_length(title) between 1 and 200),
  kind            text not null default 'standard'
                  check (kind in ('standard', 'registration', 'application', 'vote', 'booking', 'quiz', 'survey')),
  status          text not null default 'published' check (status in ('draft', 'published', 'closed', 'archived')),
  access          text not null default 'link' check (access in ('public', 'link', 'members', 'invited')),
  identity        text not null default 'anonymous' check (identity in ('anonymous', 'optional', 'required')),
  current_version int not null default 0 check (current_version >= 0),
  opens_at        timestamptz,
  closes_at       timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, client_id)
);
create index if not exists forms_ws_idx on public.forms (workspace_id);

create table if not exists public.form_versions (
  form_id      uuid not null references public.forms (id) on delete cascade,
  version      int not null check (version >= 1),
  definition   jsonb not null check (octet_length(definition::text) <= 1000000),
  published_at timestamptz not null default now(),
  published_by uuid,
  primary key (form_id, version)
);

create table if not exists public.form_responses (
  id                uuid primary key default gen_random_uuid(),
  form_id           uuid not null references public.forms (id) on delete cascade,
  version           int not null,
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  status            text not null default 'received' check (status ~ '^[A-Za-z0-9_-]{1,40}$'),
  answers           jsonb not null default '{}'::jsonb check (octet_length(answers::text) <= 512000),
  computed          jsonb not null default '{}'::jsonb check (octet_length(computed::text) <= 128000),
  score             numeric,
  respondent_user   uuid,
  respondent_member text check (respondent_member is null or char_length(respondent_member) <= 200),
  respondent_email  text check (respondent_email is null or char_length(respondent_email) <= 254),
  edit_token_hash   text unique,
  waitlisted        boolean not null default false,
  payment_status    text check (payment_status is null or payment_status in ('none', 'pending', 'paid', 'failed', 'refunded', 'manual')),
  payment_ref       text,
  payment_amount_cents int check (payment_amount_cents is null or payment_amount_cents >= 0),
  tags              text[] not null default '{}' check (cardinality(tags) <= 30),
  assignee          text check (assignee is null or char_length(assignee) <= 200),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  foreign key (form_id, version) references public.form_versions (form_id, version)
);
create index if not exists form_responses_form_idx on public.form_responses (form_id, created_at desc);
create index if not exists form_responses_ws_idx on public.form_responses (workspace_id);
create index if not exists form_responses_user_idx on public.form_responses (respondent_user) where respondent_user is not null;
create index if not exists form_responses_payment_idx on public.form_responses (payment_ref) where payment_ref is not null;

create table if not exists public.form_response_events (
  id           bigint generated always as identity primary key,
  response_id  uuid not null references public.form_responses (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  at           timestamptz not null default now(),
  actor        uuid,
  action       text not null check (char_length(action) <= 40),
  payload      jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 20000)
);
create index if not exists form_response_events_resp_idx on public.form_response_events (response_id, at);

create table if not exists public.form_drafts (
  token_hash text primary key,
  form_id    uuid not null references public.forms (id) on delete cascade,
  answers    jsonb not null default '{}'::jsonb check (octet_length(answers::text) <= 256000),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists form_drafts_form_idx on public.form_drafts (form_id);

-- Vote : trois tables SANS colonne commune autre que form_id.
create table if not exists public.vote_rolls (
  form_id        uuid not null references public.forms (id) on delete cascade,
  voter_key_hash text not null,
  primary key (form_id, voter_key_hash)
);
create table if not exists public.vote_rights (
  form_id        uuid not null references public.forms (id) on delete cascade,
  voter_key_hash text not null,
  used_at        date not null default current_date,   -- au jour près, volontairement
  primary key (form_id, voter_key_hash)
);
create table if not exists public.vote_ballots (
  id           uuid primary key default gen_random_uuid(),   -- aléatoire : aucun ordre exploitable
  form_id      uuid not null references public.forms (id) on delete cascade,
  choices      jsonb not null check (octet_length(choices::text) <= 20000),
  receipt_hash text not null unique,
  batch_day    date not null default current_date
);
create index if not exists vote_ballots_form_idx on public.vote_ballots (form_id);

create table if not exists public.automations (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  form_id           uuid references public.forms (id) on delete cascade,
  name              text check (name is null or char_length(name) <= 200),
  trigger           jsonb not null default '{}'::jsonb check (octet_length(trigger::text) <= 20000),
  conditions        jsonb not null default '[]'::jsonb check (octet_length(conditions::text) <= 50000),
  actions           jsonb not null default '[]'::jsonb check (octet_length(actions::text) <= 100000),
  requires_approval boolean not null default false,
  enabled           boolean not null default true,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists automations_ws_idx on public.automations (workspace_id);

create table if not exists public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  response_id   uuid references public.form_responses (id) on delete cascade,
  event         text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null check (status in ('pending_approval', 'queued', 'claimed', 'done', 'failed', 'cancelled')),
  result        jsonb check (result is null or octet_length(result::text) <= 20000),
  attempts      int not null default 0,
  claimed_at    timestamptz,
  claimed_by    uuid,
  approved_by   uuid,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists automation_runs_ws_status_idx on public.automation_runs (workspace_id, status, created_at);

create table if not exists public.rate_limits (
  key_hash     text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key_hash, window_start)
);

-- ------------------------------------------------------------
-- 3. Règles et journaux (triggers)
-- ------------------------------------------------------------
-- Une version publiée est immuable.
create or replace function public.form_versions_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Une version publiée est immuable : publie une nouvelle version' using errcode = '42501';
end $$;
drop trigger if exists form_versions_immutable on public.form_versions;
create trigger form_versions_immutable before update on public.form_versions
  for each row execute function public.form_versions_immutable();

-- Enregistre les déclenchements d'automatisations (exécutés par l'app).
create or replace function public.forms_enqueue_runs(p_response public.form_responses, p_event text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.automation_runs (automation_id, workspace_id, response_id, event, payload, status)
  select a.id, a.workspace_id, p_response.id, p_event, coalesce(p_payload, '{}'::jsonb),
         case when a.requires_approval then 'pending_approval' else 'queued' end
  from public.automations a
  where a.workspace_id = p_response.workspace_id and a.enabled
    and (a.form_id is null or a.form_id = p_response.form_id)
    and a.trigger ->> 'event' = p_event
    and (a.trigger ->> 'status' is null or a.trigger ->> 'status' = p_payload ->> 'to');
end $$;

create or replace function public.form_responses_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id or new.form_id <> old.form_id or new.workspace_id <> old.workspace_id
     or new.version <> old.version or new.created_at <> old.created_at then
    raise exception 'Champs non modifiables' using errcode = '42501';
  end if;
  -- Les administrateurs (rôle authenticated) ne modifient ni les réponses
  -- ni l'identité du répondant : seulement le traitement.
  if auth.uid() is not null and (
       new.answers is distinct from old.answers or new.computed is distinct from old.computed
    or new.score is distinct from old.score or new.respondent_user is distinct from old.respondent_user
    or new.respondent_email is distinct from old.respondent_email or new.edit_token_hash is distinct from old.edit_token_hash
    or new.payment_ref is distinct from old.payment_ref or new.payment_amount_cents is distinct from old.payment_amount_cents) then
    raise exception 'Les réponses elles-mêmes ne sont pas modifiables par l''administration' using errcode = '42501';
  end if;
  if auth.uid() is not null and new.payment_status is distinct from old.payment_status
     and new.payment_status not in ('manual', 'refunded', 'none') then
    raise exception 'Seul le serveur de paiement peut marquer une réponse comme payée (utilise « réglé hors ligne »)' using errcode = '42501';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists form_responses_before_update on public.form_responses;
create trigger form_responses_before_update before update on public.form_responses
  for each row execute function public.form_responses_before_update();

create or replace function public.form_responses_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, 'submitted', jsonb_build_object('version', new.version, 'waitlisted', new.waitlisted));
    perform public.forms_enqueue_runs(new, 'response.created', jsonb_build_object('to', new.status));
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, 'status', jsonb_build_object('from', old.status, 'to', new.status));
    perform public.forms_enqueue_runs(new, 'response.status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.answers is distinct from old.answers then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, 'edited', '{}'::jsonb);
    perform public.forms_enqueue_runs(new, 'response.updated', '{}'::jsonb);
  end if;
  if new.tags is distinct from old.tags then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, 'tags', jsonb_build_object('from', to_jsonb(old.tags), 'to', to_jsonb(new.tags)));
  end if;
  if new.assignee is distinct from old.assignee then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, 'assignee', jsonb_build_object('from', old.assignee, 'to', new.assignee));
  end if;
  if new.waitlisted is distinct from old.waitlisted then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, 'waitlist', jsonb_build_object('to', new.waitlisted));
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, case when new.deleted_at is null then 'restored' else 'deleted' end, '{}'::jsonb);
  end if;
  if new.payment_status is distinct from old.payment_status then
    insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
      values (new.id, new.workspace_id, v_actor, 'payment', jsonb_build_object('from', old.payment_status, 'to', new.payment_status));
    if new.payment_status in ('paid', 'manual') then
      perform public.forms_enqueue_runs(new, 'payment.paid',
        jsonb_build_object('to', new.payment_status, 'amount_cents', new.payment_amount_cents, 'ref', new.payment_ref));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists form_responses_after_write on public.form_responses;
create trigger form_responses_after_write after insert or update on public.form_responses
  for each row execute function public.form_responses_after_write();

create or replace function public.automations_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.form_id is not null and not exists (select 1 from public.forms where id = new.form_id and workspace_id = new.workspace_id) then
    raise exception 'Formulaire d''un autre espace' using errcode = '42501';
  end if;
  if jsonb_typeof(new.trigger) <> 'object' or coalesce(new.trigger ->> 'event', '') not in
     ('response.created', 'response.updated', 'response.status_changed', 'payment.paid') then
    raise exception 'Déclencheur invalide (response.created, response.updated, response.status_changed, payment.paid)' using errcode = '22023';
  end if;
  if jsonb_typeof(new.actions) <> 'array' or jsonb_typeof(new.conditions) not in ('array', 'object') then
    raise exception 'Actions (liste) ou conditions invalides' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists automations_before_write on public.automations;
create trigger automations_before_write before insert or update on public.automations
  for each row execute function public.automations_before_write();

-- ------------------------------------------------------------
-- 4. Statistiques, ouverture, éligibilité
-- ------------------------------------------------------------
create or replace function public.forms_is_open(p_form public.forms)
returns boolean language sql stable set search_path = public as $$
  select p_form.status = 'published'
     and (p_form.opens_at is null or p_form.opens_at <= now())
     and (p_form.closes_at is null or p_form.closes_at > now())
$$;

-- Compteurs publics (aucune donnée de réponse) : total, liste d'attente,
-- compteurs par option des questions à capacité limitée. p_exclude : réponse
-- à ignorer (modification d'une réponse existante).
create or replace function public.forms_stats(p_form uuid, p_def jsonb, p_exclude uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_total int;
  v_wait int;
  v_by jsonb := '{}'::jsonb;
  v_q jsonb;
  v_counts jsonb;
  v_max int;
begin
  select count(*) filter (where not waitlisted), count(*) filter (where waitlisted)
    into v_total, v_wait
    from public.form_responses where form_id = p_form and deleted_at is null and id is distinct from p_exclude;
  for v_q in select q from public.forms_questions(p_def) q
             where q ->> 'type' = 'slots'
                or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' else '[]'::jsonb end) o
                           where o ? 'capacity') loop
    select coalesce(jsonb_object_agg(val, n), '{}'::jsonb) into v_counts from (
      select val, count(*) as n
      from public.form_responses r,
        lateral jsonb_array_elements_text(case coalesce(jsonb_typeof(r.answers -> (v_q ->> 'key')), 'absent')
          when 'array' then r.answers -> (v_q ->> 'key')
          when 'string' then jsonb_build_array(r.answers -> (v_q ->> 'key'))
          when 'number' then jsonb_build_array(r.answers -> (v_q ->> 'key'))
          when 'boolean' then jsonb_build_array(r.answers -> (v_q ->> 'key'))
          else '[]'::jsonb end) as val
      where r.form_id = p_form and r.deleted_at is null and not r.waitlisted and r.id is distinct from p_exclude
        and val is not null
      group by val) s;
    v_by := v_by || jsonb_build_object(v_q ->> 'key', v_counts);
  end loop;
  v_max := case when (p_def #>> '{settings,maxResponses}') ~ '^\d{1,9}$' then (p_def #>> '{settings,maxResponses}')::int end;
  return jsonb_build_object(
    'total', v_total, 'waitlisted', v_wait, 'optionCounts', v_by,
    'maxResponses', v_max,
    'remaining', case when v_max is null then null else greatest(v_max - v_total, 0) end,
    'full', v_max is not null and v_total >= v_max,
    'waitlist', coalesce((p_def #>> '{settings,waitlist}')::boolean, false));
end $$;

-- Empreinte de l'état des réponses (contrôle de concurrence optimiste).
create or replace function public.forms_fingerprint(p_form uuid)
returns text language sql stable security definer set search_path = public as $$
  select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
  from public.form_responses where form_id = p_form
$$;

-- Éligibilité d'un utilisateur à un formulaire « members » / « invited ».
create or replace function public.forms_user_eligible(p_form public.forms, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_email text;
begin
  if p_form.access in ('public', 'link') then return true; end if;
  if p_user is null then return false; end if;
  if p_form.access = 'members' then
    return exists (select 1 from public.workspace_members where workspace_id = p_form.workspace_id and user_id = p_user);
  end if;
  -- invited : liste (vote_rolls) ou membre de l'espace pour une élection « members »
  select lower(email) into v_email from auth.users where id = p_user;
  return exists (select 1 from public.vote_rolls where form_id = p_form.id
                 and voter_key_hash in (public.forms_voter_key(p_form.id, 'user:' || p_user::text),
                                        public.forms_voter_key(p_form.id, 'email:' || coalesce(v_email, ''))));
end $$;

-- ------------------------------------------------------------
-- 5. Publication (administration)
-- ------------------------------------------------------------
create or replace function public.forms_sync_roll(p_form public.forms, p_def jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_list jsonb;
  v_keys text[];
begin
  if p_form.kind = 'vote' and coalesce(p_def #>> '{settings,vote,electoralRoll}', 'members') = 'members' then
    select array_agg(public.forms_voter_key(p_form.id, 'user:' || user_id::text)) into v_keys
      from public.workspace_members where workspace_id = p_form.workspace_id;
  elsif p_form.kind = 'vote' or p_form.access = 'invited' then
    v_list := coalesce(p_def #> '{settings,vote,list}', p_def #> '{settings,invited}', '[]'::jsonb);
    if jsonb_typeof(v_list) <> 'array' then v_list := '[]'::jsonb; end if;
    if jsonb_array_length(v_list) > 5000 then raise exception 'Liste trop longue (5000 adresses maximum)' using errcode = '22023'; end if;
    select array_agg(distinct public.forms_voter_key(p_form.id, 'email:' || lower(btrim(e))))
      into v_keys from jsonb_array_elements_text(v_list) e where e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  else
    return;
  end if;
  v_keys := coalesce(v_keys, '{}');
  insert into public.vote_rolls (form_id, voter_key_hash) select p_form.id, k from unnest(v_keys) k
    on conflict do nothing;
  -- Retire les inscrits supprimés de la liste, sauf s'ils ont déjà voté.
  delete from public.vote_rolls r where r.form_id = p_form.id and not (r.voter_key_hash = any (v_keys))
    and not exists (select 1 from public.vote_rights v where v.form_id = r.form_id and v.voter_key_hash = r.voter_key_hash);
end $$;

create or replace function public.publish_form(p_workspace uuid, p_form_id text, p_slug text, p_definition jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_form public.forms%rowtype;
  v_status text;
  v_settings jsonb;
begin
  if not public.has_capability(p_workspace, 'forms', 'write') then
    raise exception 'Droit « formulaires » en écriture requis' using errcode = '42501';
  end if;
  if p_form_id is null or char_length(p_form_id) not between 1 and 200 then
    raise exception 'Identifiant de formulaire invalide' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$' then
    raise exception 'Lien court invalide : 1 à 60 caractères, lettres minuscules, chiffres et tirets' using errcode = '22023';
  end if;
  perform public.forms_validate_definition(p_definition);
  v_settings := coalesce(p_definition -> 'settings', '{}'::jsonb);

  select * into v_form from public.forms
    where workspace_id = p_workspace and (client_id = p_form_id or id::text = p_form_id) for update;
  if not found then
    if exists (select 1 from public.forms where id::text = p_form_id) then
      raise exception 'Ce formulaire appartient à un autre espace' using errcode = '42501';
    end if;
    if exists (select 1 from public.forms where slug = v_slug) then
      raise exception 'Ce lien court est déjà utilisé : choisis-en un autre' using errcode = '23505';
    end if;
    insert into public.forms (id, workspace_id, client_id, slug, title, kind, created_by, status)
      values (case when p_form_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_form_id::uuid else gen_random_uuid() end,
              p_workspace, p_form_id, v_slug, left(btrim(p_definition ->> 'title'), 200),
              coalesce(p_definition ->> 'kind', 'standard'), auth.uid(), 'draft')
      returning * into v_form;
  elsif exists (select 1 from public.forms where slug = v_slug and id <> v_form.id) then
    raise exception 'Ce lien court est déjà utilisé : choisis-en un autre' using errcode = '23505';
  end if;
  if v_form.kind <> coalesce(p_definition ->> 'kind', 'standard') and v_form.kind = 'vote'
     and exists (select 1 from public.vote_ballots where form_id = v_form.id) then
    raise exception 'Des bulletins existent : le type du formulaire ne peut plus changer' using errcode = '22023';
  end if;

  v_status := case when p_definition ->> 'status' in ('closed', 'archived') then p_definition ->> 'status' else 'published' end;
  insert into public.form_versions (form_id, version, definition, published_by)
    values (v_form.id, v_form.current_version + 1, p_definition, auth.uid());
  update public.forms set
    slug = v_slug,
    title = left(btrim(p_definition ->> 'title'), 200),
    kind = coalesce(p_definition ->> 'kind', 'standard'),
    status = v_status,
    access = coalesce(v_settings ->> 'access', 'link'),
    identity = case when coalesce(p_definition ->> 'kind', 'standard') = 'vote' then 'required'
                    else coalesce(v_settings ->> 'identity', 'anonymous') end,
    current_version = v_form.current_version + 1,
    opens_at = public.forms_parse_ts(v_settings ->> 'opensAt'),
    closes_at = public.forms_parse_ts(v_settings ->> 'closesAt'),
    updated_at = now()
  where id = v_form.id
  returning * into v_form;
  perform public.forms_sync_roll(v_form, p_definition);
  perform public.audit(p_workspace, 'form.publish', 'forms', v_form.id::text);
  return jsonb_build_object('form_id', v_form.id, 'version', v_form.current_version, 'slug', v_form.slug, 'status', v_form.status);
exception when unique_violation then
  raise exception 'Ce lien court est déjà utilisé : choisis-en un autre' using errcode = '23505';
end $$;

create or replace function public.set_form_status(p_form uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.forms where id = p_form;
  if v_ws is null or not public.has_capability(v_ws, 'forms', 'write') then
    raise exception 'Droit « formulaires » en écriture requis' using errcode = '42501';
  end if;
  if p_status not in ('published', 'closed', 'archived') then raise exception 'Statut invalide' using errcode = '22023'; end if;
  update public.forms set status = p_status, updated_at = now() where id = p_form;
  perform public.audit(v_ws, 'form.status', 'forms', p_form::text || ':' || p_status);
end $$;

-- ------------------------------------------------------------
-- 6. Lecture publique (anonyme autorisé)
-- ------------------------------------------------------------
create or replace function public.get_public_form(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_form public.forms%rowtype;
  v_def jsonb;
  v_uid uuid := auth.uid();
  v_voted boolean := null;
  v_email text;
begin
  if coalesce(p_slug, '') !~ '^[A-Za-z0-9-]{1,60}$' then return jsonb_build_object('available', false, 'reason', 'not_found'); end if;
  select * into v_form from public.forms where slug = lower(p_slug);
  if not found or v_form.status not in ('published', 'closed') or v_form.current_version < 1 then
    return jsonb_build_object('available', false, 'reason', 'not_found');
  end if;
  if v_form.access in ('members', 'invited') then
    if v_uid is null then return jsonb_build_object('available', false, 'reason', 'auth_required', 'title', v_form.title); end if;
    if not public.forms_user_eligible(v_form, v_uid) then
      return jsonb_build_object('available', false, 'reason', 'forbidden', 'title', v_form.title);
    end if;
  end if;
  select definition into v_def from public.form_versions where form_id = v_form.id and version = v_form.current_version;
  if v_form.kind = 'vote' and v_uid is not null then
    select lower(email) into v_email from auth.users where id = v_uid;
    v_voted := exists (select 1 from public.vote_rights where form_id = v_form.id
      and voter_key_hash in (public.forms_voter_key(v_form.id, 'user:' || v_uid::text),
                             public.forms_voter_key(v_form.id, 'email:' || coalesce(v_email, ''))));
  end if;
  return jsonb_build_object(
    'available', true,
    'form_id', v_form.id,
    'slug', v_form.slug,
    'version', v_form.current_version,
    'title', v_form.title,
    'kind', v_form.kind,
    'access', v_form.access,
    'identity', v_form.identity,
    'open', public.forms_is_open(v_form),
    'status', v_form.status,
    'opens_at', v_form.opens_at,
    'closes_at', v_form.closes_at,
    'definition', public.forms_public_definition(v_def),
    'stats', case when v_form.kind = 'vote' then null else public.forms_stats(v_form.id, v_def) end,
    'viewer', jsonb_build_object('authenticated', v_uid is not null, 'already_voted', v_voted,
      'eligible', case when v_form.kind = 'vote' then v_uid is not null and (public.forms_user_eligible(v_form, v_uid)
        or (coalesce(v_def #>> '{settings,vote,electoralRoll}', 'members') = 'members' and public.is_member(v_form.workspace_id)))
        else public.forms_user_eligible(v_form, v_uid) end));
end $$;

-- ------------------------------------------------------------
-- 7. Réponses : lecture par le répondant, jeton de modification, notes
-- ------------------------------------------------------------
create or replace function public.forms_response_editable(p_form public.forms, p_resp public.form_responses)
returns boolean language sql stable security definer set search_path = public as $$
  select p_resp.deleted_at is null and public.forms_is_open(p_form) and
    case coalesce((select definition #>> '{settings,allowEdit}' from public.form_versions
                    where form_id = p_resp.form_id and version = p_resp.version), 'never')
      when 'until_close' then true
      when 'until_review' then p_resp.status = 'received'
      else false end
$$;

create or replace function public.get_my_responses()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'form_id', f.id, 'slug', f.slug, 'title', f.title, 'version', r.version,
      'status', r.status,
      'status_label', coalesce((select s ->> 'label' from jsonb_array_elements(case when jsonb_typeof(v.definition #> '{settings,statuses}') = 'array'
                                 then v.definition #> '{settings,statuses}' else '[]'::jsonb end) s where s ->> 'id' = r.status limit 1), r.status),
      'answers', r.answers, 'waitlisted', r.waitlisted, 'payment_status', r.payment_status,
      'created_at', r.created_at, 'updated_at', r.updated_at,
      'editable', public.forms_response_editable(f, r)) order by r.created_at desc)
    from (select * from public.form_responses where respondent_user = v_uid and deleted_at is null
          order by created_at desc limit 200) r
    join public.forms f on f.id = r.form_id
    join public.form_versions v on v.form_id = r.form_id and v.version = r.version), '[]'::jsonb);
end $$;

create or replace function public.get_response_by_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_resp public.form_responses%rowtype;
  v_form public.forms%rowtype;
begin
  if coalesce(p_token, '') !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into v_resp from public.form_responses where edit_token_hash = public.forms_sha256(p_token) and deleted_at is null;
  if not found then return null; end if;
  select * into v_form from public.forms where id = v_resp.form_id;
  return jsonb_build_object(
    'response_id', v_resp.id, 'slug', v_form.slug, 'title', v_form.title, 'version', v_resp.version,
    'status', v_resp.status, 'answers', v_resp.answers, 'waitlisted', v_resp.waitlisted,
    'payment_status', v_resp.payment_status, 'submitted_at', v_resp.created_at, 'updated_at', v_resp.updated_at,
    'editable', public.forms_response_editable(v_form, v_resp));
end $$;

create or replace function public.add_response_note(p_response uuid, p_text text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
  v_id bigint;
  v_text text := btrim(coalesce(p_text, ''));
begin
  select workspace_id into v_ws from public.form_responses where id = p_response;
  if v_ws is null or not public.has_capability(v_ws, 'forms', 'write') then
    raise exception 'Droit « formulaires » en écriture requis' using errcode = '42501';
  end if;
  if char_length(v_text) not between 1 and 5000 then raise exception 'Note vide ou trop longue (5000 caractères maximum)' using errcode = '22023'; end if;
  insert into public.form_response_events (response_id, workspace_id, actor, action, payload)
    values (p_response, v_ws, auth.uid(), 'note', jsonb_build_object('text', v_text)) returning id into v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------
-- 8. Brouillons de reprise (anonyme : jeton aléatoire du navigateur)
-- ------------------------------------------------------------
create or replace function public.forms_client_ip()
returns text language plpgsql stable set search_path = public as $$
declare
  v_h text := current_setting('request.headers', true);
begin
  if v_h is null or v_h = '' then return 'inconnue'; end if;
  return coalesce(split_part((v_h::json ->> 'x-forwarded-for'), ',', 1), (v_h::json ->> 'cf-connecting-ip'), 'inconnue');
exception when others then return 'inconnue';
end $$;

create or replace function public.forms_rate_limit_hit(p_key_hash text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz;
  v_count int;
begin
  if coalesce(p_key_hash, '') !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Paramètres de limitation invalides' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key_hash, window_start, count) values (p_key_hash, v_window, 1)
    on conflict (key_hash, window_start) do update set count = r.count + 1
    returning count into v_count;
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return v_count <= p_limit;
end $$;

create or replace function public.save_form_draft(p_slug text, p_token text, p_answers jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_form public.forms%rowtype;
  v_def jsonb;
  v_hash text;
  v_at timestamptz;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{32,128}$' then raise exception 'Jeton de brouillon invalide' using errcode = '22023'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 256000 then
    raise exception 'Brouillon invalide ou trop volumineux (250 Ko maximum)' using errcode = '22023';
  end if;
  select * into v_form from public.forms where slug = lower(coalesce(p_slug, ''));
  if not found or not public.forms_is_open(v_form) then raise exception 'Formulaire fermé ou introuvable' using errcode = 'P0002'; end if;
  if not public.forms_user_eligible(v_form, auth.uid()) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  select definition into v_def from public.form_versions where form_id = v_form.id and version = v_form.current_version;
  if not coalesce((v_def #>> '{settings,saveDraft}')::boolean, false) then
    raise exception 'Ce formulaire n''autorise pas les brouillons' using errcode = '42501';
  end if;
  if not public.forms_rate_limit_hit(public.forms_sha256('draft|' || public.forms_client_ip()), 600, 3600) then
    raise exception 'Trop de sauvegardes : réessaie dans quelques minutes' using errcode = '54000';
  end if;
  v_hash := public.forms_sha256('draft|' || p_token);
  if not exists (select 1 from public.form_drafts where token_hash = v_hash)
     and (select count(*) from public.form_drafts where form_id = v_form.id and expires_at > now()) >= 5000 then
    raise exception 'Trop de brouillons en cours pour ce formulaire' using errcode = '54000';
  end if;
  insert into public.form_drafts as d (token_hash, form_id, answers, updated_at, expires_at)
    values (v_hash, v_form.id, p_answers, now(), now() + interval '30 days')
    on conflict (token_hash) do update set answers = excluded.answers, updated_at = now(), expires_at = excluded.expires_at
      where d.form_id = excluded.form_id
    returning updated_at into v_at;
  if v_at is null then raise exception 'Jeton de brouillon invalide' using errcode = '22023'; end if;
  if random() < 0.02 then delete from public.form_drafts where expires_at < now(); end if;
  return v_at;
end $$;

create or replace function public.load_form_draft(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_row public.form_drafts%rowtype;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{32,128}$' then return null; end if;
  select d.* into v_row from public.form_drafts d join public.forms f on f.id = d.form_id
    where d.token_hash = public.forms_sha256('draft|' || p_token) and f.slug = lower(coalesce(p_slug, '')) and d.expires_at > now();
  if not found then return null; end if;
  return jsonb_build_object('answers', v_row.answers, 'updated_at', v_row.updated_at);
end $$;

-- ------------------------------------------------------------
-- 9. Fonctions réservées à la clé de service (fonctions Edge)
-- ------------------------------------------------------------
create or replace function public.forms_submit_context(p_slug text, p_user uuid default null, p_edit_hash text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_form public.forms%rowtype;
  v_resp public.form_responses%rowtype;
  v_version int;
  v_def jsonb;
  v_email text;
  v_member text;
begin
  select * into v_form from public.forms where slug = lower(coalesce(p_slug, ''));
  if not found or v_form.current_version < 1 or v_form.status not in ('published', 'closed') then return null; end if;
  v_version := v_form.current_version;
  if p_edit_hash is not null then
    select * into v_resp from public.form_responses where edit_token_hash = p_edit_hash and form_id = v_form.id and deleted_at is null;
    if not found then return jsonb_build_object('error', 'edit_not_found'); end if;
    v_version := v_resp.version;
  end if;
  select definition into v_def from public.form_versions where form_id = v_form.id and version = v_version;
  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
    select member_id into v_member from public.workspace_members where workspace_id = v_form.workspace_id and user_id = p_user;
  end if;
  return jsonb_build_object(
    'form', jsonb_build_object('id', v_form.id, 'workspace_id', v_form.workspace_id, 'slug', v_form.slug, 'title', v_form.title,
      'kind', v_form.kind, 'status', v_form.status, 'access', v_form.access, 'identity', v_form.identity,
      'version', v_version, 'open', public.forms_is_open(v_form), 'opens_at', v_form.opens_at, 'closes_at', v_form.closes_at),
    'definition', v_def,
    'stats', public.forms_stats(v_form.id, v_def, v_resp.id),
    'fingerprint', public.forms_fingerprint(v_form.id),
    'eligible', public.forms_user_eligible(v_form, p_user),
    'user', case when p_user is null then null else jsonb_build_object('id', p_user, 'email', v_email, 'member_id', v_member) end,
    'edit', case when v_resp.id is null then null else jsonb_build_object('response_id', v_resp.id, 'status', v_resp.status,
      'editable', public.forms_response_editable(v_form, v_resp), 'answers', v_resp.answers) end);
end $$;

-- Insertion atomique (verrou par formulaire) : contrôle d'ouverture,
-- d'unicité et de l'empreinte des réponses (si elle a changé depuis le calcul
-- des quotas, on renvoie « retry » et la fonction Edge recalcule).
create or replace function public.forms_insert_response(
  p_form uuid, p_version int, p_response_id uuid, p_answers jsonb, p_computed jsonb, p_score numeric,
  p_user uuid, p_member text, p_email text, p_edit_hash text, p_waitlisted boolean,
  p_unique jsonb, p_one_per_person boolean, p_fingerprint text, p_payment_cents int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_form public.forms%rowtype;
  v_key text;
  v_val text;
begin
  perform pg_advisory_xact_lock(hashtextextended('forms:' || p_form::text, 0));
  select * into v_form from public.forms where id = p_form;
  if not found or not public.forms_is_open(v_form) then return jsonb_build_object('ok', false, 'code', 'closed'); end if;
  if p_version <> v_form.current_version then return jsonb_build_object('ok', false, 'code', 'retry'); end if;
  if p_fingerprint is distinct from public.forms_fingerprint(p_form) then return jsonb_build_object('ok', false, 'code', 'retry'); end if;
  if coalesce(p_one_per_person, false) and (p_user is not null or p_email is not null) and exists (
       select 1 from public.form_responses where form_id = p_form and deleted_at is null
         and ((p_user is not null and respondent_user = p_user) or (p_email is not null and lower(respondent_email) = lower(p_email)))) then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;
  for v_key, v_val in select key, value from jsonb_each_text(coalesce(p_unique, '{}'::jsonb)) loop
    if exists (select 1 from public.form_responses where form_id = p_form and deleted_at is null
               and lower(btrim(answers ->> v_key)) = lower(btrim(v_val))) then
      return jsonb_build_object('ok', false, 'code', 'unique', 'key', v_key);
    end if;
  end loop;
  insert into public.form_responses (id, form_id, version, workspace_id, answers, computed, score, respondent_user,
      respondent_member, respondent_email, edit_token_hash, waitlisted, payment_status, payment_amount_cents)
    values (p_response_id, p_form, p_version, v_form.workspace_id, coalesce(p_answers, '{}'::jsonb), coalesce(p_computed, '{}'::jsonb),
      p_score, p_user, p_member, lower(p_email), p_edit_hash, coalesce(p_waitlisted, false),
      case when coalesce(p_payment_cents, 0) > 0 then 'pending' else null end, nullif(p_payment_cents, 0));
  return jsonb_build_object('ok', true, 'id', p_response_id);
end $$;

create or replace function public.forms_update_response(
  p_form uuid, p_edit_hash text, p_answers jsonb, p_computed jsonb, p_score numeric, p_unique jsonb, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_form public.forms%rowtype;
  v_resp public.form_responses%rowtype;
  v_key text;
  v_val text;
begin
  perform pg_advisory_xact_lock(hashtextextended('forms:' || p_form::text, 0));
  select * into v_form from public.forms where id = p_form;
  select * into v_resp from public.form_responses where form_id = p_form and edit_token_hash = p_edit_hash and deleted_at is null for update;
  if v_form.id is null or v_resp.id is null then return jsonb_build_object('ok', false, 'code', 'edit_not_found'); end if;
  if not public.forms_response_editable(v_form, v_resp) then return jsonb_build_object('ok', false, 'code', 'not_editable'); end if;
  if p_fingerprint is distinct from public.forms_fingerprint(p_form) then return jsonb_build_object('ok', false, 'code', 'retry'); end if;
  for v_key, v_val in select key, value from jsonb_each_text(coalesce(p_unique, '{}'::jsonb)) loop
    if exists (select 1 from public.form_responses where form_id = p_form and deleted_at is null and id <> v_resp.id
               and lower(btrim(answers ->> v_key)) = lower(btrim(v_val))) then
      return jsonb_build_object('ok', false, 'code', 'unique', 'key', v_key);
    end if;
  end loop;
  update public.form_responses set answers = coalesce(p_answers, '{}'::jsonb), computed = coalesce(p_computed, '{}'::jsonb), score = p_score
    where id = v_resp.id;
  return jsonb_build_object('ok', true, 'id', v_resp.id);
end $$;

-- Paiement : lecture d'une réponse par son jeton, enregistrement du paiement.
create or replace function public.forms_payment_context(p_response uuid, p_edit_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_resp public.form_responses%rowtype;
  v_form public.forms%rowtype;
begin
  select * into v_resp from public.form_responses where id = p_response and edit_token_hash = p_edit_hash and deleted_at is null;
  if not found then return null; end if;
  select * into v_form from public.forms where id = v_resp.form_id;
  return jsonb_build_object('response_id', v_resp.id, 'form_id', v_form.id, 'slug', v_form.slug, 'title', v_form.title,
    'answers', v_resp.answers, 'computed', v_resp.computed, 'email', v_resp.respondent_email,
    'payment_status', v_resp.payment_status, 'payment_ref', v_resp.payment_ref, 'amount_cents', v_resp.payment_amount_cents,
    'definition', (select definition from public.form_versions where form_id = v_resp.form_id and version = v_resp.version));
end $$;

create or replace function public.forms_set_payment(p_response uuid, p_ref text, p_status text, p_amount_cents int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_resp public.form_responses%rowtype;
begin
  if p_status not in ('pending', 'paid', 'failed', 'refunded') then raise exception 'Statut de paiement invalide' using errcode = '22023'; end if;
  select * into v_resp from public.form_responses where id = p_response for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_resp.payment_status = 'paid' and p_status <> 'refunded' then
    return jsonb_build_object('ok', true, 'already', true, 'id', v_resp.id);   -- idempotent (webhooks répétés)
  end if;
  update public.form_responses set payment_status = p_status, payment_ref = coalesce(left(p_ref, 120), payment_ref),
    payment_amount_cents = coalesce(p_amount_cents, payment_amount_cents) where id = p_response;
  return jsonb_build_object('ok', true, 'id', v_resp.id, 'workspace_id', v_resp.workspace_id);
end $$;

create or replace function public.forms_find_payment(p_ref text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.form_responses where payment_ref = p_ref and deleted_at is null limit 1
$$;

create or replace function public.forms_payment_by_response(p_response uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('response_id', id, 'payment_ref', payment_ref, 'amount_cents', payment_amount_cents, 'payment_status', payment_status)
  from public.form_responses where id = p_response and deleted_at is null
$$;

-- Destinataires autorisés d'un message d'organisateur (brevo-send) :
-- répondants de l'espace (par identifiant de réponse) et comptes membres.
create or replace function public.forms_resolve_recipients(p_ws uuid, p_response_ids uuid[], p_emails text[])
returns jsonb language sql stable security definer set search_path = public as $$
  with wanted as (
    select lower(respondent_email) as email from public.form_responses
      where workspace_id = p_ws and deleted_at is null and respondent_email is not null
        and id = any (coalesce(p_response_ids, '{}'))
    union
    select lower(m.email) from public.workspace_members m
      where m.workspace_id = p_ws and m.email is not null and lower(m.email) = any (select lower(e) from unnest(coalesce(p_emails, '{}')) e)
  )
  select jsonb_build_object('emails', coalesce(jsonb_agg(distinct email), '[]'::jsonb)) from wanted
$$;

-- Identifiants existants pour les questions member_picker / event_picker
-- (contrôle d'existence par le moteur ; aucun autre champ n'est renvoyé).
create or replace function public.forms_lookup(p_ws uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(id) from public.records where workspace_id = p_ws and collection = 'core.members' and not deleted), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(id) from public.records where workspace_id = p_ws and collection = 'events.events' and not deleted), '[]'::jsonb))
$$;

-- Brouillon consommé après l'envoi définitif.
create or replace function public.forms_delete_draft(p_form uuid, p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.form_drafts where form_id = p_form and token_hash = public.forms_sha256('draft|' || coalesce(p_token, ''))
$$;

-- Réponses existantes (pour compter les quotas à expression complexe côté
-- Edge, avec le moteur). Jamais exposé hors clé de service.
create or replace function public.forms_quota_answers(p_form uuid, p_exclude uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(answers), '[]'::jsonb) from (
    select answers from public.form_responses
    where form_id = p_form and deleted_at is null and not waitlisted and id is distinct from p_exclude
    order by created_at limit 5000) s
$$;

-- Capacité d'un utilisateur (fonction Edge brevo-send : l'appelant est
-- identifié par son JWT, vérifié côté Edge, puis contrôlé ici).
create or replace function public.forms_user_capability(p_user uuid, p_ws uuid, p_capability text, p_level text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_level text;
begin
  select role into v_role from public.workspace_members where workspace_id = p_ws and user_id = p_user;
  if v_role is null then return false; end if;
  if v_role = 'owner' then return true; end if;
  select level into v_level from public.roles_grants where workspace_id = p_ws and role = v_role and capability = p_capability;
  return public.level_rank(coalesce(v_level, 'none')) >= public.level_rank(p_level);
end $$;

-- ------------------------------------------------------------
-- 10. Vote anonyme
-- ------------------------------------------------------------
-- Contrôle d'un bulletin par rapport à la définition publiée.
create or replace function public.forms_validate_ballot(p_def jsonb, p_choices jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare
  v_q jsonb;
  v_key text;
  v_val jsonb;
  v_allowed text[];
  v_n int;
begin
  if p_choices is null or jsonb_typeof(p_choices) <> 'object' then raise exception 'Bulletin invalide' using errcode = '22023'; end if;
  if octet_length(p_choices::text) > 20000 then raise exception 'Bulletin trop volumineux' using errcode = '22023'; end if;
  for v_key in select jsonb_object_keys(p_choices) loop
    if not exists (select 1 from public.forms_questions(p_def) q where q ->> 'key' = v_key) then
      raise exception 'Question inconnue dans le bulletin' using errcode = '22023';
    end if;
  end loop;
  for v_q in select q from public.forms_questions(p_def) q loop
    v_val := p_choices -> (v_q ->> 'key');
    if v_val is null or v_val = 'null'::jsonb or v_val = '[]'::jsonb or v_val = '""'::jsonb then
      if coalesce(v_q ->> 'required', 'false') = 'true' then
        raise exception 'Réponse requise : %', left(coalesce(v_q ->> 'label', v_q ->> 'key'), 80) using errcode = '22023';
      end if;
      continue;
    end if;
    if v_q ->> 'type' = 'yes_no' then
      if jsonb_typeof(v_val) <> 'boolean' and v_val #>> '{}' not in ('yes', 'no', 'oui', 'non') then
        raise exception 'Choix invalide' using errcode = '22023';
      end if;
      continue;
    end if;
    select array_agg(o ->> 'value') into v_allowed
      from jsonb_array_elements(case when jsonb_typeof(v_q -> 'options') = 'array' then v_q -> 'options' else '[]'::jsonb end) o;
    if v_q ->> 'type' in ('multiple_choice', 'ranking') then
      if jsonb_typeof(v_val) <> 'array' then raise exception 'Choix invalide' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_array_elements(v_val) e where jsonb_typeof(e) not in ('string', 'number') or not (e #>> '{}' = any (coalesce(v_allowed, '{}')))) then
        raise exception 'Choix invalide' using errcode = '22023';
      end if;
      select count(*) into v_n from (select distinct e #>> '{}' from jsonb_array_elements(v_val) e) d;
      if v_n <> jsonb_array_length(v_val) then raise exception 'Choix en double' using errcode = '22023'; end if;
      if (v_q #>> '{validation,maxSelected}') ~ '^\d+$' and v_n > (v_q #>> '{validation,maxSelected}')::int then
        raise exception 'Trop de choix cochés' using errcode = '22023';
      end if;
      if (v_q #>> '{validation,minSelected}') ~ '^\d+$' and v_n < (v_q #>> '{validation,minSelected}')::int then
        raise exception 'Pas assez de choix cochés' using errcode = '22023';
      end if;
    else
      if jsonb_typeof(v_val) not in ('string', 'number') or not (v_val #>> '{}' = any (coalesce(v_allowed, '{}'))) then
        raise exception 'Choix invalide' using errcode = '22023';
      end if;
    end if;
  end loop;
end $$;

create or replace function public.cast_vote(p_form uuid, p_choices jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_form public.forms%rowtype;
  v_def jsonb;
  v_email text;
  v_key text;
  v_receipt text;
begin
  if v_uid is null then raise exception 'Connexion requise pour voter' using errcode = '42501'; end if;
  select * into v_form from public.forms where id = p_form;
  if not found or v_form.kind <> 'vote' then raise exception 'Vote introuvable' using errcode = 'P0002'; end if;
  if not public.forms_is_open(v_form) then raise exception 'Le vote est fermé' using errcode = '22023'; end if;
  select definition into v_def from public.form_versions where form_id = v_form.id and version = v_form.current_version;
  select lower(email) into v_email from auth.users where id = v_uid;

  -- Éligibilité : inscrit sur la liste électorale (clé propre au vote).
  select voter_key_hash into v_key from public.vote_rolls
    where form_id = p_form and voter_key_hash in (public.forms_voter_key(p_form, 'user:' || v_uid::text),
                                                  public.forms_voter_key(p_form, 'email:' || coalesce(v_email, '')))
    limit 1;
  if v_key is null and coalesce(v_def #>> '{settings,vote,electoralRoll}', 'members') = 'members' and public.is_member(v_form.workspace_id) then
    -- membre arrivé après la publication : inscrit à la volée
    v_key := public.forms_voter_key(p_form, 'user:' || v_uid::text);
    insert into public.vote_rolls (form_id, voter_key_hash) values (p_form, v_key) on conflict do nothing;
  end if;
  if v_key is null then raise exception 'Tu n''es pas inscrit·e sur la liste électorale de ce vote' using errcode = '42501'; end if;

  perform public.forms_validate_ballot(v_def, p_choices);

  -- Droit consommé (unicité garantie par la clé primaire)…
  begin
    insert into public.vote_rights (form_id, voter_key_hash) values (p_form, v_key);
  exception when unique_violation then
    raise exception 'Tu as déjà voté' using errcode = '23505';
  end;
  -- … et bulletin, sans aucun lien avec l'électeur.
  v_receipt := left(public.forms_random_token(), 32);
  insert into public.vote_ballots (form_id, choices, receipt_hash)
    values (p_form, p_choices, public.forms_sha256('receipt|' || v_receipt));
  return jsonb_build_object('receipt', v_receipt);
end $$;

create or replace function public.verify_ballot(p_form uuid, p_receipt text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_form is null or coalesce(p_receipt, '') !~ '^[a-f0-9]{32}$' then return jsonb_build_object('counted', false); end if;
  return jsonb_build_object('counted', exists (select 1 from public.vote_ballots
    where form_id = p_form and receipt_hash = public.forms_sha256('receipt|' || lower(p_receipt))));
end $$;

create or replace function public.vote_results(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_form public.forms%rowtype;
  v_def jsonb;
  v_vis text;
  v_majority text;
  v_closed boolean;
  v_admin boolean;
  v_viewer boolean;
  v_total int;
  v_roll int;
  v_part numeric;
  v_quorum numeric;
  v_quorum_ok boolean;
  v_q jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_opts jsonb;
  v_expressed int;
  v_top text;
  v_top_n numeric;
  v_second_n numeric;
  v_decided boolean;
  v_basis numeric;
begin
  select * into v_form from public.forms where id = p_form;
  if not found or v_form.kind <> 'vote' or v_form.current_version < 1 then return jsonb_build_object('visible', false, 'reason', 'not_found'); end if;
  select definition into v_def from public.form_versions where form_id = v_form.id and version = v_form.current_version;
  v_vis := coalesce(v_def #>> '{settings,vote,resultsVisibility}', 'after_close');
  v_majority := coalesce(v_def #>> '{settings,vote,majority}', 'simple');
  v_closed := v_form.status in ('closed', 'archived') or (v_form.closes_at is not null and v_form.closes_at <= now());
  v_admin := public.has_capability(v_form.workspace_id, 'forms', 'write');
  v_viewer := v_admin or public.has_capability(v_form.workspace_id, 'forms', 'read')
    or v_form.access in ('public', 'link') or public.forms_user_eligible(v_form, v_uid);
  if not v_viewer or (v_vis = 'admins' and not v_admin) then
    return jsonb_build_object('visible', false, 'reason', 'forbidden');
  end if;
  if v_vis = 'after_close' and not v_closed then
    return jsonb_build_object('visible', false, 'reason', 'hidden_until_close', 'closes_at', v_form.closes_at);
  end if;

  select count(*) into v_total from public.vote_ballots where form_id = p_form;
  select count(*) into v_roll from public.vote_rolls where form_id = p_form;
  v_part := case when v_roll > 0 then round(100.0 * v_total / v_roll, 2) end;
  v_quorum := case when (v_def #>> '{settings,vote,quorumPercent}') ~ '^\d+(\.\d+)?$' then (v_def #>> '{settings,vote,quorumPercent}')::numeric end;
  v_quorum_ok := v_quorum is null or coalesce(v_part, 0) >= v_quorum;

  for v_q in select q from public.forms_questions(v_def) q loop
    select count(*) into v_expressed from public.vote_ballots
      where form_id = p_form and choices ? (v_q ->> 'key')
        and choices -> (v_q ->> 'key') not in ('null'::jsonb, '[]'::jsonb, '""'::jsonb);
    if v_q ->> 'type' = 'yes_no' then
      select jsonb_agg(jsonb_build_object('value', o.v, 'label', o.l, 'count', coalesce(c.n, 0),
               'percent', case when v_expressed > 0 then round(100.0 * coalesce(c.n, 0) / v_expressed, 2) else 0 end) order by o.ord)
        into v_opts
        from (values ('yes', 'Oui', 1), ('no', 'Non', 2)) as o(v, l, ord)
        left join (select case when b.choices -> (v_q ->> 'key') in ('true'::jsonb, '"yes"'::jsonb, '"oui"'::jsonb) then 'yes' else 'no' end as v, count(*) as n
                   from public.vote_ballots b where b.form_id = p_form and b.choices -> (v_q ->> 'key') not in ('null'::jsonb, '""'::jsonb)
                   group by 1) c on c.v = o.v;
    elsif v_q ->> 'type' = 'ranking' then
      -- Classement : méthode de Borda (n points pour la 1re place, n-1 pour la 2e…)
      select jsonb_agg(jsonb_build_object('value', o ->> 'value', 'label', o ->> 'label', 'count', coalesce(c.firsts, 0),
               'points', coalesce(c.pts, 0)) order by coalesce(c.pts, 0) desc, ord)
        into v_opts
        from jsonb_array_elements(case when jsonb_typeof(v_q -> 'options') = 'array' then v_q -> 'options' else '[]'::jsonb end) with ordinality as t(o, ord)
        left join (select e.val, sum(jsonb_array_length(b.choices -> (v_q ->> 'key')) - e.pos + 1) as pts,
                          count(*) filter (where e.pos = 1) as firsts
                   from public.vote_ballots b,
                     lateral jsonb_array_elements_text(case when jsonb_typeof(b.choices -> (v_q ->> 'key')) = 'array' then b.choices -> (v_q ->> 'key') else '[]'::jsonb end)
                       with ordinality as e(val, pos)
                   where b.form_id = p_form group by e.val) c on c.val = o ->> 'value';
    else
      select jsonb_agg(jsonb_build_object('value', o ->> 'value', 'label', o ->> 'label', 'count', coalesce(c.n, 0),
               'percent', case when v_expressed > 0 then round(100.0 * coalesce(c.n, 0) / v_expressed, 2) else 0 end) order by ord)
        into v_opts
        from jsonb_array_elements(case when jsonb_typeof(v_q -> 'options') = 'array' then v_q -> 'options' else '[]'::jsonb end) with ordinality as t(o, ord)
        left join (select val, count(*) as n
                   from public.vote_ballots b,
                     lateral jsonb_array_elements_text(case jsonb_typeof(b.choices -> (v_q ->> 'key'))
                       when 'array' then b.choices -> (v_q ->> 'key')
                       when 'string' then jsonb_build_array(b.choices -> (v_q ->> 'key'))
                       when 'number' then jsonb_build_array(b.choices -> (v_q ->> 'key'))
                       else '[]'::jsonb end) as val
                   where b.form_id = p_form group by val) c on c.val = o ->> 'value';
    end if;
    v_opts := coalesce(v_opts, '[]'::jsonb);
    -- Gagnant : premier par nombre de voix (ou de points pour un classement).
    select e ->> 'value', coalesce((e ->> 'points')::numeric, (e ->> 'count')::numeric) into v_top, v_top_n
      from jsonb_array_elements(v_opts) e order by coalesce((e ->> 'points')::numeric, (e ->> 'count')::numeric) desc limit 1;
    select coalesce((e ->> 'points')::numeric, (e ->> 'count')::numeric) into v_second_n
      from jsonb_array_elements(v_opts) e order by coalesce((e ->> 'points')::numeric, (e ->> 'count')::numeric) desc offset 1 limit 1;
    v_basis := v_expressed;
    v_decided := v_expressed > 0 and coalesce(v_top_n, 0) > coalesce(v_second_n, 0) and v_quorum_ok and (
      v_q ->> 'type' = 'ranking' or v_majority = 'simple'
      or (v_majority = 'absolute' and v_top_n * 2 > v_basis)
      or (v_majority = 'two_thirds' and v_top_n * 3 >= v_basis * 2));
    v_questions := v_questions || jsonb_build_array(jsonb_build_object(
      'key', v_q ->> 'key', 'label', v_q ->> 'label', 'type', v_q ->> 'type',
      'expressed', v_expressed, 'blank', v_total - v_expressed, 'options', v_opts,
      'winner', case when v_decided then v_top end, 'decided', v_decided,
      'method', case when v_q ->> 'type' = 'ranking' then 'borda' else v_majority end));
  end loop;

  return jsonb_build_object('visible', true, 'closed', v_closed, 'final', v_closed,
    'ballots', v_total, 'electorate', v_roll, 'participation_percent', v_part,
    'quorum_percent', v_quorum, 'quorum_reached', v_quorum_ok, 'majority', v_majority,
    'questions', v_questions);
end $$;

-- Liste des votants (émargement, SANS bulletin) : comptage uniquement.
create or replace function public.vote_participation(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.forms where id = p_form and kind = 'vote';
  if v_ws is null or not public.has_capability(v_ws, 'forms', 'read') then
    raise exception 'Droit « formulaires » en lecture requis' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'electorate', (select count(*) from public.vote_rolls where form_id = p_form),
    'voted', (select count(*) from public.vote_rights where form_id = p_form));
end $$;

-- ------------------------------------------------------------
-- 11. Automatisations : file d'attente consommée par l'application
-- ------------------------------------------------------------
create or replace function public.claim_automation_runs(p_workspace uuid, p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_out jsonb;
begin
  if not public.has_capability(p_workspace, 'forms', 'write') then
    raise exception 'Droit « formulaires » en écriture requis' using errcode = '42501';
  end if;
  with picked as (
    select r.id from public.automation_runs r
    where r.workspace_id = p_workspace
      and (r.status = 'queued' or (r.status = 'claimed' and r.claimed_at < now() - interval '10 minutes' and r.attempts < 5))
    order by r.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), upd as (
    update public.automation_runs r set status = 'claimed', claimed_at = now(), claimed_by = auth.uid(), attempts = r.attempts + 1
    from picked where r.id = picked.id
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'automation_id', u.automation_id, 'response_id', u.response_id, 'event', u.event, 'payload', u.payload,
      'attempts', u.attempts, 'created_at', u.created_at,
      'automation', jsonb_build_object('id', a.id, 'name', a.name, 'form_id', a.form_id, 'trigger', a.trigger,
                                       'conditions', a.conditions, 'actions', a.actions)) order by u.created_at), '[]'::jsonb)
    into v_out
    from upd u join public.automations a on a.id = u.automation_id;
  return v_out;
end $$;

create or replace function public.complete_automation_run(p_run uuid, p_status text, p_result jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_run public.automation_runs%rowtype;
begin
  select * into v_run from public.automation_runs where id = p_run for update;
  if not found or not public.has_capability(v_run.workspace_id, 'forms', 'write') then
    raise exception 'Exécution introuvable ou droit insuffisant' using errcode = '42501';
  end if;
  if p_status not in ('done', 'failed') then raise exception 'Statut invalide (done ou failed)' using errcode = '22023'; end if;
  if v_run.status <> 'claimed' then raise exception 'Exécution non réservée (déjà terminée ?)' using errcode = '22023'; end if;
  if p_result is not null and octet_length(p_result::text) > 20000 then raise exception 'Résultat trop volumineux' using errcode = '22023'; end if;
  update public.automation_runs set status = p_status, result = p_result, finished_at = now() where id = p_run;
end $$;

create or replace function public.approve_automation_run(p_run uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_run public.automation_runs%rowtype;
begin
  select * into v_run from public.automation_runs where id = p_run for update;
  if not found or not public.has_capability(v_run.workspace_id, 'forms', 'validate') then
    raise exception 'Droit « formulaires » en validation requis' using errcode = '42501';
  end if;
  if v_run.status <> 'pending_approval' then raise exception 'Cette exécution n''attend pas d''approbation' using errcode = '22023'; end if;
  update public.automation_runs set status = case when p_approve then 'queued' else 'cancelled' end,
    approved_by = auth.uid(), finished_at = case when p_approve then null else now() end where id = p_run;
end $$;

-- ------------------------------------------------------------
-- 12. Row Level Security
-- ------------------------------------------------------------
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_responses enable row level security;
alter table public.form_response_events enable row level security;
alter table public.form_drafts enable row level security;
alter table public.vote_rolls enable row level security;
alter table public.vote_rights enable row level security;
alter table public.vote_ballots enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists forms_read on public.forms;
create policy forms_read on public.forms for select to authenticated
  using (public.has_capability(workspace_id, 'forms', 'read'));

drop policy if exists form_versions_read on public.form_versions;
create policy form_versions_read on public.form_versions for select to authenticated
  using (exists (select 1 from public.forms f where f.id = form_id and public.has_capability(f.workspace_id, 'forms', 'read')));

-- Réponses : administration de l'espace uniquement (le répondant passe par
-- get_my_responses / get_response_by_token, qui ne montrent pas les champs
-- internes : étiquettes, responsable, notes).
drop policy if exists form_responses_read on public.form_responses;
create policy form_responses_read on public.form_responses for select to authenticated
  using (public.has_capability(workspace_id, 'forms', 'read'));
drop policy if exists form_responses_update on public.form_responses;
create policy form_responses_update on public.form_responses for update to authenticated
  using (public.has_capability(workspace_id, 'forms', 'write'))
  with check (public.has_capability(workspace_id, 'forms', 'write'));

drop policy if exists form_response_events_read on public.form_response_events;
create policy form_response_events_read on public.form_response_events for select to authenticated
  using (public.has_capability(workspace_id, 'forms', 'read'));

drop policy if exists automations_read on public.automations;
create policy automations_read on public.automations for select to authenticated
  using (public.has_capability(workspace_id, 'forms', 'read'));
drop policy if exists automations_insert on public.automations;
create policy automations_insert on public.automations for insert to authenticated
  with check (public.has_capability(workspace_id, 'forms', 'write'));
drop policy if exists automations_update on public.automations;
create policy automations_update on public.automations for update to authenticated
  using (public.has_capability(workspace_id, 'forms', 'write'))
  with check (public.has_capability(workspace_id, 'forms', 'write'));
drop policy if exists automations_delete on public.automations;
create policy automations_delete on public.automations for delete to authenticated
  using (public.has_capability(workspace_id, 'forms', 'write'));

drop policy if exists automation_runs_read on public.automation_runs;
create policy automation_runs_read on public.automation_runs for select to authenticated
  using (public.has_capability(workspace_id, 'forms', 'read'));
-- form_drafts, vote_*, rate_limits : AUCUNE politique → inaccessibles
-- directement (RPC uniquement).

-- ------------------------------------------------------------
-- 13. Privilèges (Supabase accorde par défaut tout à anon / authenticated
--     sur les nouveaux objets : on retire explicitement)
-- ------------------------------------------------------------
revoke all on public.forms, public.form_versions, public.form_responses, public.form_response_events, public.form_drafts,
  public.vote_rolls, public.vote_rights, public.vote_ballots, public.automations, public.automation_runs, public.rate_limits
  from anon, authenticated, public;
grant select on public.forms, public.form_versions, public.form_responses, public.form_response_events,
  public.automations, public.automation_runs to authenticated;
grant update (status, tags, assignee, deleted_at, payment_status, waitlisted) on public.form_responses to authenticated;
grant insert, update, delete on public.automations to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.forms, public.form_versions, public.form_responses, public.form_response_events, public.form_drafts,
      public.automations, public.automation_runs, public.rate_limits to service_role';
    -- Même la clé de service n'a aucun accès direct aux tables du vote.
    execute 'revoke all on public.vote_rolls, public.vote_rights, public.vote_ballots from service_role';
  end if;
end $$;

do $$
declare
  r record;
  v_internal text[] := array['forms_sha256', 'forms_random_token', 'forms_voter_key', 'forms_parse_ts', 'forms_questions',
    'forms_strip_answers', 'forms_public_definition', 'forms_validate_definition', 'form_versions_immutable', 'forms_enqueue_runs',
    'form_responses_before_update', 'form_responses_after_write', 'automations_before_write', 'forms_is_open', 'forms_stats',
    'forms_fingerprint', 'forms_user_eligible', 'forms_sync_roll', 'forms_response_editable', 'forms_client_ip',
    'forms_rate_limit_hit', 'forms_submit_context', 'forms_insert_response', 'forms_update_response', 'forms_payment_context',
    'forms_set_payment', 'forms_find_payment', 'forms_user_capability', 'forms_validate_ballot',
    'forms_delete_draft', 'forms_quota_answers', 'forms_payment_by_response', 'forms_resolve_recipients', 'forms_lookup',
    'publish_form', 'set_form_status', 'get_public_form', 'get_my_responses', 'get_response_by_token', 'add_response_note',
    'save_form_draft', 'load_form_draft', 'cast_vote', 'verify_ballot', 'vote_results', 'vote_participation',
    'claim_automation_runs', 'complete_automation_run', 'approve_automation_run',
    -- correctifs 0001 : fonctions internes à ne pas exposer (accordées par défaut par Supabase)
    'audit', 'seed_default_grants', 'records_before_write', 'records_after_write'];
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (v_internal) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- Rôle authenticated : RPC d'administration et de répondant connecté.
grant execute on function public.publish_form(uuid, text, text, jsonb), public.set_form_status(uuid, text),
  public.get_public_form(text), public.get_my_responses(), public.get_response_by_token(text),
  public.add_response_note(uuid, text), public.save_form_draft(text, text, jsonb), public.load_form_draft(text, text),
  public.cast_vote(uuid, jsonb), public.verify_ballot(uuid, text), public.vote_results(uuid), public.vote_participation(uuid),
  public.claim_automation_runs(uuid, int), public.complete_automation_run(uuid, text, jsonb),
  public.approve_automation_run(uuid, boolean)
  to authenticated;
-- Anonyme : lecture d'un formulaire public, brouillons, reprise par jeton,
-- vérification d'un reçu, résultats publics d'un vote.
grant execute on function public.get_public_form(text), public.get_response_by_token(text),
  public.save_form_draft(text, text, jsonb), public.load_form_draft(text, text),
  public.verify_ballot(uuid, text), public.vote_results(uuid)
  to anon;
-- Fonctions de triggers (comme dans 0001). Les fonctions internes
-- (forms_stats, forms_rate_limit_hit, audit…) ne sont PAS exposées : elles ne
-- sont appelées que depuis des fonctions « security definer ».
grant execute on function public.form_responses_before_update(), public.form_responses_after_write(),
  public.automations_before_write(), public.form_versions_immutable(),
  public.records_before_write(), public.records_after_write()
  to authenticated;

-- ------------------------------------------------------------
-- 14. Stockage des fichiers des répondants (bucket privé « form-uploads »)
--     Chemin : <workspace_id>/<form_id>/<response_id>/<fichier>
--     Écriture : uniquement via URL signée émise par la fonction Edge.
--     Lecture : membres de l'espace ayant « formulaires » en lecture.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
      values ('form-uploads', 'form-uploads', false, 10485760)
      on conflict (id) do update set public = false, file_size_limit = 10485760;
    execute 'drop policy if exists form_uploads_read on storage.objects';
    execute $p$create policy form_uploads_read on storage.objects for select to authenticated
      using (bucket_id = 'form-uploads' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and public.has_capability(((storage.foldername(name))[1])::uuid, 'forms', 'read'))$p$;
  end if;
end $$;

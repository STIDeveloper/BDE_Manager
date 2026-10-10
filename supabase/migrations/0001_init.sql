-- ============================================================
-- BDE Manager — backend collaboratif (Supabase / Postgres)
-- Migration 0001 : schéma, droits (RLS), RPC, audit, stockage.
-- ============================================================
-- À exécuter UNE fois dans Supabase › SQL Editor (copier-coller du fichier
-- entier puis « Run »). Le script est idempotent : le relancer ne casse rien
-- (les tables existantes sont conservées, fonctions et politiques recréées).
--
-- Principes :
--  * Toutes les données des modules sont des « enregistrements » génériques
--    (table records : espace × collection × id → JSON). Le client ne fait
--    que pousser / recevoir ces enregistrements.
--  * Les droits sont TOUJOURS contrôlés ici (RLS) : l'interface ne fait que
--    masquer les actions. Un utilisateur ne lit / n'écrit une collection que
--    s'il est membre de l'espace ET possède le niveau de capacité requis.
--  * Dernier écrit gagne : updated_at est posé par le serveur (trigger).
--  * Suppression logique (deleted = true) pour que les autres appareils
--    reçoivent la suppression.
--  * Aucune donnée métier n'est copiée dans le journal d'audit (uniquement
--    qui / quoi / quand).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Référentiels : capacités et niveaux
-- ------------------------------------------------------------
create table if not exists public.capabilities (
  id    text primary key,
  label text not null
);

insert into public.capabilities (id, label) values
  ('members', 'Membres'), ('catalog', 'Rôles & pôles'), ('drive', 'Drive'),
  ('documents', 'Documents'), ('organization', 'Profil de l''association'),
  ('vault', 'Coffre-fort'), ('recruitment', 'Recrutement'), ('finance', 'Trésorerie'),
  ('membership', 'Adhésions'), ('events', 'Événements'), ('calendar', 'Agenda'),
  ('handover', 'Passations'), ('admin', 'Administration')
on conflict (id) do update set label = excluded.label;

-- Rang d'un niveau : none < read < write < validate < manage
create or replace function public.level_rank(p_level text)
returns int language sql immutable as $$
  select case p_level
    when 'read' then 1 when 'write' then 2 when 'validate' then 3 when 'manage' then 4
    else 0 end
$$;

-- Rôles d'accès (distincts des rôles du BDE : président, trésorier…)
create or replace function public.is_access_role(p_role text)
returns boolean language sql immutable as $$
  select p_role in ('owner', 'bureau', 'tresorier', 'membre', 'lecteur')
$$;

-- ------------------------------------------------------------
-- 2. Espaces, membres, droits, invitations
-- ------------------------------------------------------------
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (public.is_access_role(role)),
  member_id    text check (member_id is null or char_length(member_id) <= 200),  -- fiche membre du BDE
  email        text,                                                               -- copie pour l'affichage
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.roles_grants (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role         text not null check (public.is_access_role(role)),
  capability   text not null references public.capabilities (id) on delete cascade,
  level        text not null check (level in ('none', 'read', 'write', 'validate', 'manage')),
  primary key (workspace_id, role, capability)
);

create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (char_length(email) between 3 and 254),
  role         text not null check (public.is_access_role(role) and role <> 'owner'),
  token        text not null unique,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists invitations_ws_idx on public.invitations (workspace_id);

-- ------------------------------------------------------------
-- 3. Enregistrements synchronisés
-- ------------------------------------------------------------
create table if not exists public.records (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  collection   text not null check (collection ~ '^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$' and char_length(collection) <= 80),
  id           text not null check (char_length(id) between 1 and 200),
  data         jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 5000000),
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  primary key (workspace_id, collection, id)
);
create index if not exists records_ws_updated_idx on public.records (workspace_id, updated_at);
create index if not exists records_ws_collection_idx on public.records (workspace_id, collection);

-- Collection → capacité (préfixe le plus long). Une collection inconnue
-- relève de sa première partie si c'est une capacité, sinon d'« admin ».
create table if not exists public.collection_capabilities (
  prefix     text primary key,
  capability text not null references public.capabilities (id) on delete cascade
);

insert into public.collection_capabilities (prefix, capability) values
  ('core.members', 'members'), ('core.columns', 'members'), ('core.badges', 'members'),
  ('core.poles', 'catalog'), ('core.levels', 'catalog'), ('core.roles', 'catalog'),
  ('core.folders', 'drive'), ('core.folderTags', 'drive'), ('core.drivePermissions', 'drive'),
  ('core.permissionNotes', 'drive'), ('core.rolePresets', 'drive'),
  ('core.organization', 'organization'), ('core.documentLog', 'documents'),
  ('core.vault', 'vault'),
  ('recruitment.', 'recruitment'), ('finance.', 'finance'), ('membership.', 'membership'),
  ('events.', 'events'), ('calendar.', 'calendar'), ('handover.', 'handover'),
  ('documents.', 'documents'), ('docs.', 'documents'), ('dashboard.', 'calendar')
on conflict (prefix) do update set capability = excluded.capability;

-- ------------------------------------------------------------
-- 4. Registre public des documents, numérotation, audit
-- ------------------------------------------------------------
create table if not exists public.document_registry_public (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ref          text not null,
  fingerprint  text not null,
  title        text,
  template_id  text,
  issued_at    timestamptz,
  revoked      boolean not null default false,
  primary key (workspace_id, ref)
);
create index if not exists document_registry_ref_idx on public.document_registry_public (ref, fingerprint);

create table if not exists public.document_sequences (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  year         int not null check (year between 2000 and 2100),
  last_value   int not null default 0 check (last_value >= 0),
  primary key (workspace_id, year)
);

create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid,
  action       text not null,
  collection   text,
  record_id    text,
  at           timestamptz not null default now()
);
create index if not exists audit_log_ws_at_idx on public.audit_log (workspace_id, at desc);

-- ------------------------------------------------------------
-- 5. Fonctions de contrôle d'accès (security definer : lisent les
--    tables de droits sans être soumises aux RLS → pas de récursion)
-- ------------------------------------------------------------
create or replace function public.member_role(p_ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.workspace_members where workspace_id = p_ws and user_id = auth.uid()
$$;

create or replace function public.is_member(p_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = p_ws and user_id = auth.uid())
$$;

create or replace function public.has_capability(p_ws uuid, p_capability text, p_level text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_level text;
begin
  if auth.uid() is null or p_ws is null then return false; end if;
  select role into v_role from public.workspace_members where workspace_id = p_ws and user_id = auth.uid();
  if v_role is null then return false; end if;
  if v_role = 'owner' then return true; end if;   -- le propriétaire a toujours tous les droits
  select level into v_level from public.roles_grants
    where workspace_id = p_ws and role = v_role and capability = p_capability;
  return public.level_rank(coalesce(v_level, 'none')) >= public.level_rank(p_level);
end $$;

-- Au moins un droit d'écriture quelque part (pièces jointes).
create or replace function public.can_write_any(p_ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.member_role(p_ws) = 'owner' or exists (
    select 1 from public.roles_grants g
    where g.workspace_id = p_ws and g.role = public.member_role(p_ws) and public.level_rank(g.level) >= 2)
$$;

create or replace function public.collection_capability(p_collection text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select capability from public.collection_capabilities
      where p_collection = prefix or (right(prefix, 1) = '.' and left(p_collection, char_length(prefix)) = prefix)
      order by char_length(prefix) desc limit 1),
    (select id from public.capabilities where id = split_part(p_collection, '.', 1)),
    'admin')
$$;

-- ------------------------------------------------------------
-- 6. Droits par défaut d'un espace
-- ------------------------------------------------------------
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
        when 'handover' then 'read' else 'none' end
      when 'membre' then case c.id
        when 'events' then 'read' when 'calendar' then 'read' when 'documents' then 'read'
        when 'organization' then 'read' when 'catalog' then 'read' else 'none' end
      when 'lecteur' then case c.id
        when 'vault' then 'none' when 'recruitment' then 'none' when 'admin' then 'none' else 'read' end
    end
  from (values ('owner'), ('bureau'), ('tresorier'), ('membre'), ('lecteur')) as r(role)
  cross join public.capabilities c
  on conflict (workspace_id, role, capability) do nothing;
end $$;

-- ------------------------------------------------------------
-- 7. Triggers sur records : horodatage serveur, règles métier, audit,
--    registre public des documents
-- ------------------------------------------------------------
create or replace function public.records_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old_status text;
  v_new_status text;
  v_key text;
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id <> old.workspace_id or new.collection <> old.collection or new.id <> old.id then
      raise exception 'Clé d''enregistrement non modifiable' using errcode = '42501';
    end if;
  end if;
  new.updated_at := clock_timestamp();   -- dernier écrit gagne (horloge serveur)
  new.updated_by := auth.uid();

  -- Trésorerie : valider / rejeter une opération exige finance ≥ validate.
  if new.collection = 'finance.transactions' and not new.deleted then
    v_new_status := new.data #>> '{v,status}';
    v_old_status := case when tg_op = 'UPDATE' and not old.deleted then old.data #>> '{v,status}' end;
    if v_new_status in ('validated', 'rejected') and v_new_status is distinct from v_old_status
       and auth.uid() is not null
       and not public.has_capability(new.workspace_id, 'finance', 'validate') then
      raise exception 'Validation réservée au trésorier (droit finance « valider »)' using errcode = '42501';
    end if;
  end if;

  -- Coffre-fort : seule la version CHIFFRÉE peut être synchronisée.
  if new.collection = 'core.vault' and jsonb_typeof(new.data -> 'v') = 'object' then
    for v_key in select jsonb_object_keys(new.data -> 'v') loop
      if v_key not in ('vaultSalt', 'vaultVerifier', 'vaultEntriesBlob') then
        raise exception 'Coffre : champ non autorisé (%)', v_key using errcode = '22023';
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write before insert or update on public.records
  for each row execute function public.records_before_write();

create or replace function public.records_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_entry jsonb;
begin
  v_action := case
    when tg_op = 'INSERT' then case when new.deleted then 'delete' else 'create' end
    when new.deleted and not old.deleted then 'delete'
    when not new.deleted and old.deleted then 'restore'
    else 'update' end;
  insert into public.audit_log (workspace_id, user_id, action, collection, record_id)
    values (new.workspace_id, auth.uid(), v_action, new.collection, new.id);

  -- Registre public : uniquement réf., empreinte, intitulé générique, date.
  if new.collection = 'core.documentLog' then
    v_entry := new.data -> 'v';
    if not new.deleted and coalesce(v_entry ->> 'ref', '') ~ '^[A-Z0-9]{1,12}-[0-9]{4}-[0-9]{4,}$'
       and coalesce(v_entry ->> 'fingerprint', '') <> '' then
      insert into public.document_registry_public (workspace_id, ref, fingerprint, title, template_id, issued_at, revoked)
      values (
        new.workspace_id,
        v_entry ->> 'ref',
        upper(left(v_entry ->> 'fingerprint', 32)),
        -- l'intitulé est coupé avant « — » (les titres y placent le nom de la personne)
        left(split_part(coalesce(v_entry ->> 'title', ''), ' — ', 1), 120),
        left(v_entry ->> 'templateId', 80),
        case when (v_entry ->> 'createdAt') ~ '^\d{4}-\d{2}-\d{2}T' then (v_entry ->> 'createdAt')::timestamptz else now() end,
        false)
      on conflict (workspace_id, ref) do update
        set fingerprint = excluded.fingerprint, title = excluded.title, template_id = excluded.template_id, revoked = false;
    elsif new.deleted and tg_op = 'UPDATE' then
      update public.document_registry_public set revoked = true
        where workspace_id = new.workspace_id and ref = old.data #>> '{v,ref}';
    end if;
  end if;
  return null;
end $$;

drop trigger if exists records_after_write on public.records;
create trigger records_after_write after insert or update on public.records
  for each row execute function public.records_after_write();

-- ------------------------------------------------------------
-- 8. RPC
-- ------------------------------------------------------------
create or replace function public.audit(p_ws uuid, p_action text, p_collection text default null, p_record text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (workspace_id, user_id, action, collection, record_id)
  values (p_ws, auth.uid(), p_action, p_collection, p_record)
$$;

create or replace function public.create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_ws uuid;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 80 then raise exception 'Nom d''espace invalide (1 à 80 caractères)' using errcode = '22023'; end if;
  if (select count(*) from public.workspace_members where user_id = v_uid and role = 'owner') >= 10 then
    raise exception 'Limite atteinte : 10 espaces par compte' using errcode = '54000';
  end if;
  insert into public.workspaces (name, created_by) values (v_name, v_uid) returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, email)
    values (v_ws, v_uid, 'owner', (select email from auth.users where id = v_uid));
  perform public.seed_default_grants(v_ws);
  perform public.audit(v_ws, 'workspace.create');
  return v_ws;
end $$;

create or replace function public.my_grants(p_ws uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.member_role(p_ws);
begin
  if v_role is null then return null; end if;
  return jsonb_build_object(
    'role', v_role,
    'user_id', auth.uid(),
    'member_id', (select member_id from public.workspace_members where workspace_id = p_ws and user_id = auth.uid()),
    'grants', (
      select coalesce(jsonb_object_agg(c.id,
        case when v_role = 'owner' then 'manage' else coalesce(g.level, 'none') end), '{}'::jsonb)
      from public.capabilities c
      left join public.roles_grants g on g.workspace_id = p_ws and g.role = v_role and g.capability = c.id));
end $$;

create or replace function public.invite_member(p_ws uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
begin
  if not public.has_capability(p_ws, 'admin', 'manage') then raise exception 'Droit « administration » requis' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'Adresse e-mail invalide' using errcode = '22023'; end if;
  if not public.is_access_role(p_role) or p_role = 'owner' then raise exception 'Rôle d''accès invalide' using errcode = '22023'; end if;
  if (select count(*) from public.invitations where workspace_id = p_ws and accepted_at is null and expires_at > now()) >= 200 then
    raise exception 'Trop d''invitations en attente' using errcode = '54000';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.invitations (workspace_id, email, role, token, created_by)
    values (p_ws, v_email, p_role, v_token, auth.uid());
  perform public.audit(p_ws, 'invitation.create', null, p_role);
  return v_token;
end $$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
  v_email text;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if coalesce(p_token, '') !~ '^[a-f0-9]{64}$' then raise exception 'Invitation invalide' using errcode = '22023'; end if;
  select * into v_inv from public.invitations where token = p_token for update;
  if not found then raise exception 'Invitation introuvable' using errcode = 'P0002'; end if;
  if v_inv.accepted_at is not null then raise exception 'Invitation déjà utilisée' using errcode = '22023'; end if;
  if v_inv.expires_at < now() then raise exception 'Invitation expirée' using errcode = '22023'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is distinct from v_inv.email then
    raise exception 'Cette invitation est destinée à une autre adresse e-mail' using errcode = '42501';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, email)
    values (v_inv.workspace_id, v_uid, v_inv.role, v_email)
    on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  perform public.audit(v_inv.workspace_id, 'invitation.accept', null, v_inv.role);
  return v_inv.workspace_id;
end $$;

create or replace function public.set_grant(p_ws uuid, p_role text, p_capability text, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.member_role(p_ws) is distinct from 'owner' then raise exception 'Réservé au propriétaire de l''espace' using errcode = '42501'; end if;
  if not public.is_access_role(p_role) or p_role = 'owner' then raise exception 'Rôle invalide' using errcode = '22023'; end if;
  if not exists (select 1 from public.capabilities where id = p_capability) then raise exception 'Capacité inconnue' using errcode = '22023'; end if;
  if p_level not in ('none', 'read', 'write', 'validate', 'manage') then raise exception 'Niveau invalide' using errcode = '22023'; end if;
  insert into public.roles_grants (workspace_id, role, capability, level) values (p_ws, p_role, p_capability, p_level)
    on conflict (workspace_id, role, capability) do update set level = excluded.level;
  perform public.audit(p_ws, 'grant.set', p_capability, p_role || ':' || p_level);
end $$;

create or replace function public.set_member_role(p_ws uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_current text;
begin
  if not public.has_capability(p_ws, 'admin', 'manage') then raise exception 'Droit « administration » requis' using errcode = '42501'; end if;
  if not public.is_access_role(p_role) then raise exception 'Rôle invalide' using errcode = '22023'; end if;
  select role into v_current from public.workspace_members where workspace_id = p_ws and user_id = p_user for update;
  if v_current is null then raise exception 'Membre introuvable' using errcode = 'P0002'; end if;
  -- Seul un propriétaire peut nommer / destituer un propriétaire.
  if (p_role = 'owner' or v_current = 'owner') and public.member_role(p_ws) <> 'owner' then
    raise exception 'Réservé au propriétaire de l''espace' using errcode = '42501';
  end if;
  if v_current = 'owner' and p_role <> 'owner'
     and (select count(*) from public.workspace_members where workspace_id = p_ws and role = 'owner') <= 1 then
    raise exception 'L''espace doit garder au moins un propriétaire' using errcode = '22023';
  end if;
  update public.workspace_members set role = p_role where workspace_id = p_ws and user_id = p_user;
  perform public.audit(p_ws, 'member.role', null, p_role);
end $$;

create or replace function public.link_member(p_ws uuid, p_user uuid, p_member_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_capability(p_ws, 'admin', 'manage') then raise exception 'Droit « administration » requis' using errcode = '42501'; end if;
  if p_member_id is not null and char_length(p_member_id) > 200 then raise exception 'Identifiant invalide' using errcode = '22023'; end if;
  update public.workspace_members set member_id = nullif(btrim(p_member_id), '') where workspace_id = p_ws and user_id = p_user;
  if not found then raise exception 'Membre introuvable' using errcode = 'P0002'; end if;
  perform public.audit(p_ws, 'member.link');
end $$;

create or replace function public.remove_member(p_ws uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target text;
begin
  if p_user is distinct from auth.uid() and not public.has_capability(p_ws, 'admin', 'manage') then
    raise exception 'Droit « administration » requis' using errcode = '42501';
  end if;
  select role into v_target from public.workspace_members where workspace_id = p_ws and user_id = p_user for update;
  if v_target is null then raise exception 'Membre introuvable' using errcode = 'P0002'; end if;
  if v_target = 'owner' and p_user is distinct from auth.uid() and public.member_role(p_ws) <> 'owner' then
    raise exception 'Réservé au propriétaire de l''espace' using errcode = '42501';
  end if;
  if v_target = 'owner' and (select count(*) from public.workspace_members where workspace_id = p_ws and role = 'owner') <= 1 then
    raise exception 'L''espace doit garder au moins un propriétaire (nomme un autre propriétaire avant de partir)' using errcode = '22023';
  end if;
  perform public.audit(p_ws, case when p_user = auth.uid() then 'member.leave' else 'member.remove' end);
  delete from public.workspace_members where workspace_id = p_ws and user_id = p_user;
end $$;

-- Numérotation atomique : une seule instruction UPSERT verrouille la ligne
-- (espace, année) → deux utilisateurs ne peuvent jamais obtenir le même numéro.
create or replace function public.reserve_document_refs(p_ws uuid, p_year int, p_count int)
returns int[] language plpgsql security definer set search_path = public as $$
declare
  v_last int;
begin
  if not public.has_capability(p_ws, 'documents', 'write') then raise exception 'Droit « documents » en écriture requis' using errcode = '42501'; end if;
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'Année invalide' using errcode = '22023'; end if;
  if p_count is null or p_count not between 1 and 500 then raise exception 'Nombre de numéros invalide (1 à 500)' using errcode = '22023'; end if;
  insert into public.document_sequences as s (workspace_id, year, last_value) values (p_ws, p_year, p_count)
    on conflict (workspace_id, year) do update set last_value = s.last_value + p_count
    returning last_value into v_last;
  return array(select generate_series(v_last - p_count + 1, v_last));
end $$;

-- Aligne la séquence serveur sur un compteur local (publication initiale) :
-- ne fait jamais reculer la séquence.
create or replace function public.bump_document_sequence(p_ws uuid, p_year int, p_at_least int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_last int;
begin
  if not public.has_capability(p_ws, 'documents', 'write') then raise exception 'Droit « documents » en écriture requis' using errcode = '42501'; end if;
  if p_year is null or p_year not between 2000 and 2100 or p_at_least is null or p_at_least not between 0 and 1000000 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  insert into public.document_sequences as s (workspace_id, year, last_value) values (p_ws, p_year, p_at_least)
    on conflict (workspace_id, year) do update set last_value = greatest(s.last_value, p_at_least)
    returning last_value into v_last;
  return v_last;
end $$;

-- Vérification publique (anonyme) : validité + intitulé + date, rien d'autre.
-- Sans empreinte : indique seulement si la référence existe (ref_found).
-- Empreinte fausse : ref_found = true (document peut-être modifié).
create or replace function public.verify_document(p_ref text, p_fingerprint text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_row public.document_registry_public%rowtype;
  v_fp text := upper(replace(coalesce(p_fingerprint, ''), '-', ''));
  v_ref text := upper(btrim(coalesce(p_ref, '')));
  v_found boolean;
begin
  if v_ref !~ '^[A-Z0-9]{1,12}-[0-9]{4}-[0-9]{4,8}$' or (v_fp <> '' and v_fp !~ '^[A-F0-9]{12}$') then
    return jsonb_build_object('valid', false, 'ref_found', false);
  end if;
  v_found := exists (select 1 from public.document_registry_public where ref = v_ref and not revoked);
  if v_fp = '' then
    return jsonb_build_object('valid', false, 'ref_found', v_found);
  end if;
  select * into v_row from public.document_registry_public
    where ref = v_ref and replace(fingerprint, '-', '') = v_fp
    order by revoked, issued_at desc limit 1;
  if not found or v_row.revoked then
    return jsonb_build_object('valid', false, 'ref_found', v_found, 'revoked', coalesce(v_row.revoked, false));
  end if;
  return jsonb_build_object('valid', true, 'title', v_row.title, 'issued_at', v_row.issued_at);
end $$;

-- ------------------------------------------------------------
-- 9. Row Level Security
-- ------------------------------------------------------------
alter table public.capabilities enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.roles_grants enable row level security;
alter table public.invitations enable row level security;
alter table public.records enable row level security;
alter table public.collection_capabilities enable row level security;
alter table public.document_registry_public enable row level security;
alter table public.document_sequences enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists capabilities_read on public.capabilities;
create policy capabilities_read on public.capabilities for select to authenticated using (true);

drop policy if exists collection_capabilities_read on public.collection_capabilities;
create policy collection_capabilities_read on public.collection_capabilities for select to authenticated using (true);

drop policy if exists workspaces_read on public.workspaces;
create policy workspaces_read on public.workspaces for select to authenticated using (public.is_member(id));
drop policy if exists workspaces_rename on public.workspaces;
create policy workspaces_rename on public.workspaces for update to authenticated
  using (public.member_role(id) = 'owner') with check (public.member_role(id) = 'owner');

drop policy if exists members_read on public.workspace_members;
create policy members_read on public.workspace_members for select to authenticated using (public.is_member(workspace_id));

drop policy if exists grants_read on public.roles_grants;
create policy grants_read on public.roles_grants for select to authenticated using (public.is_member(workspace_id));

drop policy if exists invitations_read on public.invitations;
create policy invitations_read on public.invitations for select to authenticated
  using (public.has_capability(workspace_id, 'admin', 'manage'));
drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.has_capability(workspace_id, 'admin', 'manage'));

drop policy if exists records_read on public.records;
create policy records_read on public.records for select to authenticated
  using (public.has_capability(workspace_id, public.collection_capability(collection), 'read'));
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated
  with check (public.has_capability(workspace_id, public.collection_capability(collection), 'write'));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (public.has_capability(workspace_id, public.collection_capability(collection), 'write'))
  with check (public.has_capability(workspace_id, public.collection_capability(collection), 'write'));
-- Pas de politique DELETE : suppression logique uniquement.

drop policy if exists registry_read on public.document_registry_public;
create policy registry_read on public.document_registry_public for select to authenticated
  using (public.has_capability(workspace_id, 'documents', 'read'));

drop policy if exists sequences_read on public.document_sequences;
create policy sequences_read on public.document_sequences for select to authenticated
  using (public.has_capability(workspace_id, 'documents', 'read'));

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (public.has_capability(workspace_id, 'admin', 'read'));

-- Privilèges : rien pour anon sauf verify_document ; les écritures sur les
-- tables de droits passent exclusivement par les RPC ci-dessus.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.capabilities, public.collection_capabilities, public.workspaces, public.workspace_members,
  public.roles_grants, public.invitations, public.document_registry_public, public.document_sequences,
  public.audit_log to authenticated;
grant select, insert, update on public.records to authenticated;
grant update (name) on public.workspaces to authenticated;
grant delete on public.invitations to authenticated;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on function public.level_rank(text), public.is_access_role(text), public.member_role(uuid),
  public.is_member(uuid), public.has_capability(uuid, text, text), public.can_write_any(uuid),
  public.collection_capability(text), public.create_workspace(text), public.my_grants(uuid),
  public.invite_member(uuid, text, text), public.accept_invitation(text), public.set_grant(uuid, text, text, text),
  public.set_member_role(uuid, uuid, text), public.link_member(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.reserve_document_refs(uuid, int, int), public.bump_document_sequence(uuid, int, int),
  public.verify_document(text, text)
  to authenticated;
grant execute on function public.verify_document(text, text) to anon;
-- Rôle technique de Supabase (tableau de bord, scripts d'administration).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant execute on all functions in schema public to service_role';
  end if;
end $$;
-- Fonctions des triggers : exécutables par les rôles qui écrivent dans records.
grant execute on function public.records_before_write(), public.records_after_write() to authenticated;

-- ------------------------------------------------------------
-- 10. Temps réel (Supabase Realtime) : diffusion des changements
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records') then
      execute 'alter publication supabase_realtime add table public.records';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_members') then
      execute 'alter publication supabase_realtime add table public.workspace_members';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roles_grants') then
      execute 'alter publication supabase_realtime add table public.roles_grants';
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 11. Stockage des pièces jointes (bucket privé « attachments »)
--     Chemin des objets : <workspace_id>/<attachment_id>
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
      values ('attachments', 'attachments', false, 10485760)
      on conflict (id) do update set public = false, file_size_limit = 10485760;

    execute 'drop policy if exists attachments_read on storage.objects';
    execute $p$create policy attachments_read on storage.objects for select to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and public.is_member(((storage.foldername(name))[1])::uuid))$p$;
    execute 'drop policy if exists attachments_insert on storage.objects';
    execute $p$create policy attachments_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'attachments' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and public.can_write_any(((storage.foldername(name))[1])::uuid))$p$;
    execute 'drop policy if exists attachments_update on storage.objects';
    execute $p$create policy attachments_update on storage.objects for update to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and public.can_write_any(((storage.foldername(name))[1])::uuid))$p$;
    execute 'drop policy if exists attachments_delete on storage.objects';
    execute $p$create policy attachments_delete on storage.objects for delete to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and public.can_write_any(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

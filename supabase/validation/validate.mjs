// ============================================================
// Validation hors ligne de la migration Supabase (schéma + RLS + RPC)
// ============================================================
// Exécute supabase/migrations/0001_init.sql dans PGlite (Postgres 17 en
// WebAssembly, sans Docker) avec un bouchon des schémas auth / storage, puis
// rejoue des scénarios multi-utilisateurs en se connectant comme le ferait
// Supabase (rôle « authenticated » ou « anon » + identifiant JWT).
//
// PGlite n'est PAS une dépendance du projet. Installation ponctuelle :
//   npm install --prefix <dossier-temporaire> @electric-sql/pglite
//   node supabase/validation/validate.mjs <dossier-temporaire>
// (ou variable d'environnement PGLITE_DIR)
//
// Code de sortie 0 si tous les contrôles passent, 1 sinon.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const pgliteDir = process.argv[2] || process.env.PGLITE_DIR;
if (!pgliteDir) {
  console.error('Usage : node supabase/validation/validate.mjs <dossier où @electric-sql/pglite est installé>');
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(join(pgliteDir, 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js')).href);

const migration = readFileSync(join(here, '..', 'migrations', '0001_init.sql'), 'utf8');
const stub = readFileSync(join(here, 'supabase_stub.sql'), 'utf8');

const db = new PGlite();
let passed = 0;
let failed = 0;
const check = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✔ ${label}`); } else { failed++; console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`); }
};

/** Exécute une requête « comme » un utilisateur (uid) ou anonymement (uid = null). */
async function as(uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    return tx.query(sql, params);
  });
}
/** Renvoie l'erreur levée (ou null si la requête réussit). */
async function fails(uid, sql, params = []) {
  try { await as(uid, sql, params); return null; } catch (e) {
    if (process.env.VERBOSE) console.log(`      ↳ refus attendu : ${e.message}`);
    return e;
  }
}

console.log('1. Migration');
await db.exec(stub);
await db.exec(migration);
check('migration exécutée', true);
await db.exec(migration);
check('migration ré-exécutable (idempotente)', true);
const rls = await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
check('RLS activée sur toutes les tables publiques', rls.rows.length === 0, JSON.stringify(rls.rows));
const pub = await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`).catch(() => ({ rows: [] }));
check('records publié pour le temps réel', pub.rows.some(r => r.tablename === 'records'), 'publication absente (non bloquant hors Supabase)');

// Utilisateurs
const U = Object.fromEntries(['alice', 'bob', 'carol', 'dave', 'frank', 'eve'].map(n => [n, randomUUID()]));
for (const [name, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${name}@exemple.fr`]);

console.log('2. Espaces et rôles');
const wsA = (await as(U.alice, `select public.create_workspace('BDE A') as id`)).rows[0].id;
const wsB = (await as(U.bob, `select public.create_workspace('BDE B') as id`)).rows[0].id;
check('création de deux espaces', wsA && wsB && wsA !== wsB);
check('nom vide refusé', !!(await fails(U.alice, `select public.create_workspace('   ')`)));
check('création anonyme refusée', !!(await fails(null, `select public.create_workspace('X')`)));
const gA = (await as(U.alice, 'select public.my_grants($1) as g', [wsA])).rows[0].g;
check('my_grants : alice propriétaire, tout en manage', gA.role === 'owner' && Object.values(gA.grants).every(l => l === 'manage'));
check('my_grants : non-membre → null', (await as(U.bob, 'select public.my_grants($1) as g', [wsA])).rows[0].g === null);

const invite = async (email, role) => (await as(U.alice, 'select public.invite_member($1, $2, $3) as t', [wsA, email, role])).rows[0].t;
const tCarol = await invite('carol@exemple.fr', 'membre');
check('jeton d\'invitation de 64 caractères hexadécimaux', /^[a-f0-9]{64}$/.test(tCarol));
check('invitation acceptée par une autre adresse refusée', !!(await fails(U.eve, 'select public.accept_invitation($1)', [tCarol])));
await as(U.carol, 'select public.accept_invitation($1)', [tCarol]);
check('invitation acceptée par la bonne adresse', (await as(U.carol, 'select public.my_grants($1) as g', [wsA])).rows[0].g.role === 'membre');
check('invitation non réutilisable', !!(await fails(U.carol, 'select public.accept_invitation($1)', [tCarol])));
check('invitation par un non-administrateur refusée', !!(await fails(U.carol, `select public.invite_member($1, 'x@y.fr', 'bureau')`, [wsA])));
check('invitation comme propriétaire refusée', !!(await fails(U.alice, `select public.invite_member($1, 'x@y.fr', 'owner')`, [wsA])));
await as(U.dave, 'select public.accept_invitation($1)', [await invite('dave@exemple.fr', 'tresorier')]);
await as(U.frank, 'select public.accept_invitation($1)', [await invite('frank@exemple.fr', 'bureau')]);
check('rejoindre un espace sans invitation impossible', !!(await fails(U.bob, `insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [wsA, U.bob])));

console.log('3. Enregistrements et RLS');
const put = (uid, ws, collection, id, data, deleted = false) => as(uid,
  `insert into public.records (workspace_id, collection, id, data, deleted, updated_at) values ($1, $2, $3, $4, $5, '2000-01-01')
   on conflict (workspace_id, collection, id) do update set data = excluded.data, deleted = excluded.deleted`,
  [ws, collection, id, JSON.stringify(data), deleted]);
await put(U.alice, wsA, 'core.members', 'm1', { v: { id: 'm1', firstName: 'Jeanne' } });
await put(U.alice, wsA, 'events.events', 'e1', { v: { id: 'e1', title: 'Soirée' } });
const r1 = (await as(U.alice, `select updated_at, updated_by from public.records where workspace_id = $1 and id = 'm1'`, [wsA])).rows[0];
check('updated_at posé par le serveur (horodatage client ignoré)', new Date(r1.updated_at).getFullYear() >= 2025);
check('updated_by = utilisateur authentifié', r1.updated_by === U.alice);
check('non-membre : lecture interdite (0 ligne)', (await as(U.bob, 'select * from public.records where workspace_id = $1', [wsA])).rows.length === 0);
check('non-membre : écriture refusée', !!(await fails(U.bob, `insert into public.records (workspace_id, collection, id, data) values ($1, 'core.members', 'x', '{}')`, [wsA])));
check('anonyme : lecture des records refusée', !!(await fails(null, 'select * from public.records')));
const carolSees = (await as(U.carol, 'select collection from public.records where workspace_id = $1', [wsA])).rows.map(r => r.collection);
check('membre : lit les événements mais pas les fiches membres', carolSees.includes('events.events') && !carolSees.includes('core.members'), carolSees.join(','));
check('membre : écriture sans capacité refusée', !!(await fails(U.carol, `update public.records set data = '{"v":{}}' where workspace_id = $1 and id = 'e1'`, [wsA]))
  || (await as(U.carol, `select data from public.records where workspace_id = $1 and id = 'e1'`, [wsA])).rows[0].data.v.title === 'Soirée');
check('membre : insertion sans capacité refusée', !!(await fails(U.carol, `insert into public.records (workspace_id, collection, id, data) values ($1, 'events.events', 'e2', '{}')`, [wsA])));
check('modification de la matrice par un non-propriétaire refusée', !!(await fails(U.frank, `select public.set_grant($1, 'membre', 'events', 'write')`, [wsA])));
await as(U.alice, `select public.set_grant($1, 'membre', 'events', 'write')`, [wsA]);
check('matrice modifiée par le propriétaire → membre peut écrire', !(await fails(U.carol, `insert into public.records (workspace_id, collection, id, data) values ($1, 'events.events', 'e2', '{"v":{"id":"e2"}}')`, [wsA])));
check('propriétaire : droits non modifiables', !!(await fails(U.alice, `select public.set_grant($1, 'owner', 'events', 'none')`, [wsA])));
check('suppression physique impossible (suppression logique seulement)', !!(await fails(U.alice, `delete from public.records where workspace_id = $1`, [wsA])));
check('docs.* relève de la capacité documents (bureau peut écrire)', !(await fails(U.frank, `insert into public.records (workspace_id, collection, id, data) values ($1, 'docs.archives', 'a1', '{"v":{}}')`, [wsA])));
check('collection inconnue → capacité admin (bureau ne peut pas écrire)', !!(await fails(U.frank, `insert into public.records (workspace_id, collection, id, data) values ($1, 'zzz.inconnu', 'a', '{}')`, [wsA])));
check('nom de collection invalide refusé', !!(await fails(U.alice, `insert into public.records (workspace_id, collection, id, data) values ($1, 'Pas Valide', 'a', '{}')`, [wsA])));

console.log('4. Trésorerie : validation réservée');
check('bureau : crée une dépense en attente', !(await fails(U.frank, `insert into public.records (workspace_id, collection, id, data) values ($1, 'finance.transactions', 't1', '{"v":{"id":"t1","status":"pending"}}')`, [wsA])));
check('bureau : validation refusée', !!(await fails(U.frank, `update public.records set data = '{"v":{"id":"t1","status":"validated"}}' where workspace_id = $1 and id = 't1'`, [wsA])));
check('trésorier : validation acceptée', !(await fails(U.dave, `update public.records set data = '{"v":{"id":"t1","status":"validated"}}' where workspace_id = $1 and id = 't1'`, [wsA])));

console.log('5. Coffre-fort');
check('coffre : champ en clair refusé', !!(await fails(U.alice, `insert into public.records (workspace_id, collection, id, data) values ($1, 'core.vault', 'value', '{"v":{"vaultEntries":[{"password":"x"}]}}')`, [wsA])));
check('coffre : version chiffrée acceptée', !(await fails(U.alice, `insert into public.records (workspace_id, collection, id, data) values ($1, 'core.vault', 'value', '{"v":{"vaultSalt":"s","vaultVerifier":"v","vaultEntriesBlob":"b"}}')`, [wsA])));
check('trésorier : coffre illisible', (await as(U.dave, `select 1 from public.records where workspace_id = $1 and collection = 'core.vault'`, [wsA])).rows.length === 0);

console.log('6. Numérotation des documents');
const calls = [];
for (let i = 0; i < 60; i++) {
  const uid = i % 2 ? U.alice : U.dave;
  calls.push(as(uid, 'select public.reserve_document_refs($1, 2026, $2) as n', [wsA, 1 + (i % 3)]));
}
const nums = (await Promise.all(calls)).flatMap(r => r.rows[0].n);
const expected = Array.from({ length: nums.length }, (_, i) => i + 1);
check(`60 appels entrelacés (2 utilisateurs) → ${nums.length} numéros uniques et contigus`, new Set(nums).size === nums.length && [...nums].sort((a, b) => a - b).every((n, i) => n === expected[i]));
check('séquence propre à chaque espace', (await as(U.bob, 'select public.reserve_document_refs($1, 2026, 1) as n', [wsB])).rows[0].n[0] === 1);
check('sans droit documents.write : réservation refusée (membre)', !!(await fails(U.carol, 'select public.reserve_document_refs($1, 2026, 1)', [wsA])));
check('non-membre : réservation refusée', !!(await fails(U.bob, 'select public.reserve_document_refs($1, 2026, 1)', [wsA])));
check('nombre invalide refusé', !!(await fails(U.alice, 'select public.reserve_document_refs($1, 2026, 0)', [wsA])));
const bumped = (await as(U.alice, 'select public.bump_document_sequence($1, 2026, 5) as n', [wsA])).rows[0].n;
check('alignement de séquence : ne recule jamais', bumped === nums.length);

console.log('7. Vérification publique');
await put(U.alice, wsA, 'core.documentLog', 'd1', { v: { id: 'd1', ref: 'BDEA-2026-0007', fingerprint: 'ABCD-1234-EF56', title: 'Pouvoir AG — Jeanne Martin', templateId: 'pouvoir-ag', memberIds: ['m1'], createdAt: '2026-03-01T10:00:00.000Z' } });
const v1 = (await as(null, `select public.verify_document('BDEA-2026-0007', 'abcd-1234-ef56') as r`)).rows[0].r;
check('anonyme : document valide', v1.valid === true && v1.title === 'Pouvoir AG' && !!v1.issued_at, JSON.stringify(v1));
check('aucune donnée personnelle renvoyée', !JSON.stringify(v1).includes('Jeanne') && Object.keys(v1).sort().join(',') === 'issued_at,title,valid');
const vBad = (await as(null, `select public.verify_document('BDEA-2026-0007', 'ABCD-1234-0000') as r`)).rows[0].r;
check('empreinte fausse → invalide, référence signalée existante', vBad.valid === false && vBad.ref_found === true);
const vRef = (await as(null, `select public.verify_document('BDEA-2026-0007', '') as r`)).rows[0].r;
check('référence seule → existence uniquement (aucun titre)', vRef.valid === false && vRef.ref_found === true && !('title' in vRef));
check('référence inconnue → introuvable', (await as(null, `select public.verify_document('BDEA-2026-9999', 'ABCD-1234-EF56') as r`)).rows[0].r.ref_found === false);
check('entrée malformée → invalide sans erreur', (await as(null, `select public.verify_document('x''; drop table records; --', 'z') as r`)).rows[0].r.valid === false);
check('anonyme : registre non lisible directement', !!(await fails(null, 'select * from public.document_registry_public')));
await put(U.alice, wsA, 'core.documentLog', 'd1', { v: { id: 'd1', ref: 'BDEA-2026-0007' } }, true);
const v2 = (await as(null, `select public.verify_document('BDEA-2026-0007', 'ABCD-1234-EF56') as r`)).rows[0].r;
check('entrée supprimée du registre → révoquée', v2.valid === false && v2.revoked === true);

console.log('8. Journal d\'audit et membres');
const audit = (await as(U.alice, 'select action, collection, record_id from public.audit_log where workspace_id = $1', [wsA])).rows;
check('audit : écritures journalisées (sans contenu)', audit.some(a => a.action === 'create' && a.record_id === 'm1') && audit.some(a => a.action === 'delete' && a.record_id === 'd1'));
check('audit : aucune donnée métier stockée', !JSON.stringify(audit).includes('Jeanne'));
check('audit : illisible pour un membre sans droit admin', (await as(U.carol, 'select 1 from public.audit_log where workspace_id = $1', [wsA])).rows.length === 0);
check('audit : illisible pour un non-membre', (await as(U.bob, 'select 1 from public.audit_log where workspace_id = $1', [wsA])).rows.length === 0);
check('dernier propriétaire ne peut pas partir', !!(await fails(U.alice, 'select public.remove_member($1, $2)', [wsA, U.alice])));
check('bureau ne peut pas changer de rôle', !!(await fails(U.frank, `select public.set_member_role($1, $2, 'owner')`, [wsA, U.frank])));
await as(U.alice, `select public.link_member($1, $2, 'm1')`, [wsA, U.carol]);
check('lien compte ↔ fiche membre', (await as(U.carol, 'select public.my_grants($1) as g', [wsA])).rows[0].g.member_id === 'm1');
check('un membre peut quitter l\'espace', !(await fails(U.carol, 'select public.remove_member($1, $2)', [wsA, U.carol])));
check('après départ : plus aucun accès', (await as(U.carol, 'select 1 from public.records where workspace_id = $1', [wsA])).rows.length === 0);

console.log('9. Stockage des pièces jointes');
check('membre en écriture : dépôt dans son espace', !(await fails(U.alice, `insert into storage.objects (bucket_id, name) values ('attachments', $1)`, [`${wsA}/f1`])));
check('non-membre : dépôt refusé', !!(await fails(U.bob, `insert into storage.objects (bucket_id, name) values ('attachments', $1)`, [`${wsA}/f2`])));
check('non-membre : fichier invisible', (await as(U.bob, `select 1 from storage.objects where name like $1`, [`${wsA}/%`])).rows.length === 0);
check('bucket privé', (await db.query(`select public from storage.buckets where id = 'attachments'`)).rows[0].public === false);

console.log(`\nRésultat : ${passed} contrôles réussis, ${failed} en échec.`);
await db.close();
process.exit(failed ? 1 : 0);

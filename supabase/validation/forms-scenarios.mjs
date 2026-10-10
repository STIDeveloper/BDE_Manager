// ============================================================
// Validation hors ligne — Studio Formulaires (migration 0002)
// ============================================================
// Appelé par validate.mjs après les scénarios de 0001 (même base PGlite).
// Rejoue le VRAI cœur des fonctions Edge (supabase/functions/_shared/*.js)
// avec la copie générée du moteur de règles (node scripts/build-edge.mjs),
// la base étant appelée comme le ferait la clé de service (rôle
// service_role). Seuls Turnstile, Brevo, HelloAsso et le stockage sont
// simulés (aucun appel réseau).
// ============================================================

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '..', 'functions', '_shared');

export async function run({ db, as, fails, check, U, wsA, wsB }) {
  const enginePath = join(shared, 'forms-engine', 'index.js');
  if (!existsSync(enginePath)) {
    check('copie du moteur présente (lancer node scripts/build-edge.mjs)', false);
    return;
  }
  const engine = await import(pathToFileURL(enginePath).href);
  const { handleSubmit } = await import(pathToFileURL(join(shared, 'submit.js')).href);
  const { handleNotify } = await import(pathToFileURL(join(shared, 'notify.js')).href);
  const { handleCheckout, handleWebhook } = await import(pathToFileURL(join(shared, 'payment.js')).href);
  const { HttpError } = await import(pathToFileURL(join(shared, 'http.js')).href);
  const { sha256Hex } = await import(pathToFileURL(join(shared, 'util.js')).href);

  // ── Appels « clé de service » (comme supabase-js admin.rpc) ──────────
  const sigs = new Map();
  async function svc(name, params = {}) {
    if (!sigs.has(name)) {
      const r = await db.query(`select proargnames as n, array(select format_type(t, null) from unnest(proargtypes::oid[]) t) as t
        from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and proname = $1`, [name]);
      if (!r.rows.length) return { data: null, error: { message: `fonction ${name} absente` } };
      sigs.set(name, r.rows[0]);
    }
    const { n, t } = sigs.get(name);
    const vals = [];
    const args = Object.entries(params).map(([k, v]) => {
      const type = t[n.indexOf(k)];
      let val = v;
      if (v === null || v === undefined) val = null;
      else if (type === 'jsonb') val = JSON.stringify(v);
      else if (type.endsWith('[]')) val = `{${v.map(x => `"${String(x).replace(/["\\]/g, '\\$&')}"`).join(',')}}`;
      vals.push(val);
      return `${k} => $${vals.length}::${type}`;
    });
    try {
      const res = await db.transaction(async (tx) => {
        await tx.query('set local role service_role');
        return tx.query(`select public.${name}(${args.join(', ')}) as r`, vals);
      });
      return { data: res.rows[0].r, error: null };
    } catch (e) {
      if (process.env.VERBOSE) console.log(`      ↳ rpc ${name} : ${e.message}`);
      return { data: null, error: e };
    }
  }
  const sql = (q, p = []) => db.query(q, p);
  const emails = [];
  const users = Object.fromEntries((await sql('select id, email from auth.users')).rows.map(r => [r.id, r.email]));
  const deps = (extra = {}) => ({
    rpc: svc,
    getUser: async (jwt) => (jwt.startsWith('jwt:') && users[jwt.slice(4)] ? { id: jwt.slice(4), email: users[jwt.slice(4)] } : null),
    verifyTurnstile: null,
    createUploadUrl: async (path) => ({ signedUrl: `https://stockage.test/${path}`, token: 'jeton-signé', path }),
    sendEmail: async (msg) => { emails.push(msg); return { ok: true, status: 201 }; },
    background: (p) => p,
    engine,
    env: { appOrigin: 'https://bde-manager.vercel.app', rateSalt: 'sel', appUrl: 'https://bde-manager.vercel.app' },
    now: () => new Date(),
    ...extra,
  });
  /** Envoi → { status, body } (les HttpError deviennent un statut). */
  async function submit(body, { user = null, ip = '203.0.113.1', origin = 'https://bde-manager.vercel.app', ...extra } = {}) {
    try {
      return await handleSubmit({ body, origin, ip, userJwt: user ? `jwt:${user}` : null }, deps(extra));
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { ok: false, error: e.message, ...e.extra } };
      throw e;
    }
  }

  // ── Utilisateurs supplémentaires ──────────────────────────────────────
  U.ines = randomUUID();
  await sql('insert into auth.users (id, email) values ($1, $2)', [U.ines, 'ines@exemple.fr']);
  users[U.ines] = 'ines@exemple.fr';
  const tIn = (await as(U.alice, `select public.invite_member($1, 'ines@exemple.fr', 'membre') as t`, [wsA])).rows[0].t;
  await as(U.ines, 'select public.accept_invitation($1)', [tIn]);

  console.log('10. Formulaires : schéma et droits');
  const rlsOff = await sql(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  check('RLS activée sur toutes les tables (0001 + 0002)', rlsOff.rows.length === 0, JSON.stringify(rlsOff.rows));
  const gI = (await as(U.ines, 'select public.my_grants($1) as g', [wsA])).rows[0].g;
  check('capacités forms/tasks ajoutées aux espaces existants (membre : lecture)', gI.grants.forms === 'read' && gI.grants.tasks === 'read');
  const gF = (await as(U.frank, 'select public.my_grants($1) as g', [wsA])).rows[0].g;
  check('bureau : forms en écriture', gF.grants.forms === 'write');
  const wsC = (await as(U.eve, `select public.create_workspace('BDE C') as id`)).rows[0].id;
  const gNew = (await sql(`select level from public.roles_grants where workspace_id = $1 and role = 'membre' and capability = 'forms'`, [wsC])).rows[0];
  check('nouvel espace : droits forms semés par défaut', gNew?.level === 'read');
  check('correctif 0001 : audit() non appelable directement', !!(await fails(U.bob, `select public.audit($1, 'faux')`, [wsA])));
  check('correctif 0001 : seed_default_grants() non appelable directement', !!(await fails(U.bob, 'select public.seed_default_grants($1)', [wsA])));
  for (const t of ['forms', 'form_responses', 'form_drafts', 'vote_rights', 'vote_ballots', 'rate_limits']) {
    check(`anonyme : table ${t} inaccessible`, !!(await fails(null, `select 1 from public.${t}`)));
  }
  check('fonction interne forms_stats inaccessible (anon)', !!(await fails(null, `select public.forms_stats(gen_random_uuid(), '{}'::jsonb, null)`)));
  check('fonction de service forms_insert_response refusée (authenticated)', !!(await fails(U.alice,
    `select public.forms_insert_response(gen_random_uuid(), 1, gen_random_uuid(), '{}', '{}', null, null, null, null, null, false, '{}', false, '', 0)`)));

  console.log('11. Publication et versions');
  const q = (key, type, extra = {}) => ({ id: `q_${key}`, kind: 'question', key, type, label: extra.label || key, ...extra });
  const defInscription = {
    id: 'brouillon-wei', slug: 'wei-2027', title: 'Inscription WEI', kind: 'registration', status: 'published',
    pages: [{ id: 'p1', items: [
      q('nom', 'short_text', { label: 'Nom', required: true }),
      q('email', 'email', { label: 'Email', required: true, validation: { uniqueAcrossResponses: true } }),
      q('bus', 'single_choice', { label: 'Bus', required: true, options: [{ value: 'a', label: 'Bus A', capacity: 1 }, { value: 'b', label: 'Bus B' }] }),
      q('allergies', 'long_text', { label: 'Allergies', sensitive: true }),
      q('justificatif', 'file', { label: 'Justificatif', validation: { maxFiles: 2, accept: ['.pdf'] } }),
    ] }],
    variables: [], theme: {},
    settings: {
      access: 'link', identity: 'optional', allowEdit: 'until_close', saveDraft: true, showSummary: false,
      notifications: { onSubmit: ['bureau@exemple.fr'], respondentReceipt: true },
      antiSpam: { turnstile: false, honeypot: true, rateLimitPerHour: 50 },
      confirmation: { title: 'Merci', message: 'À bientôt au WEI !' },
      statuses: [{ id: 'received', label: 'Reçu' }, { id: 'accepted', label: 'Validé', final: true }],
    },
  };
  const pub1 = (await as(U.alice, 'select public.publish_form($1, $2, $3, $4) as r', [wsA, defInscription.id, 'wei-2027', defInscription])).rows[0].r;
  check('publication : version 1', pub1.version === 1 && pub1.slug === 'wei-2027');
  const pub2 = (await as(U.frank, 'select public.publish_form($1, $2, $3, $4) as r', [wsA, defInscription.id, 'wei-2027', defInscription])).rows[0].r;
  check('republication (bureau) : version 2, même formulaire', pub2.version === 2 && pub2.form_id === pub1.form_id);
  const formId = pub1.form_id;
  check('version publiée immuable', !!(await fails(U.alice, `update public.form_versions set definition = '{}' where form_id = $1`, [formId]))
    && (await sql('select count(*)::int as n from public.form_versions where form_id = $1', [formId])).rows[0].n === 2);
  check('membre (lecture) : publication refusée', !!(await fails(U.ines, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'x', 'autre', defInscription])));
  check('lien court déjà pris par un autre espace : refusé', !!(await fails(U.bob, 'select public.publish_form($1, $2, $3, $4)', [wsB, 'f-bob', 'wei-2027', defInscription])));
  check('définition sans page : refusée', !!(await fails(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'vide', 'vide', { ...defInscription, pages: [] }])));
  check('lien court invalide : refusé', !!(await fails(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'x2', 'Pas Valide!', defInscription])));
  check('définition trop volumineuse : refusée', !!(await fails(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'gros', 'gros',
    { ...defInscription, description: 'x'.repeat(1_100_000) }])));
  check('clés de questions en double : refusées', !!(await fails(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'dbl', 'dbl',
    { ...defInscription, pages: [{ id: 'p', items: [q('a', 'short_text'), { ...q('a', 'number'), id: 'autre' }] }] }])));

  const pubAnon = (await as(null, `select public.get_public_form('WEI-2027') as r`)).rows[0].r;
  check('anonyme : formulaire publié lisible (dernière version)', pubAnon.available === true && pubAnon.version === 2 && pubAnon.open === true);
  check('anonyme : notifications retirées de la définition', !JSON.stringify(pubAnon.definition).includes('bureau@exemple.fr'));
  check('anonyme : statistiques sans données de réponse', pubAnon.stats.total === 0 && 'bus' in pubAnon.stats.optionCounts);
  check('anonyme : brouillon / inconnu → indisponible', (await as(null, `select public.get_public_form('nexiste-pas') as r`)).rows[0].r.available === false);

  const defQuiz = { ...defInscription, id: 'quiz', slug: 'quiz-culture', title: 'Quiz', kind: 'quiz',
    pages: [{ id: 'p1', items: [q('capitale', 'single_choice', { options: [{ value: 'paris', label: 'Paris' }, { value: 'lyon', label: 'Lyon' }], score: { correct: 'paris', points: 2 } })] }],
    settings: { ...defInscription.settings, access: 'members' } };
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'quiz', 'quiz-culture', defQuiz]);
  check('formulaire « membres » : anonyme → connexion requise', (await as(null, `select public.get_public_form('quiz-culture') as r`)).rows[0].r.reason === 'auth_required');
  check('formulaire « membres » : non-membre → refusé', (await as(U.bob, `select public.get_public_form('quiz-culture') as r`)).rows[0].r.reason === 'forbidden');
  const quizIn = (await as(U.ines, `select public.get_public_form('quiz-culture') as r`)).rows[0].r;
  check('formulaire « membres » : membre → disponible, bonne réponse du quiz masquée',
    quizIn.available && !JSON.stringify(quizIn.definition).includes('"correct"') && JSON.stringify(quizIn.definition).includes('"points"'));

  // Automatisation sur nouvelle réponse (enregistrée par trigger, exécutée par l'app).
  await as(U.alice, `insert into public.automations (workspace_id, form_id, name, trigger, actions) values ($1, $2, 'Accueil', '{"event":"response.created"}', '[{"type":"email"}]')`, [wsA, formId]);
  await as(U.alice, `insert into public.automations (workspace_id, form_id, name, trigger, actions, requires_approval) values ($1, $2, 'Trésorerie', '{"event":"payment.paid"}', '[{"type":"finance"}]', true)`, [wsA, formId]);
  check('automatisation vers un formulaire d\'un autre espace : refusée', !!(await fails(U.bob,
    `insert into public.automations (workspace_id, form_id, trigger) values ($1, $2, '{"event":"response.created"}')`, [wsB, formId])));
  check('automatisation : déclencheur invalide refusé', !!(await fails(U.alice,
    `insert into public.automations (workspace_id, trigger) values ($1, '{"event":"n_importe_quoi"}')`, [wsA])));
  check('automatisation : membre (lecture) ne peut pas en créer', !!(await fails(U.ines,
    `insert into public.automations (workspace_id, trigger) values ($1, '{"event":"response.created"}')`, [wsA])));

  console.log('12. Envoi de réponses (cœur de forms-submit + moteur)');
  const ok1 = await submit({ slug: 'wei-2027', answers: { nom: 'Jeanne Martin', email: 'Jeanne@Exemple.fr', bus: 'a', allergies: 'arachide' },
    files: [{ key: 'justificatif', name: 'certificat médical.pdf', size: 12000, type: 'application/pdf' }] });
  check('réponse valide → 201 + jeton de modification', ok1.status === 201 && /^[a-f0-9]{64}$/.test(ok1.body.editToken), JSON.stringify(ok1.body));
  const r1 = (await sql('select * from public.form_responses where id = $1', [ok1.body.responseId])).rows[0];
  check('réponse enregistrée : version publiée, e-mail normalisé, jeton haché', r1?.version === 2 && r1.respondent_email === 'jeanne@exemple.fr'
    && r1.edit_token_hash === await sha256Hex(ok1.body.editToken) && !JSON.stringify(r1).includes(ok1.body.editToken));
  const up = ok1.body.uploads?.[0];
  check('téléversement : URL signée, chemin espace/formulaire/réponse/fichier', up && up.path.startsWith(`${wsA}/${formId}/${ok1.body.responseId}/`)
    && r1.answers.justificatif?.[0]?.path === up.path);
  check('accusé de réception (sans réponse sensible) + notification sans contenu',
    emails.length === 2 && emails[0].to[0].email === 'jeanne@exemple.fr' && !emails[0].html.includes('arachide') && emails[0].html.includes('Jeanne Martin')
    && !emails[1].html.includes('Jeanne'), JSON.stringify(emails.map(e => e.subject)));
  check('accusé de réception : contenu échappé', !emails[0].html.includes('<script'));
  const evs = (await sql(`select action from public.form_response_events where response_id = $1`, [r1.id])).rows.map(r => r.action);
  check('historique : événement « submitted »', evs.includes('submitted'));
  check('automatisation : déclenchement mis en file', (await sql(`select status from public.automation_runs where response_id = $1`, [r1.id])).rows.map(r => r.status).join() === 'queued');

  const bad = await submit({ slug: 'wei-2027', answers: { email: 'pas-un-email', bus: 'zzz' } });
  check('réponses invalides → 422 avec erreurs par champ', bad.status === 422 && bad.body.fields.nom && bad.body.fields.email, JSON.stringify(bad.body));
  const dupEmail = await submit({ slug: 'wei-2027', answers: { nom: 'Autre', email: 'jeanne@exemple.fr', bus: 'b' } });
  check('valeur unique déjà utilisée (email) → 409', dupEmail.status === 409 && dupEmail.body.fields?.email, JSON.stringify(dupEmail.body));
  const full = await submit({ slug: 'wei-2027', answers: { nom: 'Paul', email: 'paul@exemple.fr', bus: 'a' } });
  check('option complète (capacité 1, sans liste d’attente) → refus « complet » sur le champ', [409, 422].includes(full.status)
    && /complet/i.test(JSON.stringify(full.body)), JSON.stringify(full.body));
  const before = (await sql('select count(*)::int as n from public.form_responses')).rows[0].n;
  const hp = await submit({ slug: 'wei-2027', answers: { nom: 'Robot' }, honeypot: 'http://spam' });
  check('pot de miel rempli → faux succès, rien d\'enregistré', hp.status === 201 && (await sql('select count(*)::int as n from public.form_responses')).rows[0].n === before);
  check('origine non autorisée → 403', (await submit({ slug: 'wei-2027', answers: {} }, { origin: 'https://pirate.example' })).status === 403);
  check('fichier de type refusé → 422', (await submit({ slug: 'wei-2027', answers: { nom: 'X', email: 'x@exemple.fr', bus: 'b' },
    files: [{ key: 'justificatif', name: 'virus.exe', size: 10, type: 'application/x-msdownload' }] })).status === 422);

  // Concurrence : deux envois simultanés pour la dernière place → un seul accepté.
  const defCap = { ...defInscription, id: 'cap', slug: 'atelier', title: 'Atelier', settings: { ...defInscription.settings, maxResponses: 2, notifications: {} },
    pages: [{ id: 'p1', items: [q('nom', 'short_text', { required: true })] }] };
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'cap', 'atelier', defCap]);
  await submit({ slug: 'atelier', answers: { nom: 'A' } });
  const [c1, c2] = await Promise.all([submit({ slug: 'atelier', answers: { nom: 'B' } }), submit({ slug: 'atelier', answers: { nom: 'C' } })]);
  check('2 envois simultanés pour 1 place → 1 accepté, 1 refusé (contrôle optimiste)', [c1.status, c2.status].sort().join() === '201,409', `${c1.status},${c2.status}`);
  const wl = { ...defCap, id: 'cap-wl', slug: 'atelier-attente', settings: { ...defCap.settings, maxResponses: 1, waitlist: true } };
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'cap-wl', 'atelier-attente', wl]);
  await submit({ slug: 'atelier-attente', answers: { nom: 'A' } });
  const w2 = await submit({ slug: 'atelier-attente', answers: { nom: 'B' } });
  check('complet avec liste d\'attente → accepté en attente', w2.status === 201 && w2.body.waitlisted === true);
  const st = (await as(null, `select public.get_public_form('atelier-attente') as r`)).rows[0].r.stats;
  check('statistiques publiques : total / liste d\'attente / complet', st.total === 1 && st.waitlisted === 1 && st.full === true);

  // Quota à expression complexe : compté côté serveur avec le moteur.
  const defQuota = { ...defCap, id: 'quota', slug: 'repas', settings: { ...defCap.settings, maxResponses: null,
    quotas: [{ expr: 'age < 18 ET regime = "vege"', max: 1, message: 'Plus de place pour les mineurs végétariens.' }] },
    pages: [{ id: 'p1', items: [q('age', 'number', { required: true }), q('regime', 'dropdown', { options: [{ value: 'vege', label: 'Végé' }, { value: 'std', label: 'Standard' }] })] }] };
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'quota', 'repas', defQuota]);
  const qa = await submit({ slug: 'repas', answers: { age: 16, regime: 'vege' } });
  const qb = await submit({ slug: 'repas', answers: { age: 15, regime: 'vege' } });
  const qc = await submit({ slug: 'repas', answers: { age: 30, regime: 'vege' } });
  check('quota à expression (moteur côté serveur) : 2e mineur végé refusé, majeur accepté', qa.status === 201 && qb.status === 409 && qc.status === 201,
    `${qa.status},${qb.status},${qc.status} ${qb.body.error}`);

  // Anti-spam
  const defSpam = { ...defCap, id: 'spam', slug: 'contact', settings: { ...defCap.settings, maxResponses: null, antiSpam: { turnstile: true, honeypot: true, rateLimitPerHour: 2 } } };
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'spam', 'contact', defSpam]);
  check('Turnstile exigé mais secret absent → 503 explicite', (await submit({ slug: 'contact', answers: { nom: 'A' } }, { ip: '198.51.100.1' })).status === 503);
  const ts = { verifyTurnstile: async (tok) => tok === 'jeton-valide' };
  check('Turnstile : jeton invalide → 403', (await submit({ slug: 'contact', answers: { nom: 'A' }, turnstileToken: 'faux' }, { ip: '198.51.100.2', ...ts })).status === 403);
  check('Turnstile : jeton valide → 201', (await submit({ slug: 'contact', answers: { nom: 'A' }, turnstileToken: 'jeton-valide' }, { ip: '198.51.100.3', ...ts })).status === 201);
  const ip = '198.51.100.9';
  const rl = [];
  for (let i = 0; i < 3; i++) rl.push((await submit({ slug: 'contact', answers: { nom: `R${i}` }, turnstileToken: 'jeton-valide' }, { ip, ...ts })).status);
  check('limitation du débit (2/heure/IP) → 3e envoi 429', rl.join() === '201,201,429', rl.join());
  check('limitation : clé hachée (aucune IP stockée)', !(await sql('select key_hash from public.rate_limits')).rows.some(r => r.key_hash.includes('198.51')));

  // Identité requise, formulaire fermé
  const defId = { ...defCap, id: 'ident', slug: 'adhesion', settings: { ...defCap.settings, maxResponses: null, identity: 'required', onePerPerson: true } };
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'ident', 'adhesion', defId]);
  check('identité requise : anonyme → 401', (await submit({ slug: 'adhesion', answers: { nom: 'A' } })).status === 401);
  check('JWT invalide → 401', (await submit({ slug: 'adhesion', answers: { nom: 'A' } }, { user: randomUUID() })).status === 401);
  const e1 = await submit({ slug: 'adhesion', answers: { nom: 'Eve' } }, { user: U.eve });
  check('identité requise : utilisateur connecté → 201, rattaché au compte', e1.status === 201
    && (await sql('select respondent_user from public.form_responses where id = $1', [e1.body.responseId])).rows[0].respondent_user === U.eve);
  check('une réponse par personne → 2e envoi 409', (await submit({ slug: 'adhesion', answers: { nom: 'Eve bis' } }, { user: U.eve })).status === 409);
  const fId = (await sql(`select id from public.forms where slug = 'atelier'`)).rows[0].id;
  await as(U.alice, `select public.set_form_status($1, 'closed')`, [fId]);
  check('formulaire fermé → 409', (await submit({ slug: 'atelier', answers: { nom: 'Z' } })).status === 409);
  check('formulaire fermé : public voit « fermé »', (await as(null, `select public.get_public_form('atelier') as r`)).rows[0].r.open === false);

  // Modification par jeton
  const byTok = (await as(null, 'select public.get_response_by_token($1) as r', [ok1.body.editToken])).rows[0].r;
  check('reprise par jeton (anonyme) : modifiable jusqu\'à la clôture', byTok.editable === true && byTok.answers.nom === 'Jeanne Martin');
  check('jeton inconnu → rien', (await as(null, 'select public.get_response_by_token($1) as r', ['0'.repeat(64)])).rows[0].r === null);
  const ed = await submit({ slug: 'wei-2027', editToken: ok1.body.editToken, answers: { nom: 'Jeanne M.', email: 'jeanne@exemple.fr', bus: 'a' } });
  const r1b = (await sql('select answers from public.form_responses where id = $1', [ok1.body.responseId])).rows[0];
  check('modification par jeton : 200, réponse mise à jour (sa place est conservée), fichier gardé', ed.status === 200 && r1b.answers.nom === 'Jeanne M.'
    && r1b.answers.justificatif?.[0]?.path === up.path, JSON.stringify(ed.body));
  check('modification : événement « edited » + déclenchement « response.updated » (aucune automatisation)', (await sql(
    `select count(*)::int as n from public.form_response_events where response_id = $1 and action = 'edited'`, [r1.id])).rows[0].n === 1);

  // Brouillons
  const tok = 'brouillon_' + 'x'.repeat(30);
  await as(null, `select public.save_form_draft('wei-2027', $1, '{"nom":"En cours"}')`, [tok]);
  check('brouillon anonyme : sauvegarde puis reprise', (await as(null, `select public.load_form_draft('wei-2027', $1) as r`, [tok])).rows[0].r.answers.nom === 'En cours');
  check('brouillon : mauvais jeton → rien', (await as(null, `select public.load_form_draft('wei-2027', $1) as r`, ['y'.repeat(40)])).rows[0].r === null);
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'sans-brouillon', 'sans-brouillon', { ...defCap, settings: { ...defCap.settings, saveDraft: false } }]);
  check('brouillon : formulaire sans reprise → refusé', !!(await fails(null, `select public.save_form_draft('sans-brouillon', $1, '{}')`, [tok])));
  await submit({ slug: 'wei-2027', draftToken: tok, answers: { nom: 'Lou', email: 'lou@exemple.fr', bus: 'b' } });
  check('brouillon supprimé après l\'envoi définitif', (await as(null, `select public.load_form_draft('wei-2027', $1) as r`, [tok])).rows[0].r === null);

  console.log('13. Réponses : droits (RLS)');
  check('admin d\'un autre espace : aucune réponse lisible', (await as(U.bob, 'select 1 from public.form_responses')).rows.length === 0);
  check('admin d\'un autre espace : modification sans effet', (await as(U.bob, `update public.form_responses set status = 'accepted' returning id`)).rows.length === 0);
  check('admin d\'un autre espace : historique illisible', (await as(U.bob, 'select 1 from public.form_response_events')).rows.length === 0);
  check('propriétaire : lit les réponses de son espace', (await as(U.alice, 'select 1 from public.form_responses where form_id = $1', [formId])).rows.length >= 2);
  check('membre (lecture) : lit mais ne modifie pas', (await as(U.ines, 'select 1 from public.form_responses where form_id = $1', [formId])).rows.length >= 2
    && (await as(U.ines, `update public.form_responses set status = 'accepted' where form_id = $1 returning id`, [formId])).rows.length === 0);
  check('répondant : aucune lecture directe de la table', (await as(U.eve, 'select 1 from public.form_responses')).rows.length === 0);
  const mine = (await as(U.eve, 'select public.get_my_responses() as r')).rows[0].r;
  check('répondant : get_my_responses → uniquement ses réponses, sans champs internes', mine.length === 1 && mine[0].id === e1.body.responseId && !('tags' in mine[0]));
  check('get_my_responses : anonyme refusé', !!(await fails(null, 'select public.get_my_responses()')));
  await as(U.frank, `update public.form_responses set status = 'accepted', tags = '{prioritaire}' where id = $1`, [r1.id]);
  await as(U.frank, 'select public.add_response_note($1, $2)', [r1.id, 'Appelée le 3/10']);
  const hist = (await as(U.alice, 'select action, actor, payload from public.form_response_events where response_id = $1 order by id', [r1.id])).rows;
  check('historique : statut (de → vers), étiquettes, note, auteur', hist.some(h => h.action === 'status' && h.payload.to === 'accepted' && h.actor === U.frank)
    && hist.some(h => h.action === 'tags') && hist.some(h => h.action === 'note' && h.payload.text === 'Appelée le 3/10'));
  check('note par un membre (lecture) refusée', !!(await fails(U.ines, 'select public.add_response_note($1, $2)', [r1.id, 'x'])));
  check('administration : réponses elles-mêmes non modifiables', !!(await fails(U.alice, `update public.form_responses set answers = '{}' where id = $1`, [r1.id])));
  check('administration : « payé » réservé au serveur de paiement', !!(await fails(U.alice, `update public.form_responses set payment_status = 'paid' where id = $1`, [r1.id])));
  check('administration : suppression physique impossible', !!(await fails(U.alice, 'delete from public.form_responses where id = $1', [r1.id])));
  check('après validation, réponse « until_close » toujours modifiable', (await as(null, 'select public.get_response_by_token($1) as r', [ok1.body.editToken])).rows[0].r.editable === true);
  const defRev = { ...defCap, id: 'rev', slug: 'candidature', settings: { ...defCap.settings, maxResponses: null, allowEdit: 'until_review' } };
  await as(U.alice, 'select public.publish_form($1, $2, $3, $4)', [wsA, 'rev', 'candidature', defRev]);
  const cand = await submit({ slug: 'candidature', answers: { nom: 'Noé' } });
  const editableBefore = (await as(null, 'select public.get_response_by_token($1) as r', [cand.body.editToken])).rows[0].r.editable;
  await as(U.alice, `update public.form_responses set status = 'in_review' where id = $1`, [cand.body.responseId]);
  check('« until_review » : modifiable tant que « reçu », plus après prise en charge', editableBefore === true
    && (await as(null, 'select public.get_response_by_token($1) as r', [cand.body.editToken])).rows[0].r.editable === false
    && (await submit({ slug: 'candidature', editToken: cand.body.editToken, answers: { nom: 'Noé 2' } })).status === 403);
  check('fichiers : lisibles par l\'espace, invisibles pour un autre espace', await (async () => {
    await sql(`insert into storage.objects (bucket_id, name) values ('form-uploads', $1)`, [up.path]);
    const a = (await as(U.alice, `select 1 from storage.objects where bucket_id = 'form-uploads'`)).rows.length;
    const b = (await as(U.bob, `select 1 from storage.objects where bucket_id = 'form-uploads'`)).rows.length;
    const w = await fails(U.alice, `insert into storage.objects (bucket_id, name) values ('form-uploads', $1)`, [`${wsA}/x/y/z`]);
    return a === 1 && b === 0 && !!w;
  })());

  console.log('14. Vote anonyme');
  const defVote = { id: 'ag-2027', slug: 'election-bureau', title: 'Élection du bureau', kind: 'vote', status: 'published',
    pages: [{ id: 'p1', items: [
      q('president', 'single_choice', { label: 'Présidence', required: true, options: [{ value: 'alice', label: 'Alice' }, { value: 'frank', label: 'Frank' }] }),
      q('budget', 'yes_no', { label: 'Budget' }),
    ] }],
    settings: { access: 'members', identity: 'required', antiSpam: {}, vote: { electoralRoll: 'members', anonymous: true, resultsVisibility: 'after_close', quorumPercent: 50, majority: 'absolute' } } };
  const vpub = (await as(U.alice, 'select public.publish_form($1, $2, $3, $4) as r', [wsA, defVote.id, defVote.slug, defVote])).rows[0].r;
  const vid = vpub.form_id;
  check('vote : liste électorale = membres de l\'espace', (await sql('select count(*)::int as n from public.vote_rolls where form_id = $1', [vid])).rows[0].n === 4);
  const rA = (await as(U.alice, `select public.cast_vote($1, '{"president":"alice","budget":true}') as r`, [vid])).rows[0].r;
  check('vote : reçu aléatoire (32 hex) renvoyé une seule fois', /^[a-f0-9]{32}$/.test(rA.receipt));
  check('vote : un seul vote par électeur', !!(await fails(U.alice, `select public.cast_vote($1, '{"president":"frank"}')`, [vid])));
  check('vote : non-inscrit refusé', !!(await fails(U.bob, `select public.cast_vote($1, '{"president":"frank"}')`, [vid])));
  check('vote : anonyme (non connecté) refusé', !!(await fails(null, `select public.cast_vote($1, '{"president":"frank"}')`, [vid])));
  check('vote : choix invalide refusé', !!(await fails(U.ines, `select public.cast_vote($1, '{"president":"mallory"}')`, [vid])));
  check('vote : question obligatoire manquante refusée', !!(await fails(U.ines, `select public.cast_vote($1, '{"budget":true}')`, [vid])));
  check('vote : un refus ne consomme pas le droit', !(await fails(U.ines, `select public.cast_vote($1, '{"president":"frank","budget":false}')`, [vid])));
  await as(U.frank, `select public.cast_vote($1, '{"president":"alice"}')`, [vid]);
  check('vote : passer par forms-submit est refusé', (await submit({ slug: 'election-bureau', answers: { president: 'alice' } }, { user: U.dave })).status === 400);
  check('reçu vérifiable (anonyme) : compté', (await as(null, 'select public.verify_ballot($1, $2) as r', [vid, rA.receipt])).rows[0].r.counted === true);
  check('reçu inconnu : non compté', (await as(null, 'select public.verify_ballot($1, $2) as r', [vid, 'f'.repeat(32)])).rows[0].r.counted === false);
  const hidden = (await as(U.alice, 'select public.vote_results($1) as r', [vid])).rows[0].r;
  check('résultats masqués avant clôture (même propriétaire)', hidden.visible === false && hidden.reason === 'hidden_until_close');
  check('participation visible des admins (sans bulletin)', JSON.stringify((await as(U.alice, 'select public.vote_participation($1) as r', [vid])).rows[0].r) === '{"voted": 3, "electorate": 4}'
    || (await as(U.alice, 'select public.vote_participation($1) as r', [vid])).rows[0].r.voted === 3);
  const cols = async (t) => (await sql(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [t])).rows.map(r => r.column_name);
  const cRights = await cols('vote_rights');
  const cBallots = await cols('vote_ballots');
  check('aucune colonne commune droit ↔ bulletin hormis form_id', cRights.filter(c => cBallots.includes(c)).join() === 'form_id', cRights.filter(c => cBallots.includes(c)).join());
  check('bulletin : ni utilisateur, ni horodatage précis, clé aléatoire', !cBallots.some(c => /user|voter|_at$|created/.test(c))
    && (await sql(`select data_type from information_schema.columns where table_name = 'vote_ballots' and column_name = 'id'`)).rows[0].data_type === 'uuid');
  check('droit consommé : date au jour près seulement', (await sql(`select data_type from information_schema.columns where table_name = 'vote_rights' and column_name = 'used_at'`)).rows[0].data_type === 'date');
  check('propriétaire : bulletins et droits illisibles directement', !!(await fails(U.alice, 'select * from public.vote_ballots')) && !!(await fails(U.alice, 'select * from public.vote_rights')));
  check('clé de service : bulletins et droits illisibles', !!(await db.transaction(async (tx) => {
    await tx.query('set local role service_role');
    try { await tx.query('select * from public.vote_ballots b join public.vote_rights r using (form_id)'); return null; } catch (e) { return e; }
  })));
  check('reçu stocké haché uniquement', (await sql('select count(*)::int as n from public.vote_ballots where receipt_hash = $1', [rA.receipt])).rows[0].n === 0);
  await as(U.alice, `select public.set_form_status($1, 'closed')`, [vid]);
  const res = (await as(U.ines, 'select public.vote_results($1) as r', [vid])).rows[0].r;
  const pres = res.questions.find(x => x.key === 'president');
  check('après clôture : résultats (3 bulletins / 4 inscrits, quorum 50 % atteint)', res.visible && res.ballots === 3 && res.electorate === 4 && res.quorum_reached === true, JSON.stringify(res));
  check('majorité absolue : Alice élue (2/3 des exprimés)', pres.winner === 'alice' && pres.options.find(o => o.value === 'alice').count === 2 && pres.decided === true);
  const budget = res.questions.find(x => x.key === 'budget');
  check('oui/non : 1 oui, 1 non, 1 blanc → pas de majorité absolue', budget.expressed === 2 && budget.blank === 1 && budget.decided === false);
  check('vote clos : nouveau vote refusé', !!(await fails(U.dave, `select public.cast_vote($1, '{"president":"alice"}')`, [vid])));
  check('non-membre : résultats d\'un vote « membres » refusés', (await as(U.bob, 'select public.vote_results($1) as r', [vid])).rows[0].r.visible === false);
  const defList = { ...defVote, id: 'ag-liste', slug: 'vote-liste', settings: { ...defVote.settings, access: 'invited',
    vote: { ...defVote.settings.vote, electoralRoll: 'list', list: ['eve@exemple.fr'], majority: 'two_thirds', resultsVisibility: 'live' } } };
  const lid = (await as(U.alice, 'select public.publish_form($1, $2, $3, $4) as r', [wsA, defList.id, defList.slug, defList])).rows[0].r.form_id;
  check('liste nominative : électrice externe inscrite peut voter', !(await fails(U.eve, `select public.cast_vote($1, '{"president":"frank"}')`, [lid])));
  check('liste nominative : membre non inscrit refusé', !!(await fails(U.frank, `select public.cast_vote($1, '{"president":"frank"}')`, [lid])));
  check('liste nominative : adresses absentes de la définition publique', !JSON.stringify((await as(U.eve, `select public.get_public_form('vote-liste') as r`)).rows[0].r.definition).includes('eve@'));
  const live = (await as(U.eve, 'select public.vote_results($1) as r', [lid])).rows[0].r;
  check('visibilité « live » : résultats visibles avant clôture, 2/3 atteints (1/1)', live.visible && live.questions[0].winner === 'frank');

  console.log('15. Automatisations (file d\'attente)');
  const queued = (await as(U.alice, 'select public.claim_automation_runs($1, 50) as r', [wsA])).rows[0].r;
  check('réservation des exécutions (propriétaire)', queued.length >= 1 && queued.every(r => r.automation?.actions));
  check('réservation : rien de plus tant que la réservation court', (await as(U.alice, 'select public.claim_automation_runs($1, 50) as r', [wsA])).rows[0].r.length === 0);
  check('réservation : autre espace refusé', !!(await fails(U.bob, 'select public.claim_automation_runs($1, 5)', [wsA])));
  check('réservation : membre (lecture) refusé', !!(await fails(U.ines, 'select public.claim_automation_runs($1, 5)', [wsA])));
  await as(U.alice, `select public.complete_automation_run($1, 'done', '{"emails":1}')`, [queued[0].id]);
  check('exécution terminée (done) ; deuxième clôture refusée', !!(await fails(U.alice, `select public.complete_automation_run($1, 'done')`, [queued[0].id])));
  check('statut de fin invalide refusé', !!(await fails(U.alice, `select public.complete_automation_run($1, 'peut-etre')`, [queued[1]?.id || queued[0].id])));

  console.log('16. Paiement HelloAsso (API simulée) et messages Brevo');
  const defPay = { ...defCap, id: 'pay', slug: 'billet-gala', title: 'Billet gala', settings: { ...defCap.settings, maxResponses: null },
    pages: [{ id: 'p1', items: [q('nom', 'short_text', { required: true }), q('email', 'email', { required: true }),
      q('formule', 'payment', { label: 'Formule', required: true, options: [{ value: 'std', label: 'Standard', price: 25 }, { value: 'vip', label: 'VIP', price: 40 }] })] }] };
  const payFormId = (await as(U.alice, 'select public.publish_form($1, $2, $3, $4) as r', [wsA, 'pay', 'billet-gala', defPay])).rows[0].r.form_id;
  await as(U.alice, `insert into public.automations (workspace_id, form_id, name, trigger, actions, requires_approval) values ($1, $2, 'Recette', '{"event":"payment.paid"}', '[{"type":"finance"}]', true)`, [wsA, payFormId]);
  const p1 = await submit({ slug: 'billet-gala', answers: { nom: 'Léa', email: 'lea@exemple.fr', formule: { option: 'vip', amount: 1 } } });
  check('paiement : montant recalculé par le moteur (VIP 40 €, montant client ignoré)', p1.status === 201 && p1.body.payment?.amountCents === 4000, JSON.stringify(p1.body.payment));
  const intents = new Map();
  const fakeHA = {
    token: async () => 'jeton-ha',
    createIntent: async (_t, p) => { const id = String(1000 + intents.size); intents.set(id, { id, metadata: p.metadata, totalAmount: p.cents }); return { id, redirectUrl: `https://helloasso.test/pay/${id}` }; },
    getIntent: async (_t, id) => intents.get(String(id)) || null,
  };
  const co = await handleCheckout({ responseId: p1.body.responseId, editToken: p1.body.editToken }, { rpc: svc, helloasso: fakeHA, env: { appUrl: 'https://bde-manager.vercel.app' } });
  check('checkout : URL de paiement, montant serveur', co.body.url.startsWith('https://helloasso.test/') && intents.get('1000').totalAmount === 4000);
  let refused = null;
  try { await handleCheckout({ responseId: p1.body.responseId, editToken: 'a'.repeat(64) }, { rpc: svc, helloasso: fakeHA, env: { appUrl: 'x' } }); } catch (e) { refused = e; }
  check('checkout : mauvais jeton → 404', refused?.status === 404);
  const w0 = await handleWebhook({ body: { eventType: 'Order', data: { checkoutIntentId: 1000 }, metadata: { responseId: p1.body.responseId } }, token: 't' },
    { rpc: svc, helloasso: fakeHA, env: { webhookToken: 't' } });
  const ps0 = (await sql('select payment_status from public.form_responses where id = $1', [p1.body.responseId])).rows[0].payment_status;
  check('webhook sans paiement confirmé par l\'API → rien ne change (corps non cru)', w0.body.updated === 0 && ps0 === 'pending');
  intents.get('1000').order = { id: 5, payments: [{ state: 'Authorized', amount: 4000 }] };
  let badTok = null;
  try { await handleWebhook({ body: {}, token: 'faux' }, { rpc: svc, helloasso: fakeHA, env: { webhookToken: 't' } }); } catch (e) { badTok = e; }
  check('webhook : jeton d\'URL invalide → 401', badTok?.status === 401);
  const w1 = await handleWebhook({ body: { eventType: 'Order', data: { checkoutIntentId: 1000 } }, token: 't' }, { rpc: svc, helloasso: fakeHA, env: { webhookToken: 't' } });
  const paid = (await sql('select payment_status from public.form_responses where id = $1', [p1.body.responseId])).rows[0].payment_status;
  check('webhook confirmé par l\'API → payé', w1.body.updated === 1 && paid === 'paid');
  const runs = (await sql(`select status, event from public.automation_runs where response_id = $1`, [p1.body.responseId])).rows;
  check('paiement : déclenchement « payment.paid » en attente d\'approbation', runs.some(r => r.event === 'payment.paid' && r.status === 'pending_approval'), JSON.stringify(runs));
  const pend = (await sql(`select id from public.automation_runs where event = 'payment.paid' and status = 'pending_approval' limit 1`)).rows[0].id;
  check('approbation : bureau (write) refusé', !!(await fails(U.frank, 'select public.approve_automation_run($1, true)', [pend])));
  await as(U.alice, 'select public.approve_automation_run($1, true)', [pend]);
  check('approbation par le propriétaire → en file', (await sql('select status, approved_by from public.automation_runs where id = $1', [pend])).rows[0].approved_by === U.alice);
  check('webhook rejoué : idempotent', (await handleWebhook({ body: { data: { checkoutIntentId: 1000 } }, token: 't' }, { rpc: svc, helloasso: fakeHA, env: { webhookToken: 't' } })).status === 200
    && (await sql(`select count(*)::int as n from public.form_response_events where response_id = $1 and action = 'payment'`, [p1.body.responseId])).rows[0].n === 1);

  emails.length = 0;
  const notify = async (user, body) => {
    try { return await handleNotify({ body, userJwt: `jwt:${user}` }, { rpc: svc, getUser: deps().getUser, sendEmail: deps().sendEmail }); } catch (e) { return { status: e.status, body: { error: e.message } }; }
  };
  const n1 = await notify(U.frank, { workspaceId: wsA, responseIds: [p1.body.responseId, r1.id], to: ['inconnu@pirate.example'], subject: 'Infos gala', message: 'Rendez-vous à 20 h <b>pile</b>' });
  check('message aux répondants : destinataires résolus côté serveur (adresse arbitraire ignorée)', n1.status === 200 && n1.body.sent === 2 && n1.body.ignored === 1
    && !JSON.stringify(emails).includes('pirate') && emails[0].html.includes('&lt;b&gt;'), JSON.stringify(n1.body));
  check('message : admin d\'un autre espace refusé', (await notify(U.bob, { workspaceId: wsA, responseIds: [r1.id], subject: 's', message: 'm' })).status === 403);
  check('message : membre (lecture) refusé', (await notify(U.ines, { workspaceId: wsA, responseIds: [r1.id], subject: 's', message: 'm' })).status === 403);
  check('message : réponse d\'un autre espace → aucun destinataire', (await notify(U.bob, { workspaceId: wsB, responseIds: [r1.id], subject: 's', message: 'm' })).status === 422);
}

// Test transversal : TOUS les modèles du registre respectent le contrat et
// produisent des documents valides, avec une association complète ou vide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, getTemplate, defaultValues, generateDocuments, collectSuggestions, collectWarnings, missingRequirements } from './registry.js';
import { validateDocument, DOCUMENT_CATEGORIES } from './model.js';
import { buildContext, DEFAULT_ORGANIZATION } from './context.js';
import { createDefaultCatalog } from '../core/catalog.js';

const FIELD_TYPES = new Set(['text', 'textarea', 'date', 'time', 'number', 'money', 'select', 'checkbox', 'member', 'members', 'role', 'list', 'resolutions', 'lines']);
const CATEGORY_IDS = new Set(DOCUMENT_CATEGORIES.map(c => c.id));

function makeState(fullOrg) {
  const catalog = createDefaultCatalog();
  catalog.poles.creatif = { id: 'creatif', label: 'Créatif', short: 'Créa', color: 'pink', emoji: '🎨', order: 9, affinity: {} };
  catalog.roles.responsable_design = { id: 'responsable_design', label: 'Responsable Design', pole: 'creatif', level: 'responsable', leadership: true, essential: false, capacity: 2, order: 0, aliases: [] };
  const m = (id, firstName, lastName, mainRole, extra = {}) => ({ id, firstName, lastName, email: '', mainRole, badges: [], columnId: 'direction', notes: '', ...extra });
  return {
    ...catalog,
    columns: [{ id: 'direction', title: 'Bureau' }],
    members: [
      m('p', 'Kenzo', 'VERNIAUD', 'president', { email: 'kenzo@ex.fr', joinedAt: '2025-09-15', mandateStart: '2025-10-01', phone: '0600000000', address: '1 rue X, 93100 Montreuil', nationality: 'Française', profession: 'Étudiant' }),
      m('vp', 'Ana', 'Bernard', 'vice_president', { mandateStart: '2025-10-01', mandateEnd: '2026-06-30' }),
      m('t', 'Bilal', 'K', 'tresorier', { feePaidAt: '2026-09-20', feeAmount: 10 }),
      m('s', 'Minh Anh', 'TRAN', 'secretaire'),
      m('d', 'Zoé', 'Martin', 'responsable_design', { badges: ['Ancien Membre'] }),
      m('x', 'Max', '', 'DJ officiel'),
      m('n', 'Nina', 'Petit', ''),
    ],
    folders: [{ id: 'f00', code: '00', name: 'Bureau', parent: null, color: 'red', tags: [] }],
    rolePresets: { president: { f00: 'editor' } },
    drivePermissions: { p: { f00: 'editor' } },
    organization: fullOrg ? {
      ...DEFAULT_ORGANIZATION, name: 'BDE IUT de Montreuil', shortName: 'BDE', address: '140 rue de la Nouvelle France',
      postalCode: '93100', city: 'Montreuil', rna: 'W931234567', email: 'bde@ex.fr', school: 'IUT de Montreuil',
      membershipFee: 10, prefecture: 'Bobigny', statutesDate: '2020-09-01', object: 'Animer la vie étudiante',
    } : { name: 'Asso' },
    documentLog: [],
  };
}

for (const full of [true, false]) {
  const ctx = buildContext(makeState(full), { today: '2026-10-10', vaultEntryLabels: full ? ['Instagram BDE'] : null });

  test(`tous les modèles génèrent des documents valides (association ${full ? 'complète' : 'vide'})`, () => {
    assert.ok(TEMPLATES.length >= 25, `au moins 25 modèles (actuellement ${TEMPLATES.length})`);
    for (const t of TEMPLATES) {
      const ids = t.scope === 'member' ? ctx.members.map(x => x.id) : [];
      const docs = generateDocuments(t, ctx, {}, ids);
      assert.ok(docs.length >= 1, `${t.id} : aucun document`);
      docs.forEach(doc => {
        assert.deepEqual(validateDocument(doc), [], `${t.id} : document invalide`);
        assert.equal(doc.meta.templateId, t.id);
      });
      collectWarnings(t, ctx, {});        // ne doit pas lever d'exception
      missingRequirements(t, ctx, defaultValues(t, ctx));
    }
  });

  test(`suggestions calculables (association ${full ? 'complète' : 'vide'})`, () => {
    const list = collectSuggestions(ctx);
    list.forEach(s => {
      assert.ok(getTemplate(s.templateId), `suggestion vers un modèle inconnu : ${s.templateId}`);
      assert.ok(s.title && s.reason && ['high', 'medium', 'low'].includes(s.priority));
      (s.memberIds || []).forEach(id => assert.ok(ctx.members.some(m => m.id === id), `membre inconnu ${id}`));
    });
  });
}

test('contrat : ids uniques, catégories, champs et métadonnées valides', () => {
  const seen = new Set();
  for (const t of TEMPLATES) {
    assert.ok(!seen.has(t.id), `id dupliqué : ${t.id}`); seen.add(t.id);
    assert.ok(CATEGORY_IDS.has(t.category), `${t.id} : catégorie inconnue ${t.category}`);
    assert.ok(['member', 'organization'].includes(t.scope), `${t.id} : scope invalide`);
    assert.ok(t.title && t.description && t.icon, `${t.id} : titre/description/icône manquant`);
    assert.ok(t.legal?.note, `${t.id} : note juridique manquante`);
    assert.equal(typeof t.build, 'function');
    const keys = new Set();
    (t.fields || []).forEach(f => {
      assert.ok(FIELD_TYPES.has(f.type), `${t.id}.${f.key} : type de champ inconnu ${f.type}`);
      assert.ok(f.key && f.label, `${t.id} : champ sans clé ou libellé`);
      assert.ok(!keys.has(f.key), `${t.id} : clé de champ dupliquée ${f.key}`); keys.add(f.key);
    });
  }
  DOCUMENT_CATEGORIES.forEach(c => assert.ok(TEMPLATES.some(t => t.category === c.id), `catégorie vide : ${c.id}`));
});

test('lot : une valeur modifiée s’impose à tous, les valeurs calculées restent propres à chaque membre', () => {
  const ctx = buildContext(makeState(true), { today: '2026-10-10' });
  const t = TEMPLATES.find(x => x.scope === 'member' && (x.fields || []).some(f => f.key === 'role'))
    || TEMPLATES.find(x => x.scope === 'member');
  const first = ctx.members[0];
  const valuesForFirst = defaultValues(t, ctx, first);
  // Sans editedKeys, tout le formulaire du 1er membre s'appliquerait aux autres :
  // avec editedKeys vide, chaque membre garde ses propres valeurs par défaut.
  const docs = generateDocuments(t, ctx, valuesForFirst, ['p', 'vp', 't'], { editedKeys: [] });
  const texts = docs.map(d => JSON.stringify(d.blocks));
  assert.ok(texts[1].includes('Vice-Président(e)') || texts[1].includes('Ana'), 'le 2e document concerne bien Ana');
  assert.ok(!texts[1].includes('Kenzo VERNIAUD, Président'), 'aucune fuite des valeurs du 1er membre');
});

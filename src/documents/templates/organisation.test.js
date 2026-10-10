// Tests des modèles « organisation » : organigramme, annuaire, fiche pôle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, documentPlainText } from '../model.js';
import templates, { buildOrgChartGroups } from './organisation.js';
import { fullContext, minimalContext, build } from './orgPart_fixtures.js';

const byId = (id) => templates.find(t => t.id === id);
const blocksOf = (doc, type) => doc.blocks.filter(b => b.type === type);

test('Chaque modèle produit un document valide (contexte complet et minimal)', () => {
  for (const t of templates) {
    for (const ctx of [fullContext(), minimalContext()]) {
      const doc = build(t, ctx);
      assert.deepEqual(validateDocument(doc), [], `${t.id}`);
      assert.equal(doc.meta.templateId, t.id);
      assert.equal(t.category, 'organisation');
    }
  }
});

test('Organigramme : bureau en premier, pôle personnalisé, postes à pourvoir, autres membres', () => {
  const ctx = fullContext();
  const doc = build(byId('organigramme-officiel'), ctx);
  assert.equal(doc.meta.orientation, 'landscape');
  assert.match(doc.blocks[0].subtitle, /Année universitaire 2026-2027 · à jour au 10 octobre 2026/);
  const chart = blocksOf(doc, 'orgChart')[0];
  const titles = chart.groups.map(g => g.title);
  assert.equal(titles[0], '🏛️ Bureau');
  assert.ok(titles.includes('🎨 Design'));
  assert.equal(titles.at(-1), 'Autres membres');

  const bureau = chart.groups[0];
  assert.equal(bureau.color, '#ef4444');
  assert.deepEqual(bureau.people[0], { name: 'Alice Martin', role: 'Président(e)' });
  assert.ok(bureau.people.some(p => p.name === 'Poste à pourvoir' && p.role === 'Vice-Président(e)'));

  const design = chart.groups.find(g => g.title === '🎨 Design');
  assert.equal(design.color, '#84cc16');
  assert.deepEqual(design.people, [
    { name: 'Emma Moreau', role: 'Graphiste' },
    { name: 'Poste à pourvoir', role: 'Graphiste' },
  ]);
  const com = chart.groups.find(g => g.title === '📣 Communication');
  assert.ok(com.people.some(p => p.role === 'Membre Communication (9 places)'));
  assert.deepEqual(chart.groups.at(-1).people, [{ name: 'Gaëlle Roux', role: 'Mascotte' }]);
  assert.match(documentPlainText(doc), /8 membres · 7 membres avec un rôle du catalogue/);
});

test('Organigramme : options sans postes vacants ni autres membres', () => {
  const groups = buildOrgChartGroups(fullContext(), { includeVacancies: false, includeOthers: false });
  assert.ok(groups.every(g => g.people.every(p => p.name !== 'Poste à pourvoir')));
  assert.ok(!groups.some(g => g.title === 'Autres membres'));
  // Pôles sans titulaire (Sport, E-Sport…) omis.
  assert.ok(!groups.some(g => g.title.includes('Sport')));
  const empty = build(byId('organigramme-officiel'), minimalContext(), { includeVacancies: false });
  assert.equal(blocksOf(empty, 'callout').length, 1);
});

test('Annuaire : confidentiel, mention RGPD, périmètre bureau, téléphone optionnel', () => {
  const ctx = fullContext();
  const t = byId('annuaire-bureau');
  const doc = build(t, ctx);
  assert.equal(doc.meta.confidential, true);
  assert.match(blocksOf(doc, 'callout')[0].text, /Document à usage interne — ne pas diffuser/);
  const tables = blocksOf(doc, 'table');
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].columns.map(c => c.label), ['Nom', 'Fonction', 'Email']);
  assert.deepEqual(tables[0].rows.map(r => r.name), ['MARTIN Alice', 'PETIT Clarisse', 'DURAND Bob']);
  assert.deepEqual(doc.meta.memberIds.sort(), ['m1', 'm2', 'm3']);

  const all = build(t, ctx, { scope: 'all', includePhone: true });
  const headings = blocksOf(all, 'heading').map(h => h.text);
  assert.ok(headings.includes('🎨 Design'));
  assert.equal(headings.at(-1), 'Autres membres');
  const rows = blocksOf(all, 'table').flatMap(x => x.rows);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.find(r => r.name === 'BLANC Adrien'), { name: 'BLANC Adrien', role: 'Membre Communication', email: '—', phone: '—' });
  assert.equal(rows.find(r => r.name === 'MARTIN Alice').phone, '06 12 34 56 78');

  const encadrement = build(t, ctx, { scope: 'encadrement' });
  assert.equal(encadrement.meta.memberIds.length, 5);
});

test('Fiche pôle : pôle personnalisé, statut des places, mission générée, objectifs', () => {
  const ctx = fullContext();
  const t = byId('fiche-pole');
  const options = t.fields.find(f => f.key === 'poleId').options(ctx);
  assert.ok(options.some(o => o.value === 'design' && o.label === '🎨 Design'));

  const doc = build(t, ctx, { poleId: 'design', objectives: ['Refondre la charte', ' '] });
  assert.equal(doc.blocks[0].text, 'Pôle Design');
  const text = documentPlainText(doc);
  assert.match(text, /Le pôle Design contribue à la réalisation de l'objet de BDE IUT de Montreuil/);
  const roleTable = blocksOf(doc, 'table')[0];
  assert.deepEqual(roleTable.rows, [{ role: 'Graphiste', capacity: '2', holders: 'Emma Moreau', status: 'À pourvoir (1)' }]);
  assert.match(text, /Aucun preset d'accès Drive/);
  assert.deepEqual(blocksOf(doc, 'list')[0].items, ['Refondre la charte']);

  const com = build(t, ctx, { poleId: 'communication', mission: 'Mission sur mesure.' });
  const comText = documentPlainText(com);
  assert.match(comText, /Mission sur mesure\./);
  assert.match(comText, /David Leroy \(Responsable Communication\)/);
  assert.equal(blocksOf(com, 'table')[1].rows.length, 3);
  assert.equal(blocksOf(com, 'blankLines').length, 1);

  const bureau = build(t, ctx, { poleId: 'bureau' });
  const statuses = Object.fromEntries(blocksOf(bureau, 'table')[0].rows.map(r => [r.role, r.status]));
  assert.equal(statuses['Président(e)'], 'Pourvu');
  assert.equal(statuses['Vice-Président(e)'], 'À pourvoir (1)');
});

test('Suggestion : organigramme proposé tant qu\'il n\'a pas été émis cette année', () => {
  const t = byId('organigramme-officiel');
  assert.equal(t.suggest(fullContext()).length, 1);
  assert.equal(t.suggest(minimalContext()).length, 0);
  const ctx = fullContext();
  ctx.documentLog = [{ templateId: 'organigramme-officiel', createdAt: '2026-09-30T12:00:00.000Z' }];
  assert.equal(t.suggest(ctx).length, 0);
});

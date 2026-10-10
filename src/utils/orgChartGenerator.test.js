// Tests du générateur d'organigramme Mermaid (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCatalog } from '../core/catalog.js';
import { generateOrgChart, escapeMermaid } from './orgChartGenerator.js';

function customCatalog() {
  const cat = createDefaultCatalog();
  cat.poles.creatif = { id: 'creatif', label: 'Créatif', short: 'Créa', color: 'pink', emoji: '🎨', order: 9, affinity: {} };
  cat.roles.responsable_design = {
    id: 'responsable_design', label: 'Responsable Design', level: 'responsable', pole: 'creatif',
    leadership: true, essential: false, capacity: 1, order: 0, aliases: [],
  };
  cat.roles.president = { ...cat.roles.president, label: 'Présidence' };
  return cat;
}

const FOLDERS = [{ id: 'f05', code: '05', name: 'Pôle Créatif', parent: null }];

/** Lignes du sous-graphe dont le titre contient `title`. */
function subgraphBody(code, title) {
  const lines = code.split('\n');
  const start = lines.findIndex(l => l.trim().startsWith('subgraph') && l.includes(title));
  assert.ok(start >= 0, `sous-graphe "${title}" introuvable`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === 'end');
  return lines.slice(start + 1, end).join('\n');
}

test('pôle et rôle personnalisés : sous-graphe « 🎨 Créatif » avec « Responsable Design »', () => {
  const cat = customCatalog();
  const code = generateOrgChart({
    members: [
      { id: 'd', firstName: 'Dana', lastName: 'K', mainRole: 'responsable_design' },
      { id: 'p', firstName: 'Paul', mainRole: 'president' },
    ],
    folders: FOLDERS,
    rolePresets: { responsable_design: { f05: 'editor' } },
  }, { catalog: cat });
  const body = subgraphBody(code, 'Créatif');
  assert.match(code, /subgraph P\d+\["🎨 Créatif"\]/);
  assert.match(body, /Dana K/);
  assert.match(body, /<b>Responsable Design<\/b>/);
  assert.match(body, /:::lead\d+/, 'un rôle de niveau responsable est un encadrant');
  assert.match(body, /Drive : 05/);
  // Ordre des pôles du catalogue : Bureau (order 0) avant Créatif (order 9).
  assert.ok(code.indexOf('Bureau"]') < code.indexOf('Créatif"]'));
});

test('libellé renommé : le nouveau libellé est affiché', () => {
  const code = generateOrgChart({ members: [{ id: 'p', firstName: 'Paul', mainRole: 'president' }] }, { catalog: customCatalog() });
  assert.match(subgraphBody(code, 'Bureau'), /Présidence/);
  assert.doesNotMatch(code, /Président\(e\)/);
});

test('rôles libres hérités : rangés dans le bon pôle via resolveRoleId', () => {
  const code = generateOrgChart({
    members: [
      { id: 'a', firstName: 'Ana', mainRole: 'Respo Com' },
      { id: 'b', firstName: 'Bob', mainRole: 'Trésorier' },
      { id: 'c', firstName: 'Cid', mainRole: 'DJ officiel' },
    ],
  }, { catalog: customCatalog() });
  assert.match(subgraphBody(code, 'Communication"'), /Ana/);
  assert.match(subgraphBody(code, 'Bureau'), /Bob/);
  assert.match(subgraphBody(code, 'Sans rôle du catalogue'), /Cid/);
  assert.match(code, /ROOT -\.-> OTHER/);
});

test('échappement : un nom malveillant ne peut ni fermer le libellé ni injecter de HTML', () => {
  const evil = 'Bob"]-->X[<img src=x onerror=alert(1)>';
  const escaped = escapeMermaid(evil);
  assert.doesNotMatch(escaped, /["<>[\]]/);
  assert.equal(escaped, 'Bob#34;#93;--#62;X#91;#60;img src=x onerror=alert(1)#62;');
  assert.equal(escapeMermaid('a#b;c\nd'), 'a#35;b#59;c d');

  const code = generateOrgChart({
    members: [{ id: 'x"]; click', firstName: evil, mainRole: 'responsable_design' }],
  }, { catalog: customCatalog() });
  assert.ok(!code.includes('<img'), 'aucune balise <img> brute');
  assert.ok(!code.includes('"]-->X'), 'le libellé ne peut pas être fermé');
  // Chaque ligne de nœud garde exactement une paire de guillemets.
  code.split('\n').filter(l => /^\s+M\d+\[/.test(l)).forEach(l => {
    assert.equal((l.match(/"/g) || []).length, 2, l);
  });
  // Les identifiants de nœuds ne dépendent jamais des données utilisateur.
  assert.ok(!code.includes('click'));
});

test('thème : couleurs différentes en clair et en sombre', () => {
  const data = { members: [{ id: 'd', firstName: 'Dana', mainRole: 'responsable_design' }] };
  const light = generateOrgChart(data, { catalog: customCatalog(), dark: false });
  const dark = generateOrgChart(data, { catalog: customCatalog(), dark: true });
  assert.notEqual(light, dark);
  assert.match(dark, /color:#fafafa/);
  assert.match(light, /color:#18181b/);
});

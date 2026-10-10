// ============================================================
// Copie du moteur de formulaires pour les fonctions Edge (Deno)
// ============================================================
// src/forms/engine/*.js  →  supabase/functions/_shared/forms-engine/
// src/forms/schema.js    →  supabase/functions/_shared/schema.js
// (même arborescence relative : « ../schema.js » reste valide).
//  - les imports relatifs sans extension reçoivent « .js » (exigé par Deno) ;
//  - tout import hors de src/forms/ ou de paquet npm est refusé (le moteur
//    doit rester pur) ;
//  - un index.js est généré s'il n'existe pas (réexport de chaque module) ;
//  - vérification finale sous Node : les fonctions attendues par
//    forms-submit sont présentes.
// À relancer avant chaque déploiement :  node scripts/build-edge.mjs
// ============================================================

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src', 'forms', 'engine');
const outDir = join(root, 'supabase', 'functions', '_shared', 'forms-engine');
const schemaSrc = join(root, 'src', 'forms', 'schema.js');
const schemaOut = join(root, 'supabase', 'functions', '_shared', 'schema.js');
const REQUIRED = ['validateDefinition', 'evaluateForm', 'validateAnswers', 'computeScore', 'quotaStatus', 'summarizeAnswers'];
const HEADER = '// FICHIER GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier ici (source : src/forms/).\n';

function fail(msg) {
  console.error(`✘ build-edge : ${msg}`);
  process.exit(1);
}

if (!existsSync(srcDir)) fail('src/forms/engine/ introuvable.');

const files = readdirSync(srcDir).filter(f => f.endsWith('.js') && !f.endsWith('.test.js') && statSync(join(srcDir, f)).isFile());
if (!files.length) fail('aucun module dans src/forms/engine/.');

/** Réécrit les spécificateurs relatifs ; refuse ce qui sortirait de src/forms/. */
function rewrite(code, file) {
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g, (m, kw, q, spec) => {
    if (!spec.startsWith('.')) fail(`${file} importe « ${spec} » : le moteur ne doit dépendre d'aucun paquet.`);
    const allowed = spec.startsWith('./') || spec === '../schema.js' || spec === '../schema';
    if (!allowed) fail(`${file} importe « ${spec} » : seuls ./*.js et ../schema.js sont copiés.`);
    const withExt = /\.[cm]?js$/.test(spec) ? spec : `${spec}.js`;
    return `${kw}${q}${withExt}${q}`;
  });
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const f of files) {
  writeFileSync(join(outDir, f), HEADER + rewrite(readFileSync(join(srcDir, f), 'utf8'), f));
}
writeFileSync(schemaOut, HEADER + readFileSync(schemaSrc, 'utf8'));

if (!files.includes('index.js')) {
  const lines = files.map(f => `export * from './${f}';`);
  writeFileSync(join(outDir, 'index.js'), `${HEADER}// Index généré : réexport de tous les modules du moteur.\n${lines.join('\n')}\n`);
}

// Vérification : le module se charge et expose l'API attendue.
const mod = await import(`${pathToFileURL(join(outDir, 'index.js')).href}?t=${Date.now()}`);
const missing = REQUIRED.filter(n => typeof mod[n] !== 'function');
console.log(`✔ ${files.length} module(s) copiés vers supabase/functions/_shared/forms-engine/ (+ schema.js)`);
if (missing.length) fail(`fonctions manquantes dans le moteur : ${missing.join(', ')}`);
console.log(`✔ API vérifiée : ${REQUIRED.join(', ')}`);

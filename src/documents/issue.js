// ============================================================
// ÉMISSION PROGRAMMATIQUE DE DOCUMENTS (pour les autres modules)
// ============================================================
// Même chaîne que le Studio documents : génération → empreinte →
// numérotation → rendu → inscription au registre. Utilisé par les modules
// (reçus de cotisation, attestations d'événement, kits de passation…) pour
// produire un document officiel en un clic, sans dupliquer la logique.
//
//   const res = await issueDocuments({
//     templateId: 'recu-cotisation', memberIds: [id], values: { montant: 10 },
//     format: 'pdf',            // 'pdf' | 'print' | 'word' | 'none' (registre seulement, ex. avant envoi)
//     extraContext: {},         // optionnel : { candidates, scenario, vaultEntryLabels }
//   });
//   → { refs, entries, fileName }
// ============================================================

import { useStore } from '../store.js';
import { buildContext } from './context.js';
import { getTemplate, generateDocuments, missingRequirements, defaultValues } from './registry.js';
import { documentFingerprint, validateDocument, safeFileName } from './model.js';
import { buildIssues, buildLogEntries, exportBaseName } from '../components/documents/registryHelpers.js';

export async function issueDocuments({
  templateId, memberIds = [], values = {}, editedKeys, format = 'pdf', extraContext = {}, draft = false, origin,
}) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Modèle inconnu : ${templateId}`);
  const state = useStore.getState();
  const ctx = buildContext(state, extraContext);

  const missing = missingRequirements(template, ctx, { ...defaultValues(template, ctx), ...values })
    .filter(m => m.kind === 'organization');
  if (missing.length) {
    throw new Error(`Profil de l'association incomplet : ${missing.map(m => m.label).join(', ')} (Documents › Profil de l'association).`);
  }

  const docs = generateDocuments(template, ctx, values, memberIds, editedKeys ? { editedKeys } : {});
  if (!docs.length) throw new Error('Aucun document à générer (membre introuvable ?).');
  const problems = docs.flatMap(d => validateDocument(d));
  if (problems.length) throw new Error(`Document incomplet : ${problems[0]}`);

  let issues = docs.map(() => ({ ref: 'BROUILLON (non émis)', fingerprint: '', issuedAt: null }));
  let refs = [];
  if (!draft) {
    const fingerprints = await Promise.all(docs.map(d => documentFingerprint(d)));
    refs = state.reserveDocumentRefs(docs.length);
    issues = buildIssues(refs, fingerprints);
  }
  const fileName = safeFileName(exportBaseName(docs, draft ? null : issues, template.title, draft));

  if (format !== 'none') {
    const engine = await import('./render/index.js');
    const opts = { organization: ctx.organization, issues, draft };
    if (format === 'pdf') await engine.downloadPdf(docs, opts, fileName);
    else if (format === 'word') await engine.downloadWord(docs, opts, fileName);
    else if (format === 'print') await engine.printDocuments(docs, opts);
  }

  let entries = [];
  if (!draft) {
    entries = useStore.getState().logDocuments(
      buildLogEntries(docs, issues, { templateId, values, format, fileName })
        .map(e => (origin ? { ...e, origin } : e))
    );
  }
  return { refs, entries, fileName, docs };
}

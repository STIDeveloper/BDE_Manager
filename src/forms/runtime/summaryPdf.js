// ============================================================
// STUDIO FORMULAIRES — PDF récapitulatif d'une réponse
// ============================================================
// Construit un document (AST du Studio Documents, voir
// src/documents/model.js) à partir de summarizeAnswers, puis le rend avec
// le moteur PDF vectoriel existant (src/documents/render/pdf.js), chargé à
// la demande : rien de lourd dans la page répondant tant qu'on ne clique pas.

import { summarizeAnswers, flattenItems } from '../engine/index.js';

const clean = s => String(s ?? '').slice(0, 4000);

// Le texte des réponses est passé tel quel : les moteurs de rendu échappent tout.
const guard = clean;

function formatDateTime(d) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(d);
  } catch { return d.toISOString(); }
}

/**
 * Document AST du récapitulatif.
 * opts : { context, responseId?, submittedAt?: Date, waitlisted?, receiptCode?, labelFor? }
 */
export function buildSummaryDocument(definition, answers, opts = {}) {
  const rows = summarizeAnswers(definition, answers, { context: opts.context || {}, labelFor: opts.labelFor });
  const title = clean(definition?.title || 'Formulaire');
  const at = opts.submittedAt instanceof Date ? opts.submittedAt : new Date();
  let n = 0;
  const id = () => `s${++n}`;
  const blocks = [
    { type: 'title', id: id(), text: guard(title), subtitle: 'Récapitulatif de ta réponse' },
    {
      type: 'keyValue', id: id(), rows: [
        ['Envoyée le', formatDateTime(at)],
        ...(opts.responseId ? [['Référence', guard(opts.responseId)]] : []),
        ...(opts.receiptCode ? [['Code de reçu', guard(opts.receiptCode)]] : []),
        ...(opts.waitlisted ? [['Statut', 'Liste d’attente']] : []),
      ],
    },
    { type: 'heading', id: id(), text: 'Tes réponses', level: 1 },
  ];
  if (rows.length) {
    blocks.push({
      type: 'table', id: id(),
      columns: [{ key: 'q', label: 'Question', width: 0.42 }, { key: 'a', label: 'Réponse', width: 0.58 }],
      rows: rows.map(r => ({ q: guard(r.label), a: guard(r.sensitive ? `${r.value} (donnée sensible)` : r.value) })),
    });
  } else {
    blocks.push({ type: 'paragraph', id: id(), text: 'Aucune réponse renseignée.', tone: 'muted', align: 'left' });
  }
  // Signatures dessinées : reproduites en image
  const sigs = flattenItems(definition)
    .filter(e => e.item.kind === 'question' && e.item.type === 'signature' && !e.repeatKey)
    .map(e => ({ label: guard(e.item.label || 'Signature'), image: answers?.[e.item.key] }))
    .filter(x => typeof x.image === 'string' && /^data:image\/png;base64,/.test(x.image));
  if (sigs.length) blocks.push({ type: 'signatures', id: id(), slots: sigs.slice(0, 4).map(x => ({ label: x.label, image: x.image, stamp: false })) });
  blocks.push({ type: 'callout', id: id(), tone: 'info', text: 'Document généré automatiquement à partir de ta réponse — à usage personnel. Il ne vaut pas reçu de paiement.' });
  return {
    meta: { templateId: 'form-summary', title: `${title} — récapitulatif`, fileName: `Recapitulatif_${title}`.slice(0, 80), confidential: rows.some(r => r.sensitive) },
    blocks,
  };
}

/** Télécharge le PDF récapitulatif. → nom du fichier */
export async function downloadSummaryPdf(definition, answers, opts = {}) {
  const doc = buildSummaryDocument(definition, answers, opts);
  const { downloadPdf } = await import('../../documents/render/pdf.js');
  const org = { name: clean(opts.organizationName || definition?.settings?.organizationName || definition?.organizationName || 'Bureau des étudiants') };
  return downloadPdf([doc], { organization: org, issues: [null] });
}

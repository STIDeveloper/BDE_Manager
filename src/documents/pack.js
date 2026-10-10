// ============================================================
// STUDIO DOCUMENTS — DOSSIER ANNUEL (pack de fin de mandat)
// ============================================================
// Page de garde + sommaire d'un dossier annuel. Modèle « système » : connu
// du registre (getTemplate) pour la vérification et la régénération, mais
// absent de la galerie. Les documents du dossier sont émis normalement
// (chacun son numéro) ; la page de garde reçoit aussi le sien.
// ============================================================

import { createBlockFactory, safeFileName } from './model.js';
import { formatDateLong, formatDateShort, isoDate } from './context.js';

export const PACK_TEMPLATE_ID = 'dossier-annuel';

/** Éléments proposés dans l'assistant (modèles intégrés). */
export const PACK_ITEMS = [
  { id: 'pv-ag', templateId: 'pv-ag', label: 'Procès-verbal d\'assemblée générale', fromRegistry: true,
    help: 'Le dernier PV d\'AG émis dans l\'année est réémis avec les mêmes valeurs.' },
  { id: 'liste-dirigeants', templateId: 'liste-dirigeants', label: 'Liste des dirigeants' },
  { id: 'registre-membres', templateId: 'registre-membres', label: 'Registre des membres' },
  { id: 'organigramme-officiel', templateId: 'organigramme-officiel', label: 'Organigramme officiel' },
  { id: 'registre-traitements', templateId: 'registre-traitements', label: 'Registre RGPD des traitements' },
];

/** Bornes d'une année universitaire « 2025-2026 » (1er sept. → 31 août). */
export function academicYearRange(year) {
  const start = Number(String(year).slice(0, 4));
  if (!Number.isFinite(start)) return null;
  return { start: new Date(start, 8, 1), end: new Date(start + 1, 8, 1) };
}

export function inAcademicYear(value, year) {
  const r = academicYearRange(year);
  const d = value ? new Date(value) : null;
  return !!(r && d && !Number.isNaN(d.getTime()) && d >= r.start && d < r.end);
}

const s = (v) => (v === undefined || v === null ? '' : String(v).trim());

export const packTemplate = {
  id: PACK_TEMPLATE_ID,
  hidden: true,
  category: 'gouvernance',
  title: 'Dossier annuel',
  description: 'Page de garde et sommaire du dossier annuel de fin de mandat.',
  icon: 'Archive',
  scope: 'organization',
  fields: [
    { key: 'annee', label: 'Année universitaire', type: 'text', default: '' },
    { key: 'dateDocument', label: 'Date d\'édition', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  build(ctx, v) {
    const B = createBlockFactory('pk');
    const org = ctx.organization || {};
    const annee = s(v.annee) || '________';
    const sommaire = Array.isArray(v.sommaire) ? v.sommaire : [];
    const archives = Array.isArray(v.archives) ? v.archives : [];
    const blocks = [
      B.title(`Dossier annuel ${annee}`, s(org.name) || 'Association'),
      B.p(`Ce dossier rassemble les documents officiels de l'année universitaire ${annee}. Chaque document porte sa propre référence et son empreinte, inscrites au registre des documents, ainsi qu'un QR code de vérification.`),
      B.kv([
        ['Association', s(org.name) || '________'],
        ['Numéro RNA', s(org.rna) || 'non renseigné'],
        ['Année universitaire', annee],
        ['Date d\'édition', formatDateLong(v.dateDocument) || formatDateLong(ctx.today)],
        ['Documents inclus', String(sommaire.length)],
      ]),
      B.heading('Sommaire'),
    ];
    if (sommaire.length) {
      blocks.push(B.table(
        [
          { key: 'n', label: 'N°', width: 0.07, align: 'center' },
          { key: 'titre', label: 'Document', width: 0.53 },
          { key: 'ref', label: 'Référence', width: 0.26 },
          { key: 'page', label: 'Page', width: 0.14, align: 'center' },
        ],
        sommaire.map((item, i) => ({ n: String(i + 1), titre: s(item.title) || 'Document', ref: s(item.ref) || '—', page: item.page ? String(item.page) : '—' })),
      ));
    } else {
      blocks.push(B.p('Aucun document inclus.', { editable: false }));
    }
    blocks.push(B.heading('Archives de l\'année'));
    if (archives.length) {
      blocks.push(B.p('Pièces conservées dans les archives numériques de l\'association (originaux scannés, non reproduits dans ce dossier) :', { editable: false }));
      blocks.push(B.table(
        [
          { key: 'titre', label: 'Pièce', width: 0.5 },
          { key: 'cat', label: 'Catégorie', width: 0.3 },
          { key: 'date', label: 'Date', width: 0.2, align: 'center' },
        ],
        archives.map(a => ({ titre: s(a.title) || 'Sans titre', cat: s(a.category) || '—', date: formatDateShort(a.date) || '—' })),
        { dense: true },
      ));
    } else {
      blocks.push(B.p('Aucune archive importée pour cette année.', { editable: false }));
    }
    blocks.push(B.callout('Pour vérifier un document : scanne son QR code ou recopie sa référence et son empreinte dans BDE Manager (Documents › Registre).', 'info'));
    return {
      meta: { templateId: PACK_TEMPLATE_ID, title: `Dossier annuel ${annee}`, fileName: safeFileName(`Dossier_annuel_${annee}`) },
      blocks,
    };
  },
};

// ============================================================
// ADMINISTRATION DES RÉPONSES — exports (CSV, Excel, PDF)
// ============================================================
// Chaque export porte la mention « usage interne ». Les colonnes
// sensibles ne sont incluses que si l'appelant l'autorise (droit
// forms.manage + choix explicite).
// ============================================================
import { summarizeAnswers } from '../engine/index.js';
import { adminQuestions, questionStats, fmtNum, headline, perDay, crossTab, quizStats, slotPlanning, statusesOf } from './analytics.js';
import { formatDateTimeFr } from './columns.js';

export const INTERNAL_NOTICE = 'Usage interne — données personnelles : ne pas diffuser, supprimer après usage.';

const stamp = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};
export const safeName = s => String(s || 'formulaire').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'formulaire';
export const exportFileName = (def, suffix, ext) => `${safeName(def.slug || def.title)}-${suffix}-${stamp()}.${ext}`;

/** Téléchargement d'un Blob. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Tableau d'export : { header: string[], data: (string|number|Date|null)[][] } */
export function buildTable(rows, columns) {
  const header = columns.map(c => c.label);
  const data = rows.map(r => columns.map(c => {
    if (c.date) { const d = new Date(r.submittedAt); return Number.isNaN(d.getTime()) ? null : d; }
    if (c.numeric) { const v = c.value(r); return v === null || v === undefined || v === '' ? null : Number(v); }
    const v = c.get(r);
    return v === null || v === undefined ? '' : String(v);
  }));
  return { header, data };
}

const csvCell = (v) => {
  let s;
  if (v === null || v === undefined) s = '';
  else if (v instanceof Date) s = formatDateTimeFr(v.toISOString());
  else if (typeof v === 'number') s = String(v).replace('.', ',');
  else s = String(v);
  // Neutralise les formules (injection CSV dans un tableur)
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (UTF-8 avec BOM, séparateur « ; », mention « usage interne » en 1re ligne). */
export function toCsv({ header, data }, title) {
  const lines = [csvCell(`${INTERNAL_NOTICE} ${title} — exporté le ${formatDateTimeFr(new Date().toISOString())}`), header.map(csvCell).join(';'), ...data.map(r => r.map(csvCell).join(';'))];
  return String.fromCharCode(0xFEFF) + `${lines.join('\r\n')}\r\n`;
}

export function exportCsv(def, rows, columns) {
  const csv = toCsv(buildTable(rows, columns), def.title);
  const name = exportFileName(def, 'reponses', 'csv');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name);
  return name;
}

/** Classeur Excel : feuille « Réponses » + feuille « Synthèse » (statistiques). */
export async function exportXlsx(def, rows, columns, { includeSummary = true } = {}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const { header, data } = buildTable(rows, columns);
  const bold = v => ({ value: v, fontWeight: 'bold' });
  const sheet1 = [
    [{ value: `${INTERNAL_NOTICE} ${def.title}`, fontWeight: 'bold', textColor: '#b91c1c', columnSpan: Math.max(1, Math.min(header.length, 8)) }, ...Array(Math.max(0, header.length - 1)).fill(null)],
    header.map(bold),
    ...data.map(r => r.map(v => (v instanceof Date ? { value: v, type: Date, format: 'dd/mm/yyyy hh:mm' } : typeof v === 'number' ? { value: v, type: Number } : v === null ? null : { value: v, type: String }))),
  ];
  const sheets = [{ data: sheet1, sheet: 'Réponses', stickyRowsCount: 2, columns: columns.map(c => ({ width: Math.max(10, Math.min(60, Math.round((c.width || 120) / 7))) })) }];
  if (includeSummary) {
    const summary = [[{ value: `Synthèse — ${def.title}`, fontWeight: 'bold' }, null, null], [{ value: INTERNAL_NOTICE, textColor: '#b91c1c' }, null, null], [bold('Question'), bold('Réponses'), bold('Indicateur')]];
    adminQuestions(def).filter(q => !q.sensitive).forEach(q => {
      const st = questionStats(q, rows);
      summary.push([{ value: q.label, type: String }, { value: st.answered, type: Number }, { value: headline(st).text, type: String }]);
      if (st.items) st.items.forEach(i => summary.push([{ value: `   ${i.label}`, type: String }, { value: i.count, type: Number }, { value: `${fmtNum(i.pct)} %`, type: String }]));
    });
    sheets.push({ data: summary, sheet: 'Synthèse', columns: [{ width: 50 }, { width: 12 }, { width: 40 }] });
  }
  const blob = await writeXlsxFile(sheets).toBlob();
  const name = exportFileName(def, 'reponses', 'xlsx');
  downloadBlob(blob, name);
  return name;
}

// ── Rapport PDF (moteur de rendu des documents) ────────────
export const REPORT_SECTIONS = [
  { id: 'summary', label: 'Synthèse (chiffres clés, évolution)' },
  { id: 'questions', label: 'Statistiques par question' },
  { id: 'crosstab', label: 'Croisement de deux questions' },
  { id: 'kind', label: 'Vue spécifique (quiz, créneaux)' },
  { id: 'responses', label: 'Réponses sélectionnées (détail)' },
];

/**
 * Construit le document (AST de src/documents/model.js) du rapport.
 * opts : { sections: Set, rows (filtrées), selected (réponses détaillées), crossDims?: [dimA, dimB],
 *          labelFor, includeSensitive, filtersLabel, maxDetailed }
 */
export async function buildReportDocument(def, opts) {
  const { createBlockFactory } = await import('../../documents/model.js');
  const b = createBlockFactory('r');
  const rows = opts.rows || [];
  const sections = opts.sections || new Set(REPORT_SECTIONS.map(s => s.id));
  const blocks = [];
  const now = formatDateTimeFr(new Date().toISOString());
  blocks.push(b.title(`Rapport — ${def.title}`, `Réponses au ${now}`));
  blocks.push(b.callout(`${INTERNAL_NOTICE} Ce rapport contient des réponses à un formulaire du BDE.`, 'warning'));
  if (opts.filtersLabel) blocks.push(b.small(`Filtres appliqués : ${opts.filtersLabel}`));

  if (sections.has('summary')) {
    blocks.push(b.heading('Synthèse'));
    const statuses = statusesOf(def);
    const days = perDay(rows);
    blocks.push(b.kv([
      ['Réponses analysées', String(rows.length)],
      ['Première réponse', rows.length ? formatDateTimeFr(rows.reduce((a, r) => (r.submittedAt < a ? r.submittedAt : a), rows[0].submittedAt)) : '—'],
      ['Dernière réponse', rows.length ? formatDateTimeFr(rows.reduce((a, r) => (r.submittedAt > a ? r.submittedAt : a), rows[0].submittedAt)) : '—'],
      ['Liste d\'attente', String(rows.filter(r => r.waitlisted).length)],
      ...statuses.map(s => [`Statut « ${s.label} »`, String(rows.filter(r => r.status === s.id).length)]),
    ]));
    if (days.length) {
      const weeks = new Map();
      days.forEach(d => { const k = d.day.slice(0, 7); weeks.set(k, (weeks.get(k) || 0) + d.count); });
      blocks.push(b.table([{ key: 'p', label: 'Mois', width: 0.6 }, { key: 'n', label: 'Réponses', width: 0.4, align: 'right' }], [...weeks.entries()].map(([p, n]) => ({ p, n: String(n) })), { caption: 'Évolution mensuelle', dense: true }));
    }
  }

  if (sections.has('questions')) {
    blocks.push(b.pageBreak());
    blocks.push(b.heading('Statistiques par question'));
    adminQuestions(def).forEach(q => {
      if (q.sensitive && !opts.includeSensitive) return;
      const st = questionStats(q, rows, { labelFor: opts.labelFor });
      blocks.push(b.heading(q.label, 2));
      blocks.push(b.small(`${st.answered} réponse${st.answered > 1 ? 's' : ''} sur ${st.total}${st.kind === 'filled' ? '' : ` — ${headline(st).text}`}`));
      const t = statsTable(st);
      if (t) blocks.push(b.table(t.columns, t.rows, { dense: true }));
    });
  }

  if (sections.has('crosstab') && opts.crossDims?.[0] && opts.crossDims?.[1]) {
    const [A, B] = opts.crossDims;
    const ct = crossTab(A, B, rows);
    blocks.push(b.pageBreak());
    blocks.push(b.heading(`Croisement : ${A.label} × ${B.label}`));
    const cols = ct.cols.slice(0, 7);
    blocks.push(b.table(
      [{ key: 'a', label: A.label, width: 0.3 }, ...cols.map((c, j) => ({ key: `c${j}`, label: c.label, align: 'right' })), { key: 't', label: 'Total', align: 'right' }],
      ct.rows.map((r, i) => ({ a: r.label, ...Object.fromEntries(cols.map((_, j) => [`c${j}`, `${ct.cells[i][j]} (${fmtNum(ct.rowTotals[i] ? (ct.cells[i][j] / ct.rowTotals[i]) * 100 : 0, 0)} %)`])), t: String(ct.rowTotals[i]) })),
      { dense: true, caption: ct.cols.length > 7 ? 'Les 7 premières colonnes sont affichées.' : '% en ligne' },
    ));
  }

  if (sections.has('kind')) {
    if (def.kind === 'quiz') {
      const qs = quizStats(def, rows);
      if (qs.n) {
        blocks.push(b.heading('Quiz'));
        blocks.push(b.kv([['Participants notés', String(qs.n)], ['Score moyen', `${fmtNum(qs.mean)} / ${fmtNum(qs.maxScore)}`], ['Médiane', fmtNum(qs.median)], ['Taux de réussite', qs.passRate === null ? '—' : `${fmtNum(qs.passRate, 0)} %`]]));
        blocks.push(b.table([{ key: 'q', label: 'Question', width: 0.6 }, { key: 's', label: 'Réussite', align: 'right' }], qs.perQuestion.map(p => ({ q: p.label, s: `${fmtNum(p.successPct, 0)} %` })), { dense: true }));
      }
    }
    slotPlanning(def, rows).forEach(p => {
      blocks.push(b.heading(`Créneaux — ${p.label}`));
      blocks.push(b.table([{ key: 's', label: 'Créneau', width: 0.5 }, { key: 'n', label: 'Inscrits', align: 'right' }, { key: 'c', label: 'Capacité', align: 'right' }, { key: 'w', label: 'Attente', align: 'right' }],
        p.slots.map(s => ({ s: s.label, n: String(s.count), c: s.capacity === null ? '—' : String(s.capacity), w: String(s.waitlisted) })), { dense: true }));
    });
  }

  if (sections.has('responses') && opts.selected?.length) {
    const list = opts.selected.slice(0, opts.maxDetailed || 100);
    blocks.push(b.pageBreak());
    blocks.push(b.heading(`Réponses détaillées (${list.length}${opts.selected.length > list.length ? ` sur ${opts.selected.length}` : ''})`));
    const statuses = statusesOf(def);
    list.forEach((r, i) => {
      let lines;
      try { lines = summarizeAnswers(opts.definitionFor ? opts.definitionFor(r) : def, r.answers || {}, { labelFor: opts.labelFor }); } catch { lines = []; }
      blocks.push(b.heading(`Réponse ${i + 1} — ${formatDateTimeFr(r.submittedAt)} — ${statuses.find(s => s.id === r.status)?.label || r.status}`, 2));
      const kv = lines.filter(l => opts.includeSensitive || !l.sensitive).map(l => [l.label, l.value]);
      blocks.push(kv.length ? b.kv(kv) : b.small('Aucune réponse lisible.'));
    });
  }
  blocks.push(b.small(`${INTERNAL_NOTICE} Généré le ${now} par BDE Manager.`));
  return {
    meta: { templateId: 'rapport-formulaire', title: `Rapport — ${def.title}`, fileName: `rapport-${safeName(def.slug || def.title)}`, confidential: true },
    blocks,
  };
}

function statsTable(st) {
  const c2 = (a, b2) => [{ key: 'a', label: a, width: 0.6 }, { key: 'b', label: b2, align: 'right' }];
  switch (st.kind) {
    case 'choice': case 'slots':
      return { columns: [...c2('Choix', 'Réponses'), { key: 'c', label: '%', align: 'right' }], rows: st.items.map(i => ({ a: i.label, b: `${i.count}${i.capacity ? ` / ${i.capacity}` : ''}`, c: `${fmtNum(i.pct)} %` })) };
    case 'scale': case 'nps': {
      const rows = [{ a: 'Moyenne', b: fmtNum(st.mean) }, { a: 'Médiane', b: fmtNum(st.median) }, ...st.dist.map(d => ({ a: `Note ${d.value}`, b: String(d.count) }))];
      if (st.kind === 'nps') rows.unshift({ a: 'Score NPS', b: String(st.score ?? '—') }, { a: 'Promoteurs / passifs / détracteurs', b: `${st.promoters} / ${st.passives} / ${st.detractors}` });
      return { columns: c2('Indicateur', 'Valeur'), rows };
    }
    case 'number':
      return { columns: c2('Indicateur', 'Valeur'), rows: [{ a: 'Moyenne', b: fmtNum(st.mean, 2) }, { a: 'Médiane', b: fmtNum(st.median, 2) }, { a: 'Minimum', b: fmtNum(st.min, 2) }, { a: 'Maximum', b: fmtNum(st.max, 2) }, { a: 'Total', b: fmtNum(st.sum, 2) }] };
    case 'ranking':
      return { columns: [...c2('Élément', 'Rang moyen'), { key: 'c', label: 'Classé 1er', align: 'right' }], rows: st.items.map(i => ({ a: i.label, b: fmtNum(i.avgRank), c: `${fmtNum(i.firstPct, 0)} %` })) };
    case 'matrix':
      return { columns: [{ key: 'a', label: 'Ligne', width: 0.35 }, ...st.cols.map((c, j) => ({ key: `c${j}`, label: c.label, align: 'right' }))], rows: st.rows.map((r, i) => ({ a: r.label, ...Object.fromEntries(st.cols.map((_, j) => [`c${j}`, String(st.cells[i][j])])) })) };
    case 'text':
      return st.words.length ? { columns: c2('Mot fréquent', 'Occurrences'), rows: st.words.slice(0, 12).map(w => ({ a: w.word, b: String(w.count) })) } : null;
    case 'date':
      return st.byDay.length ? { columns: c2('Date', 'Réponses'), rows: st.byDay.slice(0, 31).map(d => ({ a: d.day.split('-').reverse().join('/'), b: String(d.count) })) } : null;
    default: return null;
  }
}

/** Rendu PDF du rapport → Blob téléchargé. */
export async function exportPdfReport(def, opts) {
  const doc = await buildReportDocument(def, opts);
  const [{ renderDocumentsToPdf }, { useStore }, { buildContext }] = await Promise.all([
    import('../../documents/render/index.js'), import('../../store.js'), import('../../documents/context.js'),
  ]);
  const organization = buildContext(useStore.getState()).organization;
  const pdf = await renderDocumentsToPdf([doc], { organization, issues: [null] });
  const name = exportFileName(def, 'rapport', 'pdf');
  downloadBlob(pdf.output('blob'), name);
  return name;
}

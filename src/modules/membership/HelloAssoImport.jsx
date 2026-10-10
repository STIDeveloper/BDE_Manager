// Import d'un export CSV HelloAsso : association des colonnes, rapprochement
// automatique (email puis nom), création des cotisations + recettes, rapport.
import { useId, useMemo, useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateShort, formatMoney, isoDate } from '../../documents/context.js';
import { tableFromCsv, parseMoney, parseDateFr, guessColumn, readTextFile, downloadCsv } from '../finance/csv.js';
import { memberName, currentUserName, labelCls } from '../finance/hooks.js';
import { useMembershipStore, findMembership } from './store.js';
import { matchMember } from './logic.js';

const FIELDS = [
  ['lastName', 'Nom', [/^nom( de l)? ?(adherent|participant|beneficiaire)?$/, /^nom/, /last ?name/]],
  ['firstName', 'Prénom', [/^prenom( (adherent|participant|beneficiaire))?$/, /prenom/, /first ?name/]],
  ['email', 'Email', [/email (adherent|participant)/, /e ?mail/, /courriel/]],
  ['amount', 'Montant', [/montant (du )?tarif/, /^montant/, /montant/, /prix/, /amount/]],
  ['date', 'Date', [/date (de la )?commande/, /date (du )?paiement/, /^date/, /date/]],
];

export default function HelloAssoImport({ members, year, onClose }) {
  const memberships = useMembershipStore(s => s.memberships);
  const markPaid = useMembershipStore(s => s.markPaid);
  const uid = useId();
  const [table, setTable] = useState(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState({});
  const [manual, setManual] = useState({}); // index de ligne → memberId choisi à la main
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const onFile = async (file) => {
    if (!file) return;
    setError('');
    try {
      const t = tableFromCsv(await readTextFile(file));
      if (!t.rows.length) throw new Error('Aucune ligne de données.');
      const used = [];
      const m = {};
      FIELDS.forEach(([key, , patterns]) => { const i = guessColumn(t.headers, patterns, used); m[key] = i; if (i >= 0) used.push(i); });
      setMap(m); setTable(t); setFileName(file.name); setManual({});
    } catch (e) { setError(`Lecture impossible : ${e.message}`); }
  };

  const rows = useMemo(() => {
    if (!table) return [];
    const get = (r, k) => (map[k] >= 0 ? String(r[map[k]] || '').trim() : '');
    return table.rows.map((r, i) => {
      const row = {
        i, lastName: get(r, 'lastName'), firstName: get(r, 'firstName'), email: get(r, 'email'),
        amount: Math.abs(parseMoney(get(r, 'amount'))), date: parseDateFr(get(r, 'date')) || isoDate(),
      };
      const manualId = manual[i];
      const match = manualId ? { member: members.find(m => m.id === manualId), by: 'manuel' } : matchMember(row, members);
      const existing = match?.member ? findMembership(memberships, match.member.id, year) : null;
      const already = existing && ['paid', 'exempt'].includes(existing.status);
      return { ...row, match: match?.member ? match : null, already, validAmount: Number.isFinite(row.amount) && row.amount > 0 };
    });
  }, [table, map, manual, members, memberships, year]);

  const importable = rows.filter(r => r.match && !r.already && r.validAmount);
  // Un même membre présent deux fois : seule la première ligne est importée.
  const seen = new Set();
  const toImport = importable.filter(r => (seen.has(r.match.member.id) ? false : (seen.add(r.match.member.id), true)));

  const run = () => {
    const by = currentUserName();
    toImport.forEach(r => markPaid(r.match.member.id, year, { amount: r.amount, paidAt: r.date, method: 'helloasso', reference: `HelloAsso ${fileName}`, tariff: 'libre', source: 'helloasso', validatedBy: by }));
    const unmatched = rows.filter(r => !r.match);
    const skipped = rows.filter(r => r.match && (r.already || !r.validAmount || !toImport.includes(r)));
    setReport({ imported: toImport.length, total: toImport.reduce((a, r) => a + r.amount, 0), unmatched, skipped });
    toast.success('Import HelloAsso terminé', `${toImport.length} cotisation(s) enregistrée(s), ${unmatched.length} ligne(s) non rapprochée(s).`);
  };

  const exportUnmatched = () => {
    downloadCsv([['Nom', 'Prénom', 'Email', 'Montant', 'Date'], ...report.unmatched.map(r => [r.lastName, r.firstName, r.email, String(r.amount).replace('.', ','), formatDateShort(r.date)])],
      `HelloAsso_non_rapprochees_${isoDate()}_usage_interne.csv`);
  };

  const ready = map.amount >= 0 && (map.email >= 0 || map.lastName >= 0);

  return (
    <Modal isOpen onClose={onClose} title={`Import HelloAsso · cotisations ${year}`} maxWidth="max-w-4xl"
      description="Rapprochement automatique par email puis par nom. Chaque paiement crée la cotisation et la recette correspondante en trésorerie."
      footer={report ? <div className="flex justify-end"><button type="button" className="btn-primary" onClick={onClose}>Fermer</button></div>
        : table ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setTable(null)}>Changer de fichier</button>
            <button type="button" className="btn-primary" onClick={run} disabled={!ready || !toImport.length}>Enregistrer {toImport.length} cotisation(s)</button>
          </div>
        ) : null}>
      {report ? (
        <div className="space-y-3" role="status">
          <p className="flex items-center gap-2 text-ink"><CheckCircle2 size={18} className="text-emerald-600" aria-hidden="true" />{report.imported} cotisation(s) enregistrée(s) pour {formatMoney(report.total)}.</p>
          {report.skipped.length > 0 && <p className="text-sm text-dim">{report.skipped.length} ligne(s) ignorée(s) : cotisation déjà réglée/exonérée, doublon ou montant illisible.</p>}
          {report.unmatched.length > 0 ? (
            <div className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-3 text-sm">
              <p className="font-medium text-ink mb-1">{report.unmatched.length} ligne(s) non rapprochée(s)</p>
              <ul className="list-disc pl-5 text-dim">{report.unmatched.map(r => <li key={r.i}>{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'} · {r.email || 'sans email'} · {Number.isFinite(r.amount) ? formatMoney(r.amount) : '—'}</li>)}</ul>
              <p className="text-xs text-dim mt-2">Ajoute ces personnes comme membres (ou corrige leur email), puis réimporte le fichier : les cotisations déjà enregistrées ne seront pas dupliquées.</p>
              <button type="button" className="btn-secondary mt-2 py-1" onClick={exportUnmatched}><Download size={14} aria-hidden="true" /> Exporter ces lignes (CSV)</button>
            </div>
          ) : <p className="text-sm text-dim">Toutes les lignes ont été rapprochées.</p>}
        </div>
      ) : !table ? (
        <div className="space-y-3">
          <input id={`${uid}-file`} type="file" accept=".csv,text/csv,text/plain" className="sr-only peer" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <label htmlFor={`${uid}-file`} className="flex flex-col items-center gap-2 border-2 border-dashed border-line rounded-2xl p-8 cursor-pointer hover:bg-elevated peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60">
            <Upload size={24} className="text-dim" aria-hidden="true" />
            <span className="font-medium text-ink">Choisir l'export CSV HelloAsso</span>
            <span className="text-xs text-dim text-center">HelloAsso › Adhésions › Exporter (CSV). Les colonnes sont détectées automatiquement et modifiables.</span>
          </label>
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-dim">Fichier : <span className="text-ink">{fileName}</span> · {table.rows.length} ligne(s)</p>
          <fieldset className="border border-line rounded-xl p-3">
            <legend className="text-sm font-semibold text-ink px-1">Association des colonnes</legend>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {FIELDS.map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`${uid}-${key}`} className={labelCls}>{label}</label>
                  <select id={`${uid}-${key}`} className="input" value={map[key] ?? -1} onChange={e => setMap(m => ({ ...m, [key]: Number(e.target.value) }))}>
                    <option value={-1}>— Aucune —</option>
                    {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!ready && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Il faut au minimum le montant et l'email ou le nom.</p>}
          </fieldset>
          {ready && (
            <div className="overflow-x-auto border border-line rounded-xl max-h-[45vh]">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-xs text-dim border-b border-line">
                    <th scope="col" className="p-2 font-medium">Payeur</th>
                    <th scope="col" className="p-2 font-medium text-right">Montant</th>
                    <th scope="col" className="p-2 font-medium">Date</th>
                    <th scope="col" className="p-2 font-medium">Membre rapproché</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.i} className="border-b border-line/60 align-top">
                      <td className="p-2"><div className="text-ink">{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</div><div className="text-xs text-muted">{r.email}</div></td>
                      <td className="p-2 text-right tabular-nums">{r.validAmount ? formatMoney(r.amount) : <span className="text-rose-600">illisible</span>}</td>
                      <td className="p-2 tabular-nums">{formatDateShort(r.date)}</td>
                      <td className="p-2">
                        <label htmlFor={`${uid}-m${r.i}`} className="sr-only">Membre pour la ligne {r.i + 1}</label>
                        <select id={`${uid}-m${r.i}`} className="input py-1" value={r.match?.member.id || ''} onChange={e => setManual(m => ({ ...m, [r.i]: e.target.value }))}>
                          <option value="">— Non rapprochée —</option>
                          {members.map(m => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
                        </select>
                        <div className="text-xs mt-0.5">
                          {r.already ? <span className="text-dim">Déjà réglée / exonéré : ignorée</span>
                            : r.match ? <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true" />par {r.match.by}</span>
                              : <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><AlertTriangle size={12} aria-hidden="true" />aucun membre trouvé</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

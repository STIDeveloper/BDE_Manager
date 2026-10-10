// Import d'un relevé bancaire CSV : association des colonnes, détection des
// doublons, rapprochement avec les opérations existantes.
import { useId, useMemo, useState } from 'react';
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateShort, formatMoney } from '../../documents/context.js';
import { useFinanceStore, OTHER_CATEGORY_ID } from './store.js';
import { tableFromCsv, parseMoney, parseDateFr, guessColumn, readTextFile } from './csv.js';
import { bankKey, findDuplicate } from './logic.js';
import { currentUserName, labelCls } from './hooks.js';

const ACTIONS = { import: 'Importer', reconcile: 'Rapprocher l\'existante', skip: 'Ignorer' };

export default function BankImport({ open, onClose }) {
  const transactions = useFinanceStore(s => s.transactions);
  const categories = useFinanceStore(s => s.categories);
  const addTransactions = useFinanceStore(s => s.addTransactions);
  const setReconciled = useFinanceStore(s => s.setReconciled);
  const uid = useId();
  const [table, setTable] = useState(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState({ date: -1, label: -1, mode: 'single', amount: -1, debit: -1, credit: -1, invert: false });
  const [choices, setChoices] = useState({});
  const [error, setError] = useState('');

  const onFile = async (file) => {
    if (!file) return;
    setError('');
    try {
      const text = await readTextFile(file);
      const t = tableFromCsv(text);
      if (!t.rows.length) throw new Error('Aucune ligne de données trouvée.');
      const h = t.headers;
      const date = guessColumn(h, [/date (d )?operation/, /^date/, /date/]);
      const label = guessColumn(h, [/libelle/, /description/, /intitule/, /detail/, /motif/], [date]);
      const debit = guessColumn(h, [/debit/]);
      const credit = guessColumn(h, [/credit/]);
      const amount = guessColumn(h, [/^montant/, /montant/, /amount/, /somme/]);
      setMap({ date, label, mode: debit >= 0 && credit >= 0 && amount < 0 ? 'split' : 'single', amount, debit, credit, invert: false });
      setTable(t); setFileName(file.name); setChoices({});
    } catch (e) {
      setError(`Lecture impossible : ${e.message}`);
    }
  };

  // Lignes interprétées selon l'association courante.
  const rows = useMemo(() => {
    if (!table || map.date < 0 || map.label < 0) return [];
    const used = new Set();
    const keys = new Set();
    return table.rows.map((r, i) => {
      const date = parseDateFr(r[map.date]);
      let signed;
      if (map.mode === 'split') {
        const d = parseMoney(r[map.debit]); const c = parseMoney(r[map.credit]);
        signed = (Number.isFinite(c) ? Math.abs(c) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
        if (!Number.isFinite(d) && !Number.isFinite(c)) signed = NaN;
      } else {
        signed = parseMoney(r[map.amount]);
        if (map.invert) signed = -signed;
      }
      const label = String(r[map.label] || '').trim();
      const valid = !!date && Number.isFinite(signed) && signed !== 0;
      const row = { i, date, label, signed, type: signed >= 0 ? 'income' : 'expense', amount: Math.abs(signed), valid };
      if (!valid) return { ...row, error: !date ? 'date illisible' : 'montant illisible ou nul' };
      row.key = bankKey(date, signed, label);
      const inFile = keys.has(row.key);
      keys.add(row.key);
      const dup = inFile ? null : findDuplicate(row, transactions, used);
      if (dup) used.add(dup.tx.id);
      let def = 'import';
      if (inFile) def = 'skip';
      else if (dup?.exact || dup?.tx.reconciled) def = 'skip';
      else if (dup) def = 'reconcile';
      return { ...row, dup, inFile, defaultAction: def };
    });
  }, [table, map, transactions]);

  const actionOf = (r) => choices[r.i] || r.defaultAction;
  const counts = rows.reduce((a, r) => { if (r.valid) a[actionOf(r)] += 1; else a.invalid += 1; return a; }, { import: 0, reconcile: 0, skip: 0, invalid: 0 });

  const guessCategory = (label, type) => {
    const l = label.toLowerCase();
    const rules = [[/frais|commission|cotisation carte|abonnement banc/, 'frais-bancaires'], [/subvention|fsdie|cvec/, 'subventions'], [/adhesion|adhésion|cotisation bde/, 'cotisations'], [/sncf|uber|bus|ratp|essence|carbur/, 'transport'], [/carrefour|auchan|leclerc|lidl|metro|monoprix|franprix|intermarche/, 'alimentation']];
    const hit = rules.find(([rx, cat]) => rx.test(l) && categories[cat] && (categories[cat].type === 'both' || categories[cat].type === type));
    return hit ? hit[1] : OTHER_CATEGORY_ID;
  };

  const run = () => {
    const toImport = rows.filter(r => r.valid && actionOf(r) === 'import');
    const toReconcile = rows.filter(r => r.valid && actionOf(r) === 'reconcile' && r.dup);
    addTransactions(toImport.map(r => ({
      date: r.date, type: r.type, amount: r.amount, label: r.label || 'Opération bancaire',
      categoryId: guessCategory(r.label, r.type), method: 'virement', status: 'pending',
      reconciled: true, reconciledAt: new Date().toISOString(), importKey: r.key,
      notes: `Import relevé ${fileName}`, createdBy: currentUserName(), attachments: [],
    })));
    toReconcile.forEach(r => setReconciled(r.dup.tx.id, true));
    toast.success('Relevé importé', `${toImport.length} opération(s) créée(s) (en attente de validation), ${toReconcile.length} rapprochée(s), ${counts.skip} ignorée(s).`);
    reset(); onClose();
  };

  const reset = () => { setTable(null); setFileName(''); setChoices({}); setError(''); };
  const headers = table?.headers || [];
  const colSelect = (key, label) => (
    <div>
      <label htmlFor={`${uid}-${key}`} className={labelCls}>{label}</label>
      <select id={`${uid}-${key}`} className="input" value={map[key]} onChange={e => setMap(m => ({ ...m, [key]: Number(e.target.value) }))}>
        <option value={-1}>— Choisir —</option>
        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
      </select>
    </div>
  );
  const ready = map.date >= 0 && map.label >= 0 && (map.mode === 'single' ? map.amount >= 0 : map.debit >= 0 && map.credit >= 0);

  return (
    <Modal isOpen={open} onClose={() => { reset(); onClose(); }} title="Importer un relevé bancaire (CSV)" maxWidth="max-w-4xl"
      description="Les opérations importées sont marquées « rapprochées » et restent en attente de validation."
      footer={table ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={reset}>Changer de fichier</button>
          <button type="button" className="btn-primary" onClick={run} disabled={!ready || (counts.import + counts.reconcile === 0)}>
            Importer {counts.import} · rapprocher {counts.reconcile}
          </button>
        </div>
      ) : null}>
      {!table ? (
        <div className="space-y-3">
          <input id={`${uid}-file`} type="file" accept=".csv,text/csv,text/plain" className="sr-only peer" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <label htmlFor={`${uid}-file`} className="flex flex-col items-center gap-2 border-2 border-dashed border-line rounded-2xl p-8 cursor-pointer hover:bg-elevated peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60">
            <Upload size={24} className="text-dim" aria-hidden="true" />
            <span className="font-medium text-ink">Choisir le fichier CSV du relevé</span>
            <span className="text-xs text-dim text-center">Export de ta banque (séparateur ; , ou tabulation). Tu associeras ensuite les colonnes date, libellé et montant.</span>
          </label>
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-dim">Fichier : <span className="text-ink">{fileName}</span> · {table.rows.length} ligne(s)</p>
          <fieldset className="border border-line rounded-xl p-3">
            <legend className="text-sm font-semibold text-ink px-1">Association des colonnes</legend>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {colSelect('date', 'Date *')}
              {colSelect('label', 'Libellé *')}
              <div>
                <label htmlFor={`${uid}-mode`} className={labelCls}>Montants</label>
                <select id={`${uid}-mode`} className="input" value={map.mode} onChange={e => setMap(m => ({ ...m, mode: e.target.value }))}>
                  <option value="single">Une colonne signée (±)</option>
                  <option value="split">Colonnes Débit / Crédit</option>
                </select>
              </div>
              {map.mode === 'single' ? colSelect('amount', 'Montant (±) *') : (
                <div className="grid grid-cols-2 gap-2">{colSelect('debit', 'Débit *')}{colSelect('credit', 'Crédit *')}</div>
              )}
            </div>
            {map.mode === 'single' && (
              <label className="flex items-center gap-2 text-sm text-dim mt-2">
                <input type="checkbox" checked={map.invert} onChange={e => setMap(m => ({ ...m, invert: e.target.checked }))} />
                Inverser le signe (si les dépenses apparaissent en positif)
              </label>
            )}
          </fieldset>

          {ready ? (
            <>
              <p className="text-sm text-dim" role="status">
                {counts.import} à importer · {counts.reconcile} à rapprocher · {counts.skip} ignorée(s){counts.invalid ? ` · ${counts.invalid} illisible(s)` : ''}
              </p>
              <div className="overflow-x-auto border border-line rounded-xl max-h-[45vh]">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-left text-xs text-dim border-b border-line">
                      <th scope="col" className="p-2 font-medium">Date</th>
                      <th scope="col" className="p-2 font-medium">Libellé</th>
                      <th scope="col" className="p-2 font-medium text-right">Montant</th>
                      <th scope="col" className="p-2 font-medium">Contrôle</th>
                      <th scope="col" className="p-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.i} className="border-b border-line/60 align-top">
                        <td className="p-2 tabular-nums whitespace-nowrap">{r.date ? formatDateShort(r.date) : '—'}</td>
                        <td className="p-2 text-ink">{r.label || '—'}</td>
                        <td className={`p-2 text-right tabular-nums ${r.signed >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{Number.isFinite(r.signed) ? formatMoney(r.signed) : '—'}</td>
                        <td className="p-2 text-xs">
                          {!r.valid ? <span className="text-rose-600 dark:text-rose-400 inline-flex gap-1"><AlertTriangle size={12} aria-hidden="true" />{r.error}</span>
                            : r.inFile ? <span className="text-amber-600 dark:text-amber-400">Doublon dans le fichier</span>
                              : r.dup ? (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {r.dup.exact ? 'Déjà importée' : 'Doublon probable'} : « {r.dup.tx.label} » du {formatDateShort(r.dup.tx.date)}{r.dup.tx.reconciled ? ' (déjà rapprochée)' : ''}
                                </span>
                              ) : <span className="text-emerald-600 dark:text-emerald-400 inline-flex gap-1"><CheckCircle2 size={12} aria-hidden="true" />Nouvelle</span>}
                        </td>
                        <td className="p-2">
                          {r.valid && (
                            <>
                              <label htmlFor={`${uid}-a${r.i}`} className="sr-only">Action pour la ligne {r.i + 1}</label>
                              <select id={`${uid}-a${r.i}`} className="input py-1" value={actionOf(r)} onChange={e => setChoices(c => ({ ...c, [r.i]: e.target.value }))}>
                                {Object.entries(ACTIONS).filter(([k]) => k !== 'reconcile' || r.dup).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p className="text-sm text-amber-600 dark:text-amber-400">Associe les colonnes obligatoires pour voir l'aperçu.</p>}
        </div>
      )}
    </Modal>
  );
}

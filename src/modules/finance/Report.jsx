// Rapport financier de l'exercice (AG) : agrégation des opérations validées
// puis émission d'un document officiel via le Studio (modèle « rapport-financier »).
import { useId, useMemo, useState } from 'react';
import { FileDown, Printer, FileText, Loader2, Info } from 'lucide-react';
import { toast } from '../../components/ui/toastStore.js';
import { formatMoney, formatDateLong, isoDate } from '../../documents/context.js';
import { issueDocuments } from '../../documents/issue.js';
import { navigate } from '../../core/router.js';
import { useFinanceStore } from './store.js';
import { balanceAt, byCategory, totals } from './logic.js';
import { useEventsMap, labelCls } from './hooks.js';

/** « 2 dépense(s) (950,00 €) et 1 recette(s) (1 000,00 €) ». */
function pendingText(list) {
  const part = (type, word) => {
    const l = list.filter(t => t.type === type);
    return l.length ? `${l.length} ${word}(s) (${formatMoney(l.reduce((a, t) => a + t.amount, 0))})` : '';
  };
  return [part('expense', 'dépense'), part('income', 'recette')].filter(Boolean).join(' et ');
}

export default function Report({ range }) {
  const transactions = useFinanceStore(s => s.transactions);
  const categories = useFinanceStore(s => s.categories);
  const settings = useFinanceStore(s => s.settings);
  const events = useEventsMap();
  const uid = useId();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');

  const data = useMemo(() => {
    const list = Object.values(transactions);
    const inc = byCategory(list, 'income', categories, range.start, range.endExclusive);
    const exp = byCategory(list, 'expense', categories, range.start, range.endExclusive);
    // Solde d'ouverture de l'exercice : connu si la date d'ouverture précède le début de l'exercice.
    const openingKnown = !settings.openingDate || settings.openingDate <= range.start;
    const opening = openingKnown ? balanceAt(transactions, settings, range.start) : Number(settings.openingBalance) || 0;
    const pending = list.filter(t => t.status === 'pending' && t.date >= range.start && t.date < range.endExclusive);
    const byEvent = {};
    list.forEach(t => {
      if (!t.eventId || t.status !== 'validated' || t.date < range.start || t.date >= range.endExclusive) return;
      byEvent[t.eventId] = (byEvent[t.eventId] || 0) + (t.type === 'income' ? t.amount : -t.amount);
    });
    const faits = Object.entries(byEvent).map(([id, net]) => `${events[id]?.title || 'Événement'} : résultat ${net >= 0 ? '+' : ''}${formatMoney(Math.round(net * 100) / 100)}`);
    return {
      inc, exp, opening, openingKnown, pending, faits,
      totals: totals(list, range.start, range.endExclusive),
    };
  }, [transactions, categories, settings, range, events]);

  const closing = Math.round((data.opening + data.totals.net) * 100) / 100;

  const issue = async (format) => {
    setBusy(format);
    try {
      const res = await issueDocuments({
        templateId: 'rapport-financier',
        values: {
          exercice: range.label, startDate: range.start, endDate: range.last,
          compte: settings.bankLabel || '',
          soldeOuverture: data.opening,
          recettes: data.inc.items.map(i => ({ label: i.label, amount: i.amount })),
          depenses: data.exp.items.map(i => ({ label: i.label, amount: i.amount })),
          faits: data.faits,
          enAttente: pendingText(data.pending),
          commentaire: comment,
          date: isoDate(),
        },
        format,
        origin: 'finance',
      });
      toast.success('Rapport financier émis', `${res.refs[0]} — inscrit au registre des documents.`);
    } catch (e) {
      toast.error('Émission impossible', e.message);
    } finally { setBusy(''); }
  };

  const btn = (format, Icon, label, primary = false) => (
    <button type="button" className={primary ? 'btn-primary' : 'btn-secondary'} onClick={() => issue(format)} disabled={!!busy}>
      {busy === format ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />} {label}
    </button>
  );

  return (
    <div className="grid lg:grid-cols-[1fr_20rem] gap-4 items-start">
      <section className="bg-surface border border-line rounded-2xl p-4 space-y-4" aria-labelledby={`${uid}-t`}>
        <div>
          <h2 id={`${uid}-t`} className="font-semibold text-ink">Rapport financier · exercice {range.label}</h2>
          <p className="text-xs text-dim">Du {formatDateLong(range.start)} au {formatDateLong(range.last)} · opérations validées uniquement</p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            ['Solde d\'ouverture', data.opening], ['Recettes', data.totals.income], ['Dépenses', data.totals.expense],
            [data.totals.net >= 0 ? 'Excédent' : 'Déficit', Math.abs(data.totals.net)], ['Solde de clôture', closing],
          ].map(([l, v]) => (
            <div key={l} className="bg-elevated rounded-xl p-3"><dt className="text-xs text-dim">{l}</dt><dd className="font-semibold tabular-nums text-ink">{formatMoney(v)}</dd></div>
          ))}
        </dl>
        {!data.openingKnown && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1"><Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />La date du solde d'ouverture ({formatDateLong(settings.openingDate)}) est postérieure au début de l'exercice : le solde d'ouverture saisi est utilisé tel quel.</p>
        )}
        {[['Recettes', data.inc], ['Dépenses', data.exp]].map(([title, d]) => (
          <div key={title}>
            <h3 className="text-sm font-semibold text-ink mb-1">{title}</h3>
            {d.items.length === 0 ? <p className="text-sm text-dim">Aucune.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {d.items.map(i => (
                    <tr key={i.categoryId} className="border-b border-line/60">
                      <th scope="row" className="py-1 text-left font-normal text-ink">{i.label}</th>
                      <td className="py-1 text-right tabular-nums">{formatMoney(i.amount)}</td>
                      <td className="py-1 text-right text-dim w-14">{Math.round(i.share * 100)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {data.faits.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink mb-1">Résultats par événement</h3>
            <ul className="text-sm list-disc pl-5 text-dim">{data.faits.map(f => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
        {data.pending.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">{pendingText(data.pending)} en attente ne sont pas intégrées : valide-les avant l'AG.</p>
        )}
      </section>

      <aside className="bg-surface border border-line rounded-2xl p-4 space-y-3">
        <div>
          <label htmlFor={`${uid}-c`} className={labelCls}>Commentaire du trésorier (facultatif)</label>
          <textarea id={`${uid}-c`} className="input min-h-[110px]" value={comment} onChange={e => setComment(e.target.value)} placeholder="Contexte de l'exercice, projets financés, perspectives…" />
        </div>
        <div className="flex flex-col gap-2">
          {btn('pdf', FileDown, 'Émettre en PDF', true)}
          {btn('word', FileText, 'Émettre en Word')}
          {btn('print', Printer, 'Imprimer')}
        </div>
        <p className="text-xs text-dim">Le document est numéroté et inscrit au registre. Pour le retoucher, ouvre le modèle « Rapport financier » dans le <button type="button" className="underline text-blue-600 dark:text-blue-400" onClick={() => navigate('documents')}>Studio documents</button>.</p>
      </aside>
    </div>
  );
}

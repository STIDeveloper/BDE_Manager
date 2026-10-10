// ============================================================
// ADHÉSIONS & COTISATIONS — écran du module (section « membership »)
// ============================================================
import { useId, useMemo, useState } from 'react';
import {
  Search, CheckCircle2, Receipt, Mail, Upload, Download, Undo2, BadgeMinus, RotateCcw, Settings2, Loader2, Users, Wallet, Lock, Save,
} from 'lucide-react';
import { useCan } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { academicYear, formatDateShort, formatMoney, isoDate } from '../../documents/context.js';
import { issueDocuments } from '../../documents/issue.js';
import { PAYMENT_METHODS } from '../contracts.js';
import { downloadCsv, normalizeText, parseMoney } from '../finance/csv.js';
import { useRealMembers, memberName, currentUserName, labelCls } from '../finance/hooks.js';
import { Kpi, Empty } from '../finance/shared.jsx';
import { useMembershipStore, MEMBERSHIP_STATUS, defaultDueDate } from './store.js';
import { campaignRows, progress } from './logic.js';
import PayDialog from './PayDialog.jsx';
import ReminderDialog from './ReminderDialog.jsx';
import HelloAssoImport from './HelloAssoImport.jsx';

/** Années proposées : campagne, année courante, ±1, années présentes. */
function yearOptions(memberships, campaignYear) {
  const cur = academicYear();
  const start = Number(cur.slice(0, 4));
  const set = new Set([campaignYear, cur, `${start - 1}-${start}`, `${start + 1}-${start + 2}`]);
  Object.values(memberships).forEach(m => m.year && set.add(m.year));
  return [...set].filter(Boolean).sort().reverse();
}

export default function MembershipPage() {
  const canRead = useCan('membership', 'read');
  const canWrite = useCan('membership', 'write');
  const memberships = useMembershipStore(s => s.memberships);
  const settings = useMembershipStore(s => s.settings);
  const members = useRealMembers();
  const uid = useId();
  const [year, setYear] = useState(settings.campaignYear || academicYear());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState([]);
  const [paying, setPaying] = useState(null);
  const [reminding, setReminding] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState('');

  const rows = useMemo(() => campaignRows(members, memberships, year, settings.defaultAmount), [members, memberships, year, settings.defaultAmount]);
  const stats = useMemo(() => progress(rows), [rows]);
  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return rows.filter(r => (!status || r.status === status)
      && (!q || normalizeText(`${r.member.firstName} ${r.member.lastName} ${r.member.email || ''}`).includes(q)));
  }, [rows, search, status]);
  const selectedRows = rows.filter(r => selected.includes(r.member.id));
  const dueFiltered = filtered.filter(r => r.status === 'due');

  if (!canRead) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-dim">
        <Lock size={28} className="mx-auto mb-2" aria-hidden="true" />
        <p className="font-medium text-ink">Accès aux adhésions non autorisé</p>
      </div>
    );
  }

  const toggle = (id) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const allDueSelected = dueFiltered.length > 0 && dueFiltered.every(r => selected.includes(r.member.id));

  const issueReceipt = async (ms) => {
    const member = members.find(m => m.id === ms.memberId);
    if (!member) return;
    setBusy(ms.id);
    try {
      const res = await issueDocuments({
        templateId: 'recu-cotisation', memberIds: [ms.memberId],
        values: { montant: ms.amount, datePaiement: ms.paidAt || isoDate(), moyen: ms.method || 'autre', reference: ms.reference || '', annee: ms.year },
        format: 'pdf', origin: 'membership',
      });
      useMembershipStore.getState().setReceiptRef(ms.id, res.refs[0]);
      toast.success('Reçu émis', `${res.refs[0]} — ${memberName(member)}`);
    } catch (e) {
      toast.error('Reçu impossible', e.message);
    } finally { setBusy(''); }
  };

  const cancel = async (r) => {
    const ms = r.membership;
    const ok = await confirmDialog({
      title: 'Annuler le paiement ?',
      message: `La cotisation de ${memberName(r.member)} repassera « à payer ».`,
      confirmLabel: 'Annuler le paiement', cancelLabel: 'Retour', tone: 'warning',
    });
    if (!ok) return;
    let del = false;
    if (ms.transactionId) {
      del = await confirmDialog({
        title: 'Supprimer la recette liée ?',
        message: `La recette de ${formatMoney(ms.amount)} enregistrée en trésorerie pour ce paiement peut être supprimée (recommandé si le paiement n'a jamais eu lieu) ou conservée.`,
        confirmLabel: 'Supprimer la recette', cancelLabel: 'Conserver la recette', tone: 'danger',
      });
    }
    useMembershipStore.getState().cancelPayment(ms.id, { deleteTransaction: del });
    toast.info('Paiement annulé', del ? 'Recette supprimée de la trésorerie.' : (ms.transactionId ? 'Recette conservée (déliée).' : ''));
  };

  const exempt = async (r, value) => {
    if (value && !(await confirmDialog({ title: 'Exonérer ce membre ?', message: `${memberName(r.member)} n'aura pas de cotisation à payer pour ${year}.`, confirmLabel: 'Exonérer' }))) return;
    useMembershipStore.getState().setExempt(r.member.id, year, value);
    toast.success(value ? 'Membre exonéré' : 'Exonération retirée', memberName(r.member));
  };

  const refund = async (r) => {
    if (!(await confirmDialog({ title: 'Rembourser la cotisation ?', message: `Une dépense de ${formatMoney(r.membership.amount)} sera créée en trésorerie (en attente de validation).`, confirmLabel: 'Rembourser', tone: 'warning' }))) return;
    useMembershipStore.getState().refund(r.membership.id, { by: currentUserName() });
    toast.success('Remboursement enregistré', memberName(r.member));
  };

  const exportCsv = () => {
    const method = (id) => PAYMENT_METHODS.find(m => m.id === id)?.label || '';
    downloadCsv([
      ['Nom', 'Prénom', 'Email', 'Année', 'Statut', 'Montant', 'Payée le', 'Mode', 'Référence', 'Reçu', 'Source', 'Relances', 'Dernière relance'],
      ...filtered.map(r => [
        r.member.lastName, r.member.firstName, r.member.email || '', year, MEMBERSHIP_STATUS[r.status]?.label || r.status,
        String(r.amount ?? '').replace('.', ','), formatDateShort(r.membership?.paidAt), method(r.membership?.method), r.membership?.reference || '',
        r.membership?.receiptRef || '', r.membership?.source || '', r.reminderCount, formatDateShort(r.lastReminder),
      ]),
    ], `Cotisations_${year}_${isoDate()}_usage_interne.csv`);
    toast.success('Export CSV prêt', `${filtered.length} ligne(s).`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">Adhésions & cotisations</h2>
          <p className="text-sm text-dim">Campagne de cotisation, reçus, relances et import HelloAsso.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={`${uid}-y`} className={labelCls}>Année universitaire</label>
            <select id={`${uid}-y`} className="input" value={year} onChange={e => { setYear(e.target.value); setSelected([]); }}>
              {yearOptions(memberships, settings.campaignYear).map(y => <option key={y} value={y}>{y}{y === settings.campaignYear ? ' (campagne)' : ''}</option>)}
            </select>
          </div>
          <button type="button" className="btn-secondary" onClick={() => setShowSettings(v => !v)} aria-expanded={showSettings}><Settings2 size={14} aria-hidden="true" /> Réglages</button>
        </div>
      </div>

      {showSettings && <MembershipSettings canWrite={canWrite} onClose={() => setShowSettings(false)} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={CheckCircle2} label="Cotisations payées" value={`${stats.paid} / ${stats.expected}`} tone="good" hint={`${Math.round(stats.ratio * 100)} % · ${stats.exempt} exonéré(s)`} />
        <Kpi icon={Wallet} label="Montant encaissé" value={formatMoney(stats.collected)} />
        <Kpi icon={Users} label="Restant à payer" value={String(stats.due)} tone={stats.due ? 'warn' : 'neutral'} hint={`≈ ${formatMoney(stats.due * settings.defaultAmount)} attendus${settings.dueDate && year === settings.campaignYear ? ` · avant le ${formatDateShort(settings.dueDate)}` : ""}`} />
        <div className="bg-surface border border-line rounded-2xl p-4 flex flex-col justify-center">
          <div className="text-xs text-dim mb-1.5" id={`${uid}-pg`}>Progression {year}</div>
          <div className="h-2.5 bg-elevated rounded-full overflow-hidden" role="progressbar" aria-labelledby={`${uid}-pg`} aria-valuemin={0} aria-valuemax={stats.expected} aria-valuenow={stats.paid}>
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.ratio * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <label htmlFor={`${uid}-q`} className="sr-only">Rechercher un membre</label>
            <input id={`${uid}-q`} className="input pl-8" placeholder="Rechercher un membre…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${uid}-st`} className="sr-only">Statut</label>
            <select id={`${uid}-st`} className="input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Tous les statuts</option>
              {Object.entries(MEMBERSHIP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && <button type="button" className="btn-primary" disabled={!selectedRows.length} onClick={() => setReminding(selectedRows)}><Mail size={14} aria-hidden="true" /> Relancer la sélection ({selectedRows.length})</button>}
          {canWrite && <button type="button" className="btn-secondary" onClick={() => setImporting(true)}><Upload size={14} aria-hidden="true" /> Import HelloAsso</button>}
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!filtered.length}><Download size={14} aria-hidden="true" /> Exporter CSV</button>
          <button type="button" className="btn-ghost" onClick={() => navigate('finance', 'operations')}><Wallet size={14} aria-hidden="true" /> Voir en trésorerie</button>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl">
          <Empty icon={Users} title="Aucun membre">Ajoute des membres dans l'onglet Membres pour lancer la campagne.</Empty>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line text-sm">
            {canWrite && (
              <label className="flex items-center gap-2 text-dim">
                <input type="checkbox" checked={allDueSelected} disabled={!dueFiltered.length}
                  onChange={() => setSelected(allDueSelected ? [] : dueFiltered.map(r => r.member.id))} />
                Sélectionner les impayés affichés ({dueFiltered.length})
              </label>
            )}
            <span className="ml-auto text-xs text-dim" role="status">{filtered.length} membre(s)</span>
          </div>
          {filtered.length === 0 ? <p className="p-4 text-sm text-dim">Aucun membre ne correspond.</p> : (
            <ul className="divide-y divide-line">
              {filtered.map(r => {
                const ms = r.membership;
                const st = MEMBERSHIP_STATUS[r.status];
                return (
                  <li key={r.member.id} className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {canWrite && (
                      <input type="checkbox" aria-label={`Sélectionner ${memberName(r.member)}`} checked={selected.includes(r.member.id)} onChange={() => toggle(r.member.id)} />
                    )}
                    <div className="flex-1 min-w-[11rem]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink">{memberName(r.member)}</span>
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                        {ms?.source === 'helloasso' && <span className="badge badge-cyan">HelloAsso</span>}
                        {ms?.receiptRef && <span className="badge badge-brand">Reçu {ms.receiptRef}</span>}
                      </div>
                      <div className="text-xs text-dim flex flex-wrap gap-x-2">
                        <span>{r.member.email || 'sans email'}</span>
                        {r.status === 'paid' && <span>· {formatMoney(ms.amount)} le {formatDateShort(ms.paidAt)}{ms.method ? ` (${PAYMENT_METHODS.find(m => m.id === ms.method)?.label || ms.method})` : ''}</span>}
                        {r.reminderCount > 0 && <span title={ms.reminders.map(x => `${formatDateShort(x.at)} (${x.channel})`).join(', ')}>· {r.reminderCount} relance(s), dernière le {formatDateShort(r.lastReminder)}</span>}
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex flex-wrap gap-1">
                        {r.status === 'due' && (
                          <>
                            <button type="button" className="btn-primary py-1" onClick={() => setPaying(r.member)}><CheckCircle2 size={14} aria-hidden="true" /> Marquer payé</button>
                            <button type="button" className="btn-ghost p-1.5" aria-label={`Relancer ${memberName(r.member)}`} onClick={() => setReminding([r])}><Mail size={14} aria-hidden="true" /></button>
                            <button type="button" className="btn-ghost p-1.5" aria-label={`Exonérer ${memberName(r.member)}`} title="Exonérer" onClick={() => exempt(r, true)}><BadgeMinus size={14} aria-hidden="true" /></button>
                          </>
                        )}
                        {r.status === 'paid' && (
                          <>
                            <button type="button" className="btn-secondary py-1" onClick={() => issueReceipt(ms)} disabled={busy === ms.id}>
                              {busy === ms.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Receipt size={14} aria-hidden="true" />} {ms.receiptRef ? 'Nouveau reçu' : 'Reçu'}
                            </button>
                            <button type="button" className="btn-ghost p-1.5" aria-label={`Annuler le paiement de ${memberName(r.member)}`} title="Annuler le paiement" onClick={() => cancel(r)}><Undo2 size={14} aria-hidden="true" /></button>
                            <button type="button" className="btn-ghost p-1.5" aria-label={`Rembourser ${memberName(r.member)}`} title="Rembourser" onClick={() => refund(r)}><RotateCcw size={14} aria-hidden="true" /></button>
                          </>
                        )}
                        {r.status === 'exempt' && <button type="button" className="btn-ghost py-1" onClick={() => exempt(r, false)}>Retirer l'exonération</button>}
                        {r.status === 'refunded' && <button type="button" className="btn-ghost py-1" onClick={() => setPaying(r.member)}>Nouveau paiement</button>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {paying && <PayDialog member={paying} year={year} onClose={() => setPaying(null)} onPaid={issueReceipt} />}
      {reminding && <ReminderDialog rows={reminding} year={year} onClose={() => { setReminding(null); setSelected([]); }} />}
      {importing && <HelloAssoImport members={members} year={year} onClose={() => setImporting(false)} />}
    </div>
  );
}

function MembershipSettings({ canWrite, onClose }) {
  const settings = useMembershipStore(s => s.settings);
  const updateSettings = useMembershipStore(s => s.updateSettings);
  const uid = useId();
  const [form, setForm] = useState(() => ({
    defaultAmount: String(settings.defaultAmount).replace('.', ','),
    reducedAmount: String(settings.reducedAmount).replace('.', ','),
    campaignYear: settings.campaignYear || academicYear(),
    dueDate: settings.dueDate || defaultDueDate(settings.campaignYear),
  }));
  const [error, setError] = useState('');
  const save = (e) => {
    e.preventDefault();
    const d = parseMoney(form.defaultAmount); const r = parseMoney(form.reducedAmount);
    if (!(d >= 0) || !(r >= 0)) { setError('Montants invalides.'); return; }
    if (!/^\d{4}-\d{4}$/.test(form.campaignYear)) { setError('Année au format 2026-2027.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) { setError('Date limite de paiement obligatoire.'); return; }
    updateSettings({ defaultAmount: d, reducedAmount: r, campaignYear: form.campaignYear, dueDate: form.dueDate });
    toast.success('Réglages des adhésions enregistrés');
    onClose();
  };
  return (
    <form onSubmit={save} className="bg-surface border border-line rounded-2xl p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      <div>
        <label htmlFor={`${uid}-d`} className={labelCls}>Cotisation normale (€)</label>
        <input id={`${uid}-d`} className="input" inputMode="decimal" disabled={!canWrite} value={form.defaultAmount} onChange={e => setForm(f => ({ ...f, defaultAmount: e.target.value }))} />
      </div>
      <div>
        <label htmlFor={`${uid}-r`} className={labelCls}>Cotisation réduite (€)</label>
        <input id={`${uid}-r`} className="input" inputMode="decimal" disabled={!canWrite} value={form.reducedAmount} onChange={e => setForm(f => ({ ...f, reducedAmount: e.target.value }))} />
      </div>
      <div>
        <label htmlFor={`${uid}-y`} className={labelCls}>Année de campagne</label>
        <input id={`${uid}-y`} className="input" disabled={!canWrite} value={form.campaignYear} onChange={e => setForm(f => ({ ...f, campaignYear: e.target.value }))} placeholder="2026-2027"
          onBlur={e => { if (/^\d{4}-\d{4}$/.test(e.target.value) && form.dueDate.slice(0, 4) !== e.target.value.slice(0, 4)) setForm(f => ({ ...f, dueDate: defaultDueDate(e.target.value) })); }} />
      </div>
      <div>
        <label htmlFor={`${uid}-due`} className={labelCls}>Date limite de paiement</label>
        <input id={`${uid}-due`} type="date" className="input" disabled={!canWrite} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
      </div>
      {canWrite && <button type="submit" className="btn-primary"><Save size={14} aria-hidden="true" /> Enregistrer</button>}
      {error && <p role="alert" className="sm:col-span-2 lg:col-span-5 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </form>
  );
}

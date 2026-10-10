// Enregistrement d'un paiement de cotisation (→ recette liée en trésorerie).
import { useId, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';
import { formatMoney, isoDate } from '../../documents/context.js';
import { PAYMENT_METHODS } from '../contracts.js';
import { parseMoney } from '../finance/csv.js';
import { memberName, currentUserName, labelCls } from '../finance/hooks.js';
import { useMembershipStore } from './store.js';

export default function PayDialog({ member, year, onClose, onPaid }) {
  const settings = useMembershipStore(s => s.settings);
  const markPaid = useMembershipStore(s => s.markPaid);
  const uid = useId();
  const [tariff, setTariff] = useState('normal');
  const [amount, setAmount] = useState(String(settings.defaultAmount).replace('.', ','));
  const [date, setDate] = useState(isoDate());
  const [method, setMethod] = useState('especes');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState(true);
  const [error, setError] = useState('');

  const pickTariff = (t) => {
    setTariff(t);
    if (t === 'normal') setAmount(String(settings.defaultAmount).replace('.', ','));
    if (t === 'reduit') setAmount(String(settings.reducedAmount).replace('.', ','));
  };

  const submit = (e) => {
    e.preventDefault();
    const value = parseMoney(amount);
    if (!Number.isFinite(value) || value <= 0) { setError('Montant invalide.'); return; }
    const ms = markPaid(member.id, year, { amount: value, paidAt: date, method, reference: reference.trim(), tariff, validatedBy: currentUserName() });
    toast.success('Cotisation enregistrée', `${memberName(member)} — ${formatMoney(value)} · recette ajoutée en trésorerie.`);
    onClose();
    if (receipt) onPaid?.(ms);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Cotisation ${year}`} description={memberName(member)}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" form={`${uid}-f`} className="btn-primary">Enregistrer le paiement</button>
        </div>
      )}>
      <form id={`${uid}-f`} onSubmit={submit} className="space-y-3" noValidate>
        <fieldset>
          <legend className={labelCls}>Tarif</legend>
          <div className="grid grid-cols-3 gap-2">
            {[['normal', `Normal · ${formatMoney(settings.defaultAmount)}`], ['reduit', `Réduit · ${formatMoney(settings.reducedAmount)}`], ['libre', 'Autre montant']].map(([v, l]) => (
              <label key={v} className={`chip justify-center py-2 text-center ${tariff === v ? 'chip-active' : 'chip-idle'} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/60`}>
                <input type="radio" name={`${uid}-t`} value={v} checked={tariff === v} onChange={() => pickTariff(v)} className="sr-only" />{l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-a`} className={labelCls}>Montant (€)</label>
            <input id={`${uid}-a`} className="input tabular-nums" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setTariff('libre'); }} />
          </div>
          <div>
            <label htmlFor={`${uid}-d`} className={labelCls}>Date du paiement</label>
            <input id={`${uid}-d`} type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${uid}-m`} className={labelCls}>Mode de règlement</label>
            <select id={`${uid}-m`} className="input" value={method} onChange={e => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-r`} className={labelCls}>Référence</label>
            <input id={`${uid}-r`} className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder="N° de chèque…" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={receipt} onChange={e => setReceipt(e.target.checked)} /> Émettre le reçu (PDF) juste après
        </label>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Modal>
  );
}

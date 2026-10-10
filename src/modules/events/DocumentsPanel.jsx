import { useId, useMemo, useState } from 'react';
import { Award, ClipboardPen, ExternalLink, Loader2 } from 'lucide-react';
import { useStore } from '../../store.js';
import { navigate } from '../../core/router.js';
import { useCan } from '../../core/permissions.js';
import { toast } from '../../components/ui/toastStore.js';
import { issueDocuments } from '../../documents/issue.js';
import { durationLabel, splitIso } from './logic.js';
import { useMembers } from './hooks.js';

const FORMATS = [
  { id: 'pdf', label: 'PDF' },
  { id: 'print', label: 'Imprimer' },
  { id: 'word', label: 'Word' },
];

/**
 * Feuille d'émargement et attestations de participation, émises via
 * issueDocuments (numérotées et inscrites au registre des documents).
 */
export default function DocumentsPanel({ ev }) {
  const uid = useId();
  const canDocs = useCan('documents', 'write');
  const documentLog = useStore(s => s.documentLog);
  const members = useMembers();
  const [format, setFormat] = useState('pdf');
  const [who, setWho] = useState('auto');
  const [busy, setBusy] = useState('');

  const active = useMemo(() => (ev.participants || []).filter(p => ['registered', 'present', 'absent'].includes(p.status)), [ev.participants]);
  const present = useMemo(() => (ev.participants || []).filter(p => p.status === 'present'), [ev.participants]);
  const target = who === 'all' || (who === 'auto' && present.length === 0) ? active : present;
  const s = splitIso(ev.start); const e = splitIso(ev.end);

  // Documents déjà émis pour cet événement (registre).
  const issued = useMemo(() => documentLog.filter(d => d.origin?.module === 'events' && d.origin?.id === ev.id), [documentLog, ev.id]);
  const origin = { type: 'module', module: 'events', id: ev.id, label: ev.title };

  const emargement = async () => {
    const memberIds = active.map(p => p.memberId).filter(id => id && members.byId.has(id));
    const outsiders = active.length - memberIds.length;
    setBusy('emargement');
    try {
      const res = await issueDocuments({
        templateId: 'feuille-emargement',
        values: {
          contexte: 'evenement', intitule: ev.title, date: s.date, heure: s.time, lieu: ev.location || '',
          membres: memberIds, lignesLibres: Math.min(60, outsiders + 5), colonnePouvoir: false, paysage: false,
        },
        format, origin,
      });
      toast.success('Feuille d\'émargement émise', `${res.refs.join(', ')} — ${memberIds.length} membre(s)${outsiders ? `, ${outsiders} ligne(s) pour les non-membres` : ''}.`);
    } catch (err) {
      toast.error('Émission impossible', err.message);
    } finally { setBusy(''); }
  };

  const attestations = async () => {
    if (!target.length) { toast.warn('Aucun participant', 'Ajoute des participants (ou pointe les présents) d\'abord.'); return; }
    const memberIds = target.map(p => p.memberId).filter(id => id && members.byId.has(id));
    const names = target.filter(p => !(p.memberId && members.byId.has(p.memberId))).map(p => p.name);
    setBusy('attestations');
    try {
      const res = await issueDocuments({
        templateId: 'attestation-evenement',
        values: {
          eventName: ev.title, eventDate: s.date, eventEndDate: e.date && e.date !== s.date ? e.date : '',
          place: ev.location || '', duration: durationLabel(ev.start, ev.end), description: '',
          participants: names, memberIds,
        },
        format, origin,
      });
      toast.success('Attestations émises', `${target.length} attestation(s) — ${res.refs.join(', ')} (registre des documents).`);
    } catch (err) {
      toast.error('Émission impossible', err.message);
    } finally { setBusy(''); }
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby={`${uid}-h`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${uid}-h`} className="font-semibold text-ink">Documents officiels</h3>
        <div className="flex items-center gap-2">
          <label htmlFor={`${uid}-fmt`} className="text-xs text-dim">Format</label>
          <select id={`${uid}-fmt`} className="input w-auto py-1" value={format} onChange={(e2) => setFormat(e2.target.value)}>
            {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
      </div>
      {!canDocs && <p className="text-xs text-amber-600">Tu n'as pas le droit d'émettre des documents.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-line rounded-xl p-3 space-y-2">
          <p className="text-sm font-medium text-ink flex items-center gap-2"><ClipboardPen size={15} aria-hidden="true" /> Feuille d'émargement</p>
          <p className="text-xs text-dim">Préremplie avec les {active.filter(p => p.memberId).length} participant(s) membre(s) ; lignes libres pour les autres.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!canDocs || !!busy} onClick={emargement}>
              {busy === 'emargement' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Émettre
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate('documents', 'feuille-emargement')}>
              <ExternalLink size={14} aria-hidden="true" /> Studio
            </button>
          </div>
        </div>
        <div className="border border-line rounded-xl p-3 space-y-2">
          <p className="text-sm font-medium text-ink flex items-center gap-2"><Award size={15} aria-hidden="true" /> Attestations de participation</p>
          <div className="flex items-center gap-2">
            <label htmlFor={`${uid}-who`} className="text-xs text-dim">Pour</label>
            <select id={`${uid}-who`} className="input py-1" value={who} onChange={(e2) => setWho(e2.target.value)}>
              <option value="auto">Présents pointés (sinon tous les inscrits)</option>
              <option value="present">Présents uniquement ({present.length})</option>
              <option value="all">Tous les inscrits ({active.length})</option>
            </select>
          </div>
          <p className="text-xs text-dim">{target.length} attestation(s) générée(s) en lot, numérotées.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!canDocs || !!busy || !target.length} onClick={attestations}>
              {busy === 'attestations' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Émettre {target.length || ''}
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate('documents', 'attestation-evenement')}>
              <ExternalLink size={14} aria-hidden="true" /> Studio
            </button>
          </div>
        </div>
      </div>
      {issued.length > 0 && (
        <div>
          <h4 className="text-xs text-dim mb-1">Déjà émis pour cet événement</h4>
          <ul className="text-xs text-ink space-y-0.5">
            {issued.slice(0, 8).map(d => (
              <li key={d.id}><span className="font-mono">{d.ref}</span> — {d.title} <span className="text-muted">({new Date(d.createdAt).toLocaleDateString('fr-FR')})</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

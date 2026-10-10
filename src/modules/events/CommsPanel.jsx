import { useId, useMemo, useState } from 'react';
import { CalendarPlus, Copy, Megaphone } from 'lucide-react';
import { useStore } from '../../store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { toast } from '../../components/ui/toastStore.js';
import { announcementText, buildIcs, downloadFile, safeName } from './logic.js';

/** Texte d'annonce (WhatsApp / Instagram) à copier + fichier .ics. */
export default function CommsPanel({ ev }) {
  const uid = useId();
  const organization = useStore(s => s.organization);
  const { poleLabel } = useCatalog();
  const [channel, setChannel] = useState('whatsapp');
  const orgName = organization?.shortName || organization?.name || '';
  const generated = useMemo(
    () => announcementText(ev, { channel, orgName, poleLabel: ev.poleId ? poleLabel(ev.poleId) : '' }),
    [ev, channel, orgName, poleLabel],
  );
  const [edited, setEdited] = useState(null); // { key, text } : retouches de l'utilisateur
  const key = `${channel}|${generated}`;
  const text = edited?.key === key ? edited.text : generated;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Annonce copiée', channel === 'whatsapp' ? 'Colle-la dans WhatsApp.' : 'Colle-la dans ta publication Instagram.');
    } catch {
      document.getElementById(`${uid}-txt`)?.select();
      toast.warn('Copie automatique impossible', 'Le texte est sélectionné : fais Ctrl+C / Copier.');
    }
  };

  const ics = () => {
    try {
      downloadFile(buildIcs(ev, { orgName }), `${safeName(ev.title)}.ics`, 'text/calendar;charset=utf-8');
      toast.success('Fichier .ics téléchargé', 'À importer dans Google Agenda, Outlook ou Calendrier.');
    } catch (e) {
      toast.error('Fichier .ics impossible', e.message);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className="font-semibold text-ink flex items-center gap-2"><Megaphone size={16} aria-hidden="true" /> Communication</h3>
      <div className="flex gap-1" role="group" aria-label="Réseau">
        {[['whatsapp', 'WhatsApp'], ['instagram', 'Instagram']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={channel === id} onClick={() => setChannel(id)}
            className={`chip ${channel === id ? 'chip-active' : 'chip-idle'}`}>{label}</button>
        ))}
      </div>
      <label htmlFor={`${uid}-txt`} className="sr-only">Texte de l'annonce</label>
      <textarea id={`${uid}-txt`} rows={9} className="input text-xs font-mono" value={text}
        onChange={(e) => setEdited({ key, text: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={copy}><Copy size={14} aria-hidden="true" /> Copier</button>
        <button type="button" className="btn-secondary" onClick={ics}><CalendarPlus size={14} aria-hidden="true" /> Fichier .ics</button>
      </div>
    </section>
  );
}

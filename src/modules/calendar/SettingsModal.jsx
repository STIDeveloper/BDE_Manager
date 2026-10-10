import { useId, useState } from 'react';
import { Bell, BellOff, Download, Info } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';
import { useCan } from '../../core/permissions.js';
import { useCalendarStore, DEFAULT_CALENDAR_SETTINGS } from './store.js';
import { notificationPermission, notificationsSupported, showNotification, checkNow, resetNotified } from './scheduler.js';
import { formatDateLong } from '../../documents/context.js';

/** Réglages : notifications, AG, assurance. */
export function SettingsModal({ onClose }) {
  const canWrite = useCan('calendar', 'write');
  const stored = useCalendarStore(s => s.settings);
  const updateSettings = useCalendarStore(s => s.updateSettings);
  const settings = { ...DEFAULT_CALENDAR_SETTINGS, ...stored };
  const [form, setForm] = useState(() => ({
    agDate: settings.agDate || '',
    agIntervalMonths: String(settings.agIntervalMonths || 12),
    insuranceRenewal: settings.insuranceRenewal || '',
    insuranceLabel: settings.insuranceLabel || '',
  }));
  const [permission, setPermission] = useState(() => notificationPermission());
  const uid = useId();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const enableNotifications = async () => {
    if (!notificationsSupported()) { toast.error('Notifications indisponibles', 'Ce navigateur ne prend pas en charge les notifications.'); return; }
    let p = Notification.permission;
    if (p === 'default') {
      try { p = await Notification.requestPermission(); } catch { p = Notification.permission; }
    }
    setPermission(p);
    if (p !== 'granted') {
      toast.warn('Permission refusée', 'Autorise les notifications pour ce site dans les réglages du navigateur.');
      return;
    }
    updateSettings({ notifications: true });
    toast.success('Notifications activées', 'Les échéances du jour et en retard te seront signalées.');
    checkNow().catch(() => {});
  };

  const test = async () => {
    const ok = await showNotification('Test BDE Manager', { body: 'Les notifications de l\'agenda fonctionnent.', tag: 'bde-agenda-test' });
    if (ok) toast.success('Notification envoyée'); else toast.error('Échec', 'La notification n\'a pas pu être affichée.');
  };

  const save = (e) => {
    e.preventDefault();
    const months = Math.max(1, Math.min(36, Math.round(Number(form.agIntervalMonths) || 12)));
    updateSettings({
      agDate: form.agDate, agIntervalMonths: months,
      insuranceRenewal: form.insuranceRenewal, insuranceLabel: form.insuranceLabel.trim().slice(0, 80),
    });
    toast.success('Réglages enregistrés');
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Réglages de l'agenda"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Fermer</button>
          {canWrite && <button type="submit" form={`${uid}-f`} className="btn-primary">Enregistrer</button>}
        </div>
      )}
    >
      <div className="space-y-5">
        <section aria-labelledby={`${uid}-n`} className="space-y-2">
          <h4 id={`${uid}-n`} className="font-semibold text-ink flex items-center gap-2"><Bell size={16} aria-hidden="true" /> Notifications</h4>
          <p className="text-sm text-dim">
            Quand l'application est <strong>ouverte</strong> (onglet ou PWA installée), elle vérifie les échéances à l'ouverture puis toutes les
            15 minutes, et te notifie une seule fois par échéance du jour ou en retard sur cet appareil.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 flex gap-1.5">
            <Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            Aucune notification n'arrive quand l'application est fermée (pas de serveur de push). Pour être alerté en toutes circonstances,
            exporte l'agenda vers Google Agenda ou Apple Calendrier.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {settings.notifications && permission === 'granted' ? (
              <>
                <span className="badge badge-emerald">Activées</span>
                <button type="button" className="btn-secondary" onClick={test}>Tester</button>
                <button type="button" className="btn-ghost" onClick={() => { updateSettings({ notifications: false }); toast.info('Notifications désactivées'); }}>
                  <BellOff size={15} aria-hidden="true" /> Désactiver
                </button>
                <button type="button" className="btn-ghost" onClick={() => { resetNotified(); toast.info('Historique réinitialisé', 'Les échéances en cours pourront être notifiées à nouveau.'); }}>
                  Réinitialiser l'historique
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={enableNotifications} disabled={permission === 'denied' || permission === 'unsupported'}>
                <Bell size={15} aria-hidden="true" /> Activer les notifications
              </button>
            )}
          </div>
          {permission === 'denied' && <p className="text-xs text-red-600 dark:text-red-400">Les notifications sont bloquées pour ce site : débloque-les dans les réglages du navigateur.</p>}
          {permission === 'unsupported' && <p className="text-xs text-dim">Ce navigateur ne prend pas en charge les notifications (sur iPhone : installe d'abord l'app sur l'écran d'accueil).</p>}
          {settings.lastNotifiedAt && <p className="text-xs text-dim">Dernière notification : {formatDateLong(settings.lastNotifiedAt)}.</p>}
        </section>

        <form id={`${uid}-f`} onSubmit={save} className="space-y-4">
          <fieldset className="space-y-2" disabled={!canWrite}>
            <legend className="font-semibold text-ink">Assemblée générale annuelle</legend>
            <p className="text-xs text-dim">Par défaut, l'échéance est déduite de la dernière convocation ou du dernier PV d'AG émis (+ l'intervalle). Une date fixée ici a la priorité.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-ag`} className="block text-sm font-medium text-ink mb-1">Date prévue</label>
                <input id={`${uid}-ag`} type="date" className="input w-full" value={form.agDate} onChange={set('agDate')} />
              </div>
              <div>
                <label htmlFor={`${uid}-agi`} className="block text-sm font-medium text-ink mb-1">Intervalle (mois)</label>
                <input id={`${uid}-agi`} type="number" min="1" max="36" className="input w-full" value={form.agIntervalMonths} onChange={set('agIntervalMonths')} />
              </div>
            </div>
          </fieldset>
          <fieldset className="space-y-2" disabled={!canWrite}>
            <legend className="font-semibold text-ink">Assurance</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-ins`} className="block text-sm font-medium text-ink mb-1">Date de renouvellement</label>
                <input id={`${uid}-ins`} type="date" className="input w-full" value={form.insuranceRenewal} onChange={set('insuranceRenewal')} />
              </div>
              <div>
                <label htmlFor={`${uid}-insl`} className="block text-sm font-medium text-ink mb-1">Assureur / contrat</label>
                <input id={`${uid}-insl`} className="input w-full" value={form.insuranceLabel} onChange={set('insuranceLabel')} maxLength={80} placeholder="Ex. MAIF RC asso" />
              </div>
            </div>
            <p className="text-xs text-dim">Rappel chaque année à cette date.</p>
          </fieldset>
        </form>
      </div>
    </Modal>
  );
}

/** Export .ics + explications d'import. */
export function ExportModal({ onClose, onExport, count }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Synchroniser avec Google Agenda / Apple"
      description="Export iCalendar (.ics) de tout l'agenda"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Fermer</button>
          <button type="button" className="btn-primary" onClick={onExport}><Download size={15} aria-hidden="true" /> Télécharger le fichier .ics</button>
        </div>
      )}
    >
      <div className="space-y-4 text-sm text-ink">
        <p>Le fichier contient {count} élément{count > 1 ? 's' : ''} : les échéances calculées de 3 mois en arrière à 2 ans en avant et tes rappels (récurrences comprises). Usage interne : il contient des noms de membres.</p>
        <div>
          <h4 className="font-semibold mb-1">Google Agenda (ordinateur)</h4>
          <ol className="list-decimal pl-5 space-y-0.5 text-dim">
            <li>Ouvre calendar.google.com → roue crantée → <em>Paramètres</em>.</li>
            <li>Conseil : crée d'abord un agenda dédié (« Ajouter un agenda » → « Créer un agenda »), par ex. « BDE ».</li>
            <li><em>Importer et exporter</em> → <em>Importer</em> → choisis le fichier .ics et l'agenda de destination.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold mb-1">Apple Calendrier</h4>
          <p className="text-dim">Sur Mac : <em>Fichier → Importer…</em>. Sur iPhone : ouvre le fichier .ics (Fichiers ou pièce jointe) puis « Ajouter tout ».</p>
        </div>
        <p className="text-xs text-dim flex gap-1.5">
          <Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          C'est un export ponctuel, pas un abonnement : ré-importe le fichier après des changements. Les identifiants (UID) sont stables,
          ce qui permet aux agendas de reconnaître un élément déjà importé et limite les doublons ; un élément supprimé ici n'est pas
          retiré de l'agenda importé. Google Agenda ignore généralement les alarmes des fichiers importés.
        </p>
      </div>
    </Modal>
  );
}

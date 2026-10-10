// Flux de connexion d'un appareil à un espace (publication ou remplacement).
import * as engine from '../../backend/engine.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { collectionLabel } from './labels.js';

export const PENDING_INVITE_KEY = 'bde-pending-invite';

/** Extrait le jeton d'un lien d'invitation (ou d'un jeton collé seul). */
export function parseInviteToken(input) {
  const m = String(input || '').trim().match(/([a-f0-9]{64})/i);
  return m ? m[1].toLowerCase() : '';
}

export async function runConnectFlow(ws) {
  const info = await engine.inspectWorkspace(ws.id);
  const localTotal = info.local.reduce((n, x) => n + x.count, 0);
  if (info.remoteCount === 0) {
    const ok = await confirmDialog({
      title: `Publier mes données locales dans « ${ws.name} » ?`,
      message: 'L’espace est vide. Les données de cet appareil vont y être envoyées pour que l’équipe y ait accès (selon les droits de chacun). Les pièces jointes stockées sur l’appareil sont aussi envoyées.',
      details: info.local.length
        ? info.local.map(x => `${collectionLabel(x.collection)} : ${x.count}`)
        : ['Aucune donnée locale : l’espace démarrera vide.'],
      confirmLabel: `Publier (${localTotal} enregistrement${localTotal > 1 ? 's' : ''})`,
    });
    if (!ok) return null;
    const r = await engine.connectWorkspace(ws.id, ws.name, 'publish');
    toast.success('Données publiées', `${r.records} enregistrements envoyés${r.attachments?.total ? `, ${r.attachments.sent}/${r.attachments.total} pièces jointes` : ''}.${r.skipped?.length ? ` Non autorisé : ${r.skipped.map(collectionLabel).join(', ')}.` : ''}`);
    return r;
  }
  const ok = await confirmDialog({
    title: `Remplacer les données de cet appareil par celles de « ${ws.name} » ?`,
    message: 'L’espace contient déjà des données : elles vont remplacer celles de cet appareil. Une sauvegarde JSON de tes données actuelles est téléchargée automatiquement juste avant.',
    details: [
      `${info.remoteCount} enregistrement${info.remoteCount > 1 ? 's' : ''} dans l’espace (selon tes droits de lecture)`,
      `${localTotal} enregistrement${localTotal > 1 ? 's' : ''} actuellement sur cet appareil`,
    ],
    tone: 'warning',
    confirmLabel: 'Sauvegarder puis remplacer',
  });
  if (!ok) return null;
  const r = await engine.connectWorkspace(ws.id, ws.name, 'replace');
  toast.success('Appareil synchronisé', `${r.records} enregistrements reçus. Sauvegarde téléchargée.`);
  return r;
}

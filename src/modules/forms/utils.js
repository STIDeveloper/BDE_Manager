// Utilitaires sans composant du Studio Formulaires (dates, export, presse-papiers, partage).
import { publicLink } from './integrations.js';

export const STATUS_META = {
  draft: { label: 'Brouillon', badge: 'badge-neutral' },
  published: { label: 'Publié', badge: 'badge-emerald' },
  closed: { label: 'Fermé', badge: 'badge-amber' },
  archived: { label: 'Archivé', badge: 'badge-neutral' },
};

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  if (diff < 86400 * 7) return `il y a ${Math.round(diff / 86400)} j`;
  return formatDateTime(iso);
}

/** Télécharge un objet JSON (mention « usage interne »). */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Enveloppe d'export d'un formulaire. */
export function exportEnvelope(def) {
  return {
    format: 'bde-manager/form',
    version: 1,
    exportedAt: new Date().toISOString(),
    notice: 'Usage interne — définition de formulaire (sans réponses).',
    definition: def,
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function embedCode(def) {
  const src = `${publicLink(def.slug)}?embed=1`;
  const title = String(def.title || 'Formulaire').replace(/"/g, '&quot;');
  return `<iframe src="${src}" title="${title}" width="100%" height="720" style="border:0;max-width:760px" loading="lazy" allow="clipboard-write"></iframe>`;
}


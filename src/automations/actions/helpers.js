// Utilitaires communs aux actions d'automatisation.
import { normalizeKey } from '../../roleEngine/normalizer.js';

export const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();

export function toBool(v) {
  if (typeof v === 'boolean') return v;
  const k = normalizeKey(str(v));
  return ['oui', 'vrai', 'true', '1', 'yes', 'x', 'accepte'].includes(k);
}

export function toAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (v && typeof v === 'object' && 'amount' in v) return toAmount(v.amount);
  const s = str(v).replace(/\s|€/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Liste d'ids / de textes (tableau ou texte séparé par virgules / points-virgules). */
export function toList(v) {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  return str(v).split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
}

export const isoDay = (v) => {
  const s = str(v).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str(v));
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : '';
};

export function addDays(iso, n) {
  const base = isoDay(iso) || new Date().toISOString().slice(0, 10);
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + (Number(n) || 0)));
  return dt.toISOString().slice(0, 10);
}

export const normName = (s) => normalizeKey(str(s));

export function splitName(full) {
  const parts = str(full).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Erreur « métier » lisible (affichée telle quelle dans le journal). */
export class ActionError extends Error {}
export const fail = (msg) => { throw new ActionError(msg); };

/** Libellé d'un membre. */
export const memberName = (m) => (m ? [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'Membre' : 'Membre');

/** Id fictif d'un enregistrement « qui serait créé » pendant une simulation. */
export const SIM_ID = '__simulation__';
export const SIM_MEMBER = { id: SIM_ID, firstName: 'nouveau membre', lastName: '(simulation)' };

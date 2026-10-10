// Fonctions utilitaires partagées des composants de question.

/** Identifiants DOM dérivés d'une base. */
export function fieldIds(base) {
  return { control: `${base}-ctl`, label: `${base}-lbl`, help: `${base}-help`, error: `${base}-err` };
}

/** aria-describedby (aide + erreur) */
export function describedBy(ids, { help, error }) {
  return [help ? ids.help : null, error ? ids.error : null].filter(Boolean).join(' ') || undefined;
}

export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Options d'un sélecteur : context.members / context.events ([{ id, label, sub? }]) ou item.options. */
export function pickerOptions(item, context) {
  const src = item.type === 'member_picker' ? context?.members : context?.events;
  if (Array.isArray(src)) {
    return src.filter(Boolean).map(x => ({
      value: String(x.id ?? x.value),
      label: x.label || x.name || [x.firstName, x.lastName].filter(Boolean).join(' ') || x.title || String(x.id),
      sub: x.sub || x.role || x.date || '',
    }));
  }
  return Array.isArray(item.options) ? item.options.map(o => ({ value: String(o.value), label: o.label || String(o.value), sub: o.sub || '' })) : [];
}


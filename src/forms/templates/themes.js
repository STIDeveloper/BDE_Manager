// ============================================================
// STUDIO FORMULAIRES — thèmes prédéfinis
// ============================================================
// Les préréglages sont ceux du moteur d'affichage (src/forms/runtime/theme.js,
// THEME_PRESETS : mêmes identifiants, libellés, couleurs et fonds) : le mode
// clair / sombre de la page répondant est déduit de `preset`. Ce fichier en
// garde une copie JS pure (utilisable hors Vite par les modèles) complétée
// des réglages typographiques par défaut ; l'éditeur relit la liste du
// moteur quand elle est disponible (voir src/modules/forms/integrations.js).

const STYLE = { font: 'inter', radius: 'md', progressBar: 'bar', animations: true, density: 'comfortable' };

export const THEME_PRESETS = [
  { id: 'light', label: 'Clair', mode: 'light', accent: '#2563eb', style: STYLE },
  { id: 'dark', label: 'Sombre', mode: 'dark', accent: '#60a5fa', style: { ...STYLE, radius: 'lg', progressBar: 'steps' } },
  { id: 'auto', label: 'Automatique (réglage de l’appareil)', mode: 'auto', accent: '#2563eb', style: STYLE },
  { id: 'ocean', label: 'Océan', mode: 'light', accent: '#0e7490', background: { type: 'gradient', value: 'linear-gradient(160deg, #ecfeff 0%, #e0f2fe 100%)' }, style: { ...STYLE, font: 'system', radius: 'lg' } },
  { id: 'sunset', label: 'Coucher de soleil', mode: 'light', accent: '#c2410c', background: { type: 'gradient', value: 'linear-gradient(160deg, #fff7ed 0%, #ffe4e6 100%)' }, style: { ...STYLE, font: 'rounded', radius: 'lg' } },
  { id: 'forest', label: 'Forêt', mode: 'light', accent: '#15803d', background: { type: 'color', value: '#f0fdf4' }, style: STYLE },
  { id: 'night', label: 'Nuit violette', mode: 'dark', accent: '#a78bfa', background: { type: 'gradient', value: 'linear-gradient(160deg, #0f0a1f 0%, #1e1b4b 100%)' }, style: { ...STYLE, font: 'rounded', radius: 'full', progressBar: 'steps' } },
];

/**
 * Thème complet à partir d'un préréglage (copie indépendante).
 * `presets` : liste du moteur d'affichage si disponible (prioritaire).
 */
export function themeFromPreset(id = 'light', presets = THEME_PRESETS) {
  const p = presets.find(t => t.id === id) || THEME_PRESETS.find(t => t.id === id) || THEME_PRESETS[0];
  const local = THEME_PRESETS.find(t => t.id === p.id);
  const theme = { preset: p.id, accent: p.accent, ...JSON.parse(JSON.stringify(local?.style || STYLE)) };
  if (p.background) theme.background = JSON.parse(JSON.stringify(p.background));
  return theme;
}

// ============================================================
// STUDIO FORMULAIRES — thème de la page répondant
// ============================================================
// Transforme `definition.theme` (voir src/forms/schema.js) en variables CSS
// appliquées à la racine du rendu. Les jetons `--c-*` de l'application sont
// redéfinis localement : les classes Tailwind (bg-surface, text-ink…) et les
// composants partagés (pavé de signature) suivent donc le thème du formulaire,
// indépendamment du thème de l'application.
// Contraste : si la couleur d'accent est trop claire pour du texte blanc,
// le texte des boutons bascule automatiquement en foncé (WCAG AA).

/** Préréglages proposés à l'éditeur (theme.preset). */
export const THEME_PRESETS = [
  { id: 'light', label: 'Clair', mode: 'light', accent: '#2563eb' },
  { id: 'dark', label: 'Sombre', mode: 'dark', accent: '#60a5fa' },
  { id: 'auto', label: 'Automatique (réglage de l’appareil)', mode: 'auto', accent: '#2563eb' },
  { id: 'ocean', label: 'Océan', mode: 'light', accent: '#0e7490', background: { type: 'gradient', value: 'linear-gradient(160deg, #ecfeff 0%, #e0f2fe 100%)' } },
  { id: 'sunset', label: 'Coucher de soleil', mode: 'light', accent: '#c2410c', background: { type: 'gradient', value: 'linear-gradient(160deg, #fff7ed 0%, #ffe4e6 100%)' } },
  { id: 'forest', label: 'Forêt', mode: 'light', accent: '#15803d', background: { type: 'color', value: '#f0fdf4' } },
  { id: 'night', label: 'Nuit violette', mode: 'dark', accent: '#a78bfa', background: { type: 'gradient', value: 'linear-gradient(160deg, #0f0a1f 0%, #1e1b4b 100%)' } },
];

const PALETTES = {
  light: {
    base: [248, 249, 252], surface: [255, 255, 255], elevated: [244, 245, 249], hover: [238, 240, 246],
    line: [222, 225, 233], lineStrong: [196, 200, 212], ink: [20, 22, 32], dim: [82, 86, 104], muted: [112, 116, 134],
    danger: '#b91c1c', success: '#047857',
  },
  dark: {
    base: [12, 12, 18], surface: [22, 22, 32], elevated: [30, 30, 44], hover: [38, 38, 54],
    line: [48, 48, 66], lineStrong: [70, 70, 92], ink: [244, 244, 248], dim: [176, 176, 192], muted: [150, 150, 168],
    danger: '#f87171', success: '#34d399',
  },
};

const FONTS = {
  inter: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
  rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', system-ui, sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Menlo, Consolas, monospace",
};

const RADII = { none: ['0px', '0px'], sm: ['4px', '6px'], md: ['8px', '14px'], lg: ['12px', '20px'], full: ['999px', '24px'] };

const HEX_RX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** '#abc' / '#aabbcc' → [r, g, b] ou null. */
export function hexToRgb(hex) {
  const m = HEX_RX.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

const toHex = rgb => `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Luminance relative WCAG. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs [r,g,b]. */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Assombrit / éclaircit `rgb` jusqu'à atteindre `target` de contraste contre `bg`. */
function ensureContrast(rgb, bg, target) {
  if (contrastRatio(rgb, bg) >= target) return rgb;
  const towards = luminance(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(rgb, towards, t);
    if (contrastRatio(c, bg) >= target) return c;
  }
  return towards;
}

const SAFE_GRADIENT_RX = /^(repeating-)?(linear|radial|conic)-gradient\([#%,.()\sa-z0-9-]{1,400}\)$/i;
const SAFE_COLOR_RX = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i;

export function resolveMode(preset, systemDark) {
  const p = THEME_PRESETS.find(x => x.id === preset);
  const mode = p?.mode || (preset === 'dark' ? 'dark' : 'light');
  if (mode === 'auto') return systemDark ? 'dark' : 'light';
  return mode;
}

/**
 * Calcule le thème effectif.
 * → { mode, vars (objet style React), accent, onAccent, warnings[], background: { css?, imageRef? }, animations, density }
 */
export function resolveTheme(theme, { systemDark = false } = {}) {
  const t = theme && typeof theme === 'object' ? theme : {};
  const preset = THEME_PRESETS.find(x => x.id === t.preset) || null;
  const mode = resolveMode(t.preset, systemDark);
  const pal = PALETTES[mode];
  const warnings = [];

  const accentRgb = hexToRgb(t.accent) || hexToRgb(preset?.accent) || hexToRgb(mode === 'dark' ? '#60a5fa' : '#2563eb');
  if (t.accent && !hexToRgb(t.accent)) warnings.push('Couleur d’accent invalide : couleur par défaut utilisée.');

  // Texte posé sur l'accent (boutons, choix sélectionnés)
  const white = [255, 255, 255], dark = [17, 17, 24];
  const whiteRatio = contrastRatio(accentRgb, white);
  const onAccent = whiteRatio >= 4.5 ? white : dark;
  if (whiteRatio < 4.5) {
    warnings.push(`Couleur d’accent claire (contraste ${whiteRatio.toFixed(1)}:1 avec du blanc) : le texte des boutons passe automatiquement en foncé.`);
  }
  // Accent utilisé comme couleur de texte / bordure sur la carte
  const accentInk = ensureContrast(accentRgb, pal.surface, 4.5);
  if (contrastRatio(accentRgb, pal.surface) < 3) {
    warnings.push('La couleur d’accent ressort peu sur le fond des cartes : une nuance plus contrastée est utilisée pour les textes et contours.');
  }

  // Fond de page
  const bg = t.background && typeof t.background === 'object' ? t.background : preset?.background || null;
  const background = { css: `rgb(${pal.base.join(' ')})`, imageRef: null };
  if (bg?.type === 'color' && typeof bg.value === 'string' && SAFE_COLOR_RX.test(bg.value.trim())) {
    background.css = bg.value.trim();
    const rgb = hexToRgb(bg.value);
    if (rgb && Math.abs(luminance(rgb) - luminance(pal.base)) > 0.5) {
      warnings.push(mode === 'dark' ? 'Fond très clair avec un thème sombre : vérifie la lisibilité du titre.' : 'Fond très foncé avec un thème clair : vérifie la lisibilité du titre.');
    }
  } else if (bg?.type === 'gradient' && typeof bg.value === 'string' && SAFE_GRADIENT_RX.test(bg.value.trim())) {
    background.css = bg.value.trim();
  } else if (bg?.type === 'image' && bg.value) {
    background.imageRef = bg.value;
  } else if (bg && bg.type && bg.type !== 'color') {
    warnings.push('Fond invalide ignoré.');
  }

  const [rCtl, rCard] = RADII[t.radius] || RADII.md;
  const compact = t.density === 'compact';
  const rgb = a => a.map(Math.round).join(' ');
  const vars = {
    '--c-base': rgb(pal.base),
    '--c-surface': rgb(pal.surface),
    '--c-elevated': rgb(pal.elevated),
    '--c-hover': rgb(pal.hover),
    '--c-line': rgb(pal.line),
    '--c-line-strong': rgb(pal.lineStrong),
    '--c-ink': rgb(pal.ink),
    '--c-dim': rgb(pal.dim),
    '--c-muted': rgb(pal.muted),
    '--f-accent': toHex(accentRgb),
    '--f-accent-rgb': rgb(accentRgb),
    '--f-accent-ink': toHex(accentInk),
    '--f-on-accent': toHex(onAccent),
    '--f-danger': pal.danger,
    '--f-success': pal.success,
    '--f-font': FONTS[t.font] || FONTS.inter,
    '--f-radius': rCtl,
    '--f-radius-card': rCard,
    '--f-gap': compact ? '14px' : '22px',
    '--f-pad': compact ? '16px' : '24px',
    '--f-ctl-h': compact ? '44px' : '48px',
    colorScheme: mode,
  };
  return {
    mode,
    vars,
    accent: toHex(accentRgb),
    onAccent: toHex(onAccent),
    accentInk: toHex(accentInk),
    warnings,
    background,
    animations: t.animations !== false,
    density: compact ? 'compact' : 'comfortable',
    progressBar: ['bar', 'steps', 'none'].includes(t.progressBar) ? t.progressBar : 'bar',
  };
}

/** Avertissements d'accessibilité du thème (pour l'éditeur). */
export function themeWarnings(theme) {
  const a = resolveTheme(theme, { systemDark: false }).warnings;
  const b = theme?.preset === 'auto' ? resolveTheme(theme, { systemDark: true }).warnings : [];
  return [...new Set([...a, ...b])];
}

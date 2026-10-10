// ============================================================
// Onglet « Thème » : préréglages, couleurs, police, fond, images.
// ============================================================
import { useMemo, useState } from 'react';
import { Check, ImagePlus, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { THEME_PRESETS, themeFromPreset } from '../../../forms/templates/index.js';
import { toast } from '../../../components/ui/toastStore.js';
import { Panel, Field, Toggle, Segmented } from '../ui.jsx';
import { importPublicImage, formatKb, imageBytes } from '../image.js';
import { runtimeThemeWarnings, runtimeThemePresets } from '../integrations.js';

const PRESETS = runtimeThemePresets || THEME_PRESETS;
const STYLE_OF = id => THEME_PRESETS.find(p => p.id === id)?.style || THEME_PRESETS[0].style;

const FONTS = [
  { value: 'inter', label: 'Inter (moderne)', css: "'Inter', system-ui, sans-serif" },
  { value: 'system', label: 'Système', css: 'system-ui, sans-serif' },
  { value: 'serif', label: 'À empattements', css: "Georgia, 'Times New Roman', serif" },
  { value: 'rounded', label: 'Arrondie', css: "ui-rounded, 'Nunito', system-ui, sans-serif" },
  { value: 'mono', label: 'Machine à écrire', css: 'ui-monospace, Menlo, Consolas, monospace' },
];
const RADII = [
  { value: 'none', label: 'Droits', px: 0 }, { value: 'sm', label: 'Légers', px: 4 }, { value: 'md', label: 'Moyens', px: 10 },
  { value: 'lg', label: 'Arrondis', px: 16 }, { value: 'full', label: 'Pilules', px: 24 },
];
const HEX_RX = /^#([0-9a-f]{6})$/i;

// ── Contraste WCAG ──
function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
}
function lum(c) {
  const [r, g, b] = c.map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const ca = rgb(a), cb = rgb(b);
  if (!ca || !cb) return null;
  const la = lum(ca), lb = lum(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Dégradé « linear-gradient(angle, c1 0%, c2 100%) » → { angle, c1, c2 } ou null. */
function parseGradient(v) {
  const m = /^linear-gradient\(\s*(\d+)deg\s*,\s*(#[0-9a-f]{6})\s+0%\s*,\s*(#[0-9a-f]{6})\s+100%\s*\)$/i.exec(String(v || ''));
  return m ? { angle: Number(m[1]), c1: m[2], c2: m[3] } : null;
}
const gradient = ({ angle, c1, c2 }) => `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;

export default function ThemeTab({ def, update }) {
  const theme = def.theme || themeFromPreset('light', PRESETS);
  const set = (patch, opts = {}) => update(d => ({ ...d, theme: { ...(d.theme || {}), ...patch } }), opts);
  const bg = theme.background || { type: 'color', value: '#f5f7fb' };
  const presetMode = PRESETS.find(p => p.id === theme.preset)?.mode || 'light';
  const cardBg = presetMode === 'dark' ? '#16161f' : '#ffffff';

  const ratioWhite = contrast(theme.accent, '#ffffff');
  const ratioCard = contrast(theme.accent, cardBg);
  const warnings = useMemo(() => {
    if (runtimeThemeWarnings) { try { return runtimeThemeWarnings(theme); } catch { /* repli local */ } }
    const w = [];
    if (ratioWhite !== null && ratioWhite < 4.5) w.push(`Texte blanc sur l'accent : contraste ${ratioWhite.toFixed(1)}:1 (< 4,5:1).`);
    if (ratioCard !== null && ratioCard < 3) w.push(`Accent peu visible sur les cartes : contraste ${ratioCard.toFixed(1)}:1 (< 3:1).`);
    return w;
  }, [theme, ratioWhite, ratioCard]);

  const applyPreset = (p) => {
    const keep = { logo: theme.logo, cover: theme.cover };
    const next = themeFromPreset(p.id, PRESETS);
    update(d => ({ ...d, theme: { ...next, ...(keep.logo ? { logo: keep.logo } : {}), ...(keep.cover ? { cover: keep.cover } : {}) } }), { snapshot: `Thème « ${p.label} »` });
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Panel title="Thèmes prêts à l'emploi" description="Un point de départ soigné ; tout reste personnalisable ensuite.">
          <ul className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
            {PRESETS.map(p => {
              const on = theme.preset === p.id;
              const pbg = p.background?.value || (p.mode === 'dark' ? '#0c0c12' : '#f5f7fb');
              return (
                <li key={p.id}>
                  <button type="button" aria-pressed={on} onClick={() => applyPreset(p)} title={p.label}
                    className={`w-full text-left rounded-xl border-2 overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${on ? 'border-blue-500' : 'border-line hover:border-line-strong'}`}>
                    <span className="block h-14 relative" style={{ background: pbg }}>
                      <span className="absolute left-2 right-2 bottom-2 h-6 rounded-md flex items-center px-2 gap-1" style={{ background: p.mode === 'dark' ? '#1c1c28' : '#fff' }}>
                        <span className="h-1.5 flex-1 rounded-full" style={{ background: p.mode === 'dark' ? '#3a3a52' : '#e5e7eb' }} />
                        <span className="h-3.5 w-7 rounded" style={{ background: p.accent, borderRadius: RADII.find(r => r.value === STYLE_OF(p.id).radius)?.px }} />
                      </span>
                      {on && <Check size={14} className="absolute top-1.5 right-1.5 text-white bg-blue-600 rounded-full p-0.5" aria-hidden="true" />}
                    </span>
                    <span className="block px-2 py-1.5 text-xs font-medium text-ink bg-surface">{p.label}<span className="block text-[10px] text-muted font-normal">{p.mode === 'dark' ? 'Sombre' : p.mode === 'auto' ? 'Auto' : 'Clair'}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Couleurs et typographie">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Couleur d'accent" hint="Boutons, sélection, barre de progression.">
              {id => (
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Choisir la couleur d'accent" className="h-9 w-12 rounded border border-line bg-surface cursor-pointer" value={HEX_RX.test(theme.accent || '') ? theme.accent : '#2563eb'} onChange={e => set({ accent: e.target.value }, { coalesce: 'theme:accent' })} />
                  <input id={id} className="input font-mono text-xs" value={theme.accent || ''} onChange={e => set({ accent: e.target.value.trim() }, { coalesce: 'theme:accent' })} />
                </div>
              )}
            </Field>
            <Field label="Police">
              {id => (
                <select id={id} className="input" value={theme.font || 'inter'} onChange={e => set({ font: e.target.value }, { snapshot: 'Police' })}>
                  {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              )}
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <ContrastBadge label="Texte blanc sur l'accent" ratio={ratioWhite} min={4.5} />
            <ContrastBadge label="Accent sur les cartes" ratio={ratioCard} min={3} />
          </div>
          {warnings.length > 0 && (
            <ul className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 space-y-1">
              {warnings.map(w => <li key={w} className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{w}</li>)}
            </ul>
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium text-dim">Arrondis</p>
            <Segmented label="Arrondis" value={theme.radius || 'md'} onChange={v => set({ radius: v }, { snapshot: 'Arrondis' })} options={RADII.map(r => ({ value: r.value, label: r.label }))} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-dim">Densité</p>
              <Segmented label="Densité" value={theme.density || 'comfortable'} onChange={v => set({ density: v })} options={[{ value: 'comfortable', label: 'Aérée' }, { value: 'compact', label: 'Compacte' }]} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-dim">Progression</p>
              <Segmented label="Barre de progression" value={theme.progressBar || 'bar'} onChange={v => set({ progressBar: v })} options={[{ value: 'bar', label: 'Barre' }, { value: 'steps', label: 'Étapes' }, { value: 'none', label: 'Aucune' }]} />
            </div>
          </div>
          <Toggle label="Animations" hint="Transitions douces entre les pages (désactivées automatiquement si l'appareil demande moins d'animations)." checked={theme.animations !== false} onChange={v => set({ animations: v })} />
        </Panel>

        <Panel title="Fond de page">
          <Segmented label="Type de fond" value={bg.type} onChange={type => {
            if (type === 'color') set({ background: { type, value: '#f5f7fb' } }, { snapshot: 'Fond' });
            else if (type === 'gradient') set({ background: { type, value: gradient({ angle: 135, c1: '#eef2ff', c2: '#fdf2f8' }) } }, { snapshot: 'Fond' });
            else set({ background: { type, value: null } }, { snapshot: 'Fond' });
          }} options={[{ value: 'color', label: 'Couleur' }, { value: 'gradient', label: 'Dégradé' }, { value: 'image', label: 'Image' }]} />
          {bg.type === 'color' && (
            <div className="flex items-center gap-2">
              <input type="color" aria-label="Couleur de fond" className="h-9 w-12 rounded border border-line cursor-pointer" value={HEX_RX.test(bg.value || '') ? bg.value : '#f5f7fb'} onChange={e => set({ background: { type: 'color', value: e.target.value } }, { coalesce: 'theme:bg' })} />
              <label htmlFor="theme-bg-hex" className="sr-only">Couleur de fond (hexadécimal)</label>
              <input id="theme-bg-hex" className="input font-mono text-xs" value={bg.value || ''} onChange={e => set({ background: { type: 'color', value: e.target.value.trim() } }, { coalesce: 'theme:bg' })} />
            </div>
          )}
          {bg.type === 'gradient' && <GradientEditor value={bg.value} onChange={v => set({ background: { type: 'gradient', value: v } }, { coalesce: 'theme:grad' })} />}
          {bg.type === 'image' && <ImagePicker label="Image de fond" value={bg.value} onChange={ref => set({ background: { type: 'image', value: ref } }, { snapshot: 'Image de fond' })} />}
        </Panel>

        <Panel title="Logo et couverture" description="Affichés en haut du formulaire. Les images sont compressées (≤ 300 Ko) pour la page publique.">
          <div className="grid sm:grid-cols-2 gap-3">
            <ImagePicker label="Logo" value={theme.logo} onChange={ref => set({ logo: ref || undefined }, { snapshot: 'Logo' })} />
            <ImagePicker label="Image de couverture" value={theme.cover} onChange={ref => set({ cover: ref || undefined }, { snapshot: 'Couverture' })} />
          </div>
        </Panel>
      </div>
      <ThemeSample def={def} theme={theme} />
    </div>
  );
}

function ContrastBadge({ label, ratio, min }) {
  if (ratio === null) return <span className="badge badge-neutral">{label} : couleur invalide</span>;
  const ok = ratio >= min;
  return (
    <span className={`badge ${ok ? 'badge-emerald' : 'badge-amber'}`}>
      {ok ? <CheckCircle2 size={11} aria-hidden="true" /> : <AlertTriangle size={11} aria-hidden="true" />}
      {label} : {ratio.toFixed(1).replace('.', ',')}:1 {ok ? '' : `(min ${String(min).replace('.', ',')})`}
    </span>
  );
}

function GradientEditor({ value, onChange }) {
  const parsed = parseGradient(value);
  const [free, setFree] = useState(!parsed);
  const g = parsed || { angle: 135, c1: '#eef2ff', c2: '#fdf2f8' };
  return (
    <div className="space-y-2">
      {!free ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-dim flex flex-col gap-1">Début<input type="color" className="h-9 w-12 rounded border border-line cursor-pointer" value={g.c1} onChange={e => onChange(gradient({ ...g, c1: e.target.value }))} /></label>
          <label className="text-xs text-dim flex flex-col gap-1">Fin<input type="color" className="h-9 w-12 rounded border border-line cursor-pointer" value={g.c2} onChange={e => onChange(gradient({ ...g, c2: e.target.value }))} /></label>
          <label className="text-xs text-dim flex flex-col gap-1 flex-1 min-w-32">Angle : {g.angle}°<input type="range" min={0} max={360} step={5} value={g.angle} onChange={e => onChange(gradient({ ...g, angle: Number(e.target.value) }))} /></label>
        </div>
      ) : (
        <Field label="Dégradé CSS" hint="ex. linear-gradient(135deg, #eef2ff 0%, #fdf2f8 100%)">
          {id => <input id={id} className="input font-mono text-xs" value={value || ''} onChange={e => onChange(e.target.value)} />}
        </Field>
      )}
      <div className="h-10 rounded-lg border border-line" style={{ background: value || undefined }} aria-hidden="true" />
      <button type="button" className="text-[11px] text-blue-600 dark:text-blue-400" onClick={() => setFree(f => !f)}>{free ? 'Éditeur simple' : 'Saisir le CSS'}</button>
    </div>
  );
}

function ImagePicker({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const src = value?.dataUrl || (typeof value === 'string' ? value : null);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const ref = await importPublicImage(file);
      onChange(ref);
      toast.success(`${label} ajouté(e)`, `${formatKb(imageBytes(ref))} après compression`);
    } catch (err) {
      toast.error('Image refusée', String(err?.message || err));
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-dim">{label}</p>
      {src ? (
        <div className="relative">
          <img src={src} alt={label} className="w-full h-24 object-contain rounded-lg border border-line bg-elevated" />
          <button type="button" className="absolute top-1 right-1 btn-secondary !p-1" aria-label={`Retirer : ${label}`} onClick={() => onChange(null)}><X size={14} aria-hidden="true" /></button>
          <p className="text-[11px] text-muted mt-0.5">{formatKb(imageBytes(value))}</p>
        </div>
      ) : (
        <label className="btn-secondary w-full cursor-pointer h-24 flex-col !gap-1 border-dashed">
          <ImagePlus size={18} aria-hidden="true" />
          <span className="text-xs">{busy ? 'Compression…' : 'Choisir une image'}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label={label} onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

/** Mini-aperçu du thème (indépendant du moteur d'affichage). */
function ThemeSample({ def, theme }) {
  const preset = PRESETS.find(p => p.id === theme.preset);
  const dark = preset?.mode === 'dark';
  const bg = theme.background;
  const background = bg?.type === 'image' ? (bg.value?.dataUrl ? `center / cover no-repeat url("${bg.value.dataUrl}")` : '#ddd') : bg?.value || (dark ? '#0c0c12' : '#f5f7fb');
  const radius = RADII.find(r => r.value === theme.radius)?.px ?? 10;
  const font = FONTS.find(f => f.value === theme.font)?.css;
  const onAccent = (contrast(theme.accent, '#ffffff') ?? 5) >= 4.5 ? '#fff' : '#111';
  return (
    <div className="lg:sticky lg:top-4 space-y-2">
      <p className="text-xs font-medium text-dim">Aperçu du thème</p>
      <div className="rounded-2xl border border-line overflow-hidden p-4" style={{ background, fontFamily: font }}>
        {theme.cover?.dataUrl && <img src={theme.cover.dataUrl} alt="" className="w-full h-20 object-cover mb-3" style={{ borderRadius: radius }} />}
        <div className="p-4 space-y-3 shadow-lg" style={{ background: dark ? '#16161f' : '#fff', color: dark ? '#f4f4f8' : '#16161f', borderRadius: Math.max(radius, 8) }}>
          {theme.logo?.dataUrl && <img src={theme.logo.dataUrl} alt="" className="h-8 object-contain" />}
          {theme.progressBar !== 'none' && (
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: dark ? '#2a2a3a' : '#eceef3' }}>
              <div className="h-full w-1/3" style={{ background: theme.accent }} />
            </div>
          )}
          <p className="font-semibold">{def.title || 'Mon formulaire'}</p>
          <p className="text-xs opacity-70">Exemple de question</p>
          <div className="h-9 border text-xs flex items-center px-3 opacity-80" style={{ borderRadius: radius, borderColor: dark ? '#3a3a52' : '#d9dce5' }}>Ta réponse…</div>
          <div className="flex gap-2">
            <span className="px-3 py-1.5 text-xs border" style={{ borderRadius: radius, borderColor: theme.accent, color: dark ? '#f4f4f8' : theme.accent }}>Option A</span>
            <span className="px-3 py-1.5 text-xs border" style={{ borderRadius: radius, borderColor: dark ? '#3a3a52' : '#d9dce5' }}>Option B</span>
          </div>
          <button type="button" tabIndex={-1} className="px-4 py-2 text-sm font-semibold" style={{ background: theme.accent, color: onAccent, borderRadius: radius }}>Suivant</button>
        </div>
      </div>
      <p className="text-[11px] text-muted">Le rendu exact est visible dans l'onglet « Aperçu ».</p>
    </div>
  );
}

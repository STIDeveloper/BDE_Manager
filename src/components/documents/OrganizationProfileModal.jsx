import { useEffect, useId, useMemo, useState } from 'react';
import { Building2, Contact, Fingerprint, Gavel, Palette, PenLine, School } from 'lucide-react';
import Modal from '../Modal';
import { useStore } from '../../store';
import { useCatalog } from '../../core/useCatalog';
import { POLE_PALETTE } from '../../core/catalog';
import { DEFAULT_ORGANIZATION } from '../../documents/context';
import { confirmDialog } from '../ui/confirmStore';
import { toast } from '../ui/toastStore';
import ImageUploadField from './ImageUploadField';
import SignaturesSection from './SignaturesSection';
import { cleanProfilePatch, profileFieldWarnings } from './studioHelpers';

const SECTIONS = [
  { id: 'identity', label: 'Identité', icon: Building2 },
  { id: 'legal', label: 'Immatriculation', icon: Fingerprint },
  { id: 'contact', label: 'Coordonnées', icon: Contact },
  { id: 'school', label: 'Établissement', icon: School },
  { id: 'ag', label: 'Assemblées', icon: Gavel },
  { id: 'branding', label: 'Identité visuelle', icon: Palette },
  { id: 'signatures', label: 'Signatures', icon: PenLine },
];

/** Champ → section (ouverture ciblée depuis une alerte « profil incomplet »). */
const FIELD_SECTION = {
  name: 'identity', shortName: 'identity', legalForm: 'identity', object: 'identity',
  rna: 'legal', siren: 'legal', prefecture: 'legal', statutesDate: 'legal',
  address: 'contact', postalCode: 'contact', city: 'contact', email: 'contact', phone: 'contact', website: 'contact',
  school: 'school', membershipFee: 'school',
  agNoticeDays: 'ag', agQuorumPercent: 'ag',
  logo: 'branding', stamp: 'branding', accentColor: 'branding', footerNote: 'branding',
  signatures: 'signatures',
};

const EDITABLE_KEYS = Object.keys(FIELD_SECTION).filter(k => k !== 'signatures');

const ACCENTS = ['blue', 'indigo', 'violet', 'pink', 'red', 'orange', 'emerald', 'teal', 'cyan', 'zinc'].map(k => POLE_PALETTE[k]);

const LEGAL_FORMS = ['Association loi 1901', 'Association de droit local (Alsace-Moselle)', 'Association étudiante non déclarée'];

/**
 * Profil de l'association : en-têtes, mentions légales, identité visuelle,
 * signatures. Monté uniquement à l'ouverture (état initialisé à chaque fois).
 *
 * @param {{ onClose: ()=>void, focusField?: string|null }} props
 */
export default function OrganizationProfileModal({ onClose, focusField = null }) {
  const uid = useId();
  const organization = useStore(s => s.organization);
  const members = useStore(s => s.members);
  const updateOrganization = useStore(s => s.updateOrganization);
  const setSignature = useStore(s => s.setSignature);
  const catalog = useCatalog();

  // Valeurs figées à l'ouverture (la modale est remontée à chaque ouverture).
  const [initial] = useState(() => {
    const org = { ...DEFAULT_ORGANIZATION, ...organization };
    return Object.fromEntries(EDITABLE_KEYS.map(k => [k, org[k] ?? '']));
  });
  const [form, setForm] = useState(initial);
  const [nameError, setNameError] = useState('');

  const warnings = useMemo(() => profileFieldWarnings(form), [form]);
  const dirty = useMemo(() => EDITABLE_KEYS.some(k => String(form[k] ?? '') !== String(initial[k] ?? '')), [form, initial]);

  const fid = (key) => `${uid}-org-${key}`;
  const sid = (id) => `${uid}-sec-${id}`;

  const set = (key) => (e) => {
    const v = e?.target ? e.target.value : e;
    setForm(f => ({ ...f, [key]: v }));
    if (key === 'name') setNameError('');
  };

  // Ouverture ciblée : défile jusqu'au champ demandé et lui donne le focus
  // (après le focus initial posé par Modal).
  useEffect(() => {
    if (!focusField) return undefined;
    const t = setTimeout(() => {
      const target = document.getElementById(focusField === 'signatures' ? `${uid}-sec-signatures` : `${uid}-org-${focusField}`);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
  }, [focusField, uid]);

  const jump = (id) => {
    const el = document.getElementById(sid(id));
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Abandonner les modifications ?',
        message: 'Les changements du profil n\'ont pas été enregistrés (les signatures, elles, le sont déjà).',
        confirmLabel: 'Abandonner',
        tone: 'warning',
      });
      if (!ok) return;
    }
    onClose();
  };

  const save = (e) => {
    e?.preventDefault();
    if (!String(form.name || '').trim()) {
      setNameError('Le nom de l\'association est obligatoire.');
      jump('identity');
      setTimeout(() => document.getElementById(fid('name'))?.focus(), 50);
      return;
    }
    const res = updateOrganization(cleanProfilePatch(form));
    if (!res?.ok) { toast.error('Profil non enregistré', res?.error); return; }
    const softCount = Object.keys(warnings).length;
    toast.success('Profil enregistré', softCount ? `${softCount} point${softCount > 1 ? 's' : ''} à vérifier (format).` : 'Les prochains documents l\'utiliseront.');
    onClose();
  };

  const text = (key, label, opts = {}) => (
    <Field id={fid(key)} label={label} hint={opts.hint} warning={warnings[key]} error={key === 'name' ? nameError : ''} className={opts.className}>
      <input id={fid(key)} type={opts.type || 'text'} className={`input ${warnings[key] || (key === 'name' && nameError) ? 'border-amber-500/70' : ''}`}
        value={form[key] ?? ''} onChange={set(key)} placeholder={opts.placeholder} inputMode={opts.inputMode}
        autoComplete="off" list={opts.list} min={opts.min} max={opts.max}
        aria-invalid={key === 'name' && nameError ? true : undefined}
        aria-describedby={[opts.hint ? `${fid(key)}-hint` : null, warnings[key] ? `${fid(key)}-warn` : null].filter(Boolean).join(' ') || undefined} />
    </Field>
  );

  return (
    <Modal
      isOpen
      onClose={requestClose}
      title="Profil de l'association"
      description="Utilisé dans les en-têtes, mentions légales et signatures de tous les documents."
      maxWidth="max-w-3xl"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
          <p className="text-xs text-dim sm:mr-auto" aria-live="polite">{dirty ? 'Modifications non enregistrées' : 'Aucune modification'}</p>
          <button type="button" className="btn-secondary" onClick={requestClose}>Annuler</button>
          <button type="submit" form={`${uid}-form`} className="btn-primary" disabled={!dirty}>Enregistrer le profil</button>
        </div>
      )}
    >
      <nav aria-label="Sections du profil" className="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 px-4 py-2 bg-surface/95 backdrop-blur border-b border-line flex gap-1 overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.id} type="button" onClick={() => jump(s.id)} className="chip chip-idle shrink-0">
            <s.icon size={12} aria-hidden="true" /> {s.label}
          </button>
        ))}
      </nav>

      <form id={`${uid}-form`} onSubmit={save} noValidate className="space-y-6">
        <Section id={sid('identity')} title="Identité" icon={Building2}>
          <div className="grid sm:grid-cols-[2fr_1fr] gap-3">
            {text('name', 'Nom de l\'association *', { placeholder: 'Bureau des Étudiants de l\'IUT…' })}
            {text('shortName', 'Sigle', { placeholder: 'BDE', hint: 'Préfixe des numéros (ex. BDE-2026-0001).' })}
          </div>
          <datalist id={`${uid}-forms`}>{LEGAL_FORMS.map(f => <option key={f} value={f} />)}</datalist>
          {text('legalForm', 'Forme juridique', { list: `${uid}-forms` })}
          <Field id={fid('object')} label="Objet statutaire" hint="Tel que rédigé dans les statuts (article « Objet »).">
            <textarea id={fid('object')} className="input min-h-[80px]" value={form.object ?? ''} onChange={set('object')}
              placeholder="Favoriser la vie étudiante, organiser des événements…" aria-describedby={`${fid('object')}-hint`} />
          </Field>
        </Section>

        <Section id={sid('legal')} title="Immatriculation" icon={Fingerprint}>
          <div className="grid sm:grid-cols-2 gap-3">
            {text('rna', 'Numéro RNA', { placeholder: 'W751234567', hint: 'W + 9 chiffres, sur le récépissé de déclaration.' })}
            {text('siren', 'SIREN', { placeholder: '123 456 789', inputMode: 'numeric', hint: 'Facultatif (subventions, facturation).' })}
            {text('prefecture', 'Préfecture de déclaration', { placeholder: 'Préfecture de la Seine-Saint-Denis' })}
            {text('statutesDate', 'Date des statuts en vigueur', { type: 'date' })}
          </div>
        </Section>

        <Section id={sid('contact')} title="Coordonnées du siège" icon={Contact}>
          {text('address', 'Adresse', { placeholder: '140 rue de la Nouvelle France' })}
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            {text('postalCode', 'Code postal', { inputMode: 'numeric', placeholder: '93100' })}
            {text('city', 'Ville', { placeholder: 'Montreuil' })}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {text('email', 'Email', { type: 'email', inputMode: 'email', placeholder: 'bde@iut.fr' })}
            {text('phone', 'Téléphone', { type: 'tel', inputMode: 'tel' })}
          </div>
          {text('website', 'Site web', { type: 'url', inputMode: 'url', placeholder: 'https://bde.example.fr' })}
        </Section>

        <Section id={sid('school')} title="Établissement & cotisation" icon={School}>
          <div className="grid sm:grid-cols-[2fr_1fr] gap-3">
            {text('school', 'Établissement de rattachement', { placeholder: 'IUT de Montreuil — Université Paris 8' })}
            {text('membershipFee', 'Cotisation annuelle', { placeholder: '5 €', hint: 'Montant ou texte libre.' })}
          </div>
        </Section>

        <Section id={sid('ag')} title="Assemblées générales" icon={Gavel}>
          <p className="text-xs text-dim -mt-1">À reprendre de tes statuts : ces règles servent aux contrôles des convocations et procès-verbaux.</p>
          <div className="grid grid-cols-2 gap-3">
            {text('agNoticeDays', 'Délai de convocation (jours)', { type: 'number', min: 0, max: 365, inputMode: 'numeric' })}
            {text('agQuorumPercent', 'Quorum (% des membres)', { type: 'number', min: 0, max: 100, inputMode: 'numeric' })}
          </div>
        </Section>

        <Section id={sid('branding')} title="Identité visuelle" icon={Palette}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div id={fid('logo')} tabIndex={-1} className="focus:outline-none">
              <ImageUploadField id={`${fid('logo')}-file`} label="Logo" value={form.logo || null} onChange={set('logo')}
                hint="Affiché en en-tête. Redimensionné à 600 px." />
            </div>
            <div id={fid('stamp')} tabIndex={-1} className="focus:outline-none">
              <ImageUploadField id={`${fid('stamp')}-file`} label="Tampon / cachet" value={form.stamp || null} onChange={set('stamp')}
                hint="Apposé près de la signature du président." />
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink mb-1">Couleur d'accent</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Couleur d'accent">
              {ACCENTS.map(c => (
                <button key={c} type="button" onClick={() => set('accentColor')(c)} aria-pressed={form.accentColor === c} aria-label={`Couleur ${c}`}
                  className={`tap h-7 w-7 rounded-full border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${form.accentColor === c ? 'border-ink' : 'border-transparent'}`}>
                  <span className="block h-5 w-5 m-auto rounded-full" style={{ backgroundColor: c }} />
                </button>
              ))}
              <label htmlFor={fid('accentColor')} className="inline-flex items-center gap-2 text-xs text-dim ml-1">
                Personnalisée
                <input id={fid('accentColor')} type="color" value={/^#[0-9a-f]{6}$/i.test(form.accentColor) ? form.accentColor : '#4f81f5'}
                  onChange={set('accentColor')} className="h-7 w-10 rounded border border-line bg-surface cursor-pointer" />
              </label>
            </div>
          </div>
          {text('footerNote', 'Mention de pied de page', { placeholder: 'Association étudiante — ne pas jeter sur la voie publique', hint: 'Facultatif, sur chaque page.' })}
          <LetterheadPreview form={form} />
        </Section>

        <Section id={sid('signatures')} title="Signatures" icon={PenLine}>
          <SignaturesSection members={members} catalog={catalog} signatures={organization.signatures || {}} setSignature={setSignature} />
        </Section>
      </form>
    </Modal>
  );
}

function Section({ id, title, icon: I, children }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-h`} className="scroll-mt-14 space-y-3 focus:outline-none">
      <h4 id={`${id}-h`} className="flex items-center gap-2 text-sm font-bold text-ink">
        <span className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 grid place-items-center" aria-hidden="true"><I size={14} /></span>
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({ id, label, hint, warning, error, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-semibold text-ink mb-1">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-[11px] text-dim mt-1">{hint}</p>}
      {warning && <p id={`${id}-warn`} className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{warning}</p>}
      {error && <p className="text-[11px] text-red-500 mt-1" role="alert">{error}</p>}
    </div>
  );
}

/** Aperçu miniature de l'en-tête des documents (papier, toujours clair). */
function LetterheadPreview({ form }) {
  const accent = /^#[0-9a-f]{6}$/i.test(form.accentColor) ? form.accentColor : '#4f81f5';
  const addr = [form.address, [form.postalCode, form.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-dim mb-1.5">Aperçu de l'en-tête</p>
      <div className="rounded-lg bg-white text-slate-800 border border-black/10 p-4 shadow-sm" aria-hidden="true">
        <div className="flex items-center gap-3 pb-2.5 border-b-2" style={{ borderColor: accent }}>
          {form.logo ? <img src={form.logo} alt="" className="h-10 w-auto max-w-[90px] object-contain" />
            : <span className="h-10 w-10 rounded-lg grid place-items-center text-white text-xs font-bold" style={{ backgroundColor: accent }}>{(form.shortName || 'BDE').slice(0, 4)}</span>}
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: accent }}>{form.name || 'Nom de l\'association'}</p>
            <p className="text-[10px] text-slate-500 truncate">{[form.legalForm, form.rna && `RNA ${form.rna}`].filter(Boolean).join(' · ')}</p>
            <p className="text-[10px] text-slate-500 truncate">{[addr, form.email].filter(Boolean).join(' · ') || 'Adresse · email'}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 w-3/4 rounded bg-slate-200" />
          <div className="h-1.5 w-full rounded bg-slate-100" />
          <div className="h-1.5 w-5/6 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

import { useId, useMemo, useState } from 'react';
import { ChevronDown, FileText, Plus } from 'lucide-react';
import Modal from './Modal';
import { useStore } from '../store';
import { useCatalog } from '../core/useCatalog';
import { toast } from './ui/toastStore';
import {
  buildRoleOptions, validateMemberForm, toMemberPayload, memberDisplayName,
  MEMBER_ADMIN_FIELDS, adminFormValues, adminFilledCount,
} from './members/memberHelpers';

const inputCls = (invalid) =>
  `w-full bg-elevated border rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-blue-500 ${
    invalid ? 'border-red-500' : 'border-line'
  }`;
const labelCls = 'text-xs text-dim uppercase font-semibold mb-1 block';

/**
 * Fenêtre d'ajout / modification d'un membre.
 * Le formulaire est un composant enfant monté à l'ouverture (Modal ne rend
 * rien quand elle est fermée) et ré-initialisé par `key` quand le membre
 * change : aucune ré-initialisation quand d'autres données du store bougent.
 */
export default function MemberFormModal({ isOpen, onClose, member, defaultColumnId }) {
  const formId = useId();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={member ? 'Modifier le membre' : 'Ajouter un membre'}
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line">
            Annuler
          </button>
          <button type="submit" form={formId}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors">
            {member ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      }
    >
      <MemberForm
        key={member?.id || `new:${defaultColumnId || ''}`}
        formId={formId}
        member={member}
        defaultColumnId={defaultColumnId}
        onDone={onClose}
      />
    </Modal>
  );
}

function MemberForm({ formId, member, defaultColumnId, onDone }) {
  const columns = useStore(s => s.columns);
  const availableBadges = useStore(s => s.availableBadges);
  const addMember = useStore(s => s.addMember);
  const updateMember = useStore(s => s.updateMember);
  const addBadge = useStore(s => s.addBadge);
  const catalog = useCatalog();

  // Initialisation UNE fois au montage (voir `key` dans le parent).
  const [form, setForm] = useState(() => ({
    firstName: member?.firstName || '',
    lastName: member?.lastName || '',
    email: member?.email || '',
    mainRole: member?.mainRole || '',
    badges: Array.isArray(member?.badges) ? member.badges : [],
    columnId: member?.columnId || defaultColumnId || columns[0]?.id || '',
    notes: member?.notes || '',
    ...adminFormValues(member),
  }));
  // Section administrative ouverte d'office si le membre a déjà des infos.
  const [adminOpen, setAdminOpen] = useState(() => adminFilledCount(adminFormValues(member)) > 0);
  // Rôle d'origine : un ancien texte libre hors catalogue reste sélectionnable.
  const [initialRole] = useState(() => member?.mainRole || '');
  const [errors, setErrors] = useState({});
  const [newBadge, setNewBadge] = useState('');

  const { groups, legacy } = useMemo(
    () => buildRoleOptions(catalog, initialRole),
    [catalog, initialRole]
  );

  const ids = {
    firstName: `${formId}-first`, lastName: `${formId}-last`, email: `${formId}-email`,
    role: `${formId}-role`, column: `${formId}-col`, notes: `${formId}-notes`,
    badges: `${formId}-badges`, newBadge: `${formId}-newbadge`,
  };

  const set = (field) => (e) => {
    const value = e.target.value;
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  const toggleBadge = (badge) => {
    setForm(f => ({
      ...f,
      badges: f.badges.includes(badge) ? f.badges.filter(b => b !== badge) : [...f.badges, badge],
    }));
  };

  const handleAddCustomBadge = () => {
    const b = newBadge.trim();
    if (!b) return;
    if (!availableBadges.includes(b)) addBadge(b);
    setForm(f => (f.badges.includes(b) ? f : { ...f, badges: [...f.badges, b] }));
    setNewBadge('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validateMemberForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const adminErr = MEMBER_ADMIN_FIELDS.find(f => errs[f.key]);
      if (!errs.firstName && !errs.email && adminErr) {
        setAdminOpen(true);
        setTimeout(() => document.getElementById(`${formId}-adm-${adminErr.key}`)?.focus(), 0);
        return;
      }
      const first = errs.firstName ? ids.firstName : ids.email;
      document.getElementById(first)?.focus();
      return;
    }
    const payload = toMemberPayload(form, member);
    if (member) {
      updateMember(member.id, payload);
      toast.success('Membre modifié', memberDisplayName(payload));
    } else {
      addMember(payload);
      toast.success('Membre ajouté', memberDisplayName(payload));
    }
    onDone();
  };

  // Badges du membre absents de la liste globale (ex. backup importé).
  const badgeChoices = useMemo(
    () => [...availableBadges, ...form.badges.filter(b => !availableBadges.includes(b))],
    [availableBadges, form.badges]
  );

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={ids.firstName} className={labelCls}>Prénom *</label>
          <input id={ids.firstName} type="text" value={form.firstName} onChange={set('firstName')}
            className={inputCls(errors.firstName)} placeholder="Elif" required data-autofocus
            autoComplete="off"
            aria-invalid={!!errors.firstName}
            aria-describedby={errors.firstName ? `${ids.firstName}-err` : undefined} />
          {errors.firstName && <p id={`${ids.firstName}-err`} className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
        </div>
        <div>
          <label htmlFor={ids.lastName} className={labelCls}>Nom / Groupe</label>
          <input id={ids.lastName} type="text" value={form.lastName} onChange={set('lastName')}
            className={inputCls(false)} placeholder="BDE QLIO" autoComplete="off" />
        </div>
      </div>

      <div>
        <label htmlFor={ids.email} className={labelCls}>
          Email Google <span className="text-dim normal-case font-normal">(pour le partage Drive)</span>
        </label>
        <input id={ids.email} type="email" inputMode="email" value={form.email} onChange={set('email')}
          className={inputCls(errors.email)} placeholder="prenom.nom@gmail.com" autoComplete="off"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${ids.email}-err` : undefined} />
        {errors.email && <p id={`${ids.email}-err`} className="text-xs text-red-500 mt-1">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor={ids.role} className={labelCls}>Rôle principal</label>
        <select id={ids.role} value={form.mainRole} onChange={set('mainRole')} className={inputCls(false)}
          aria-describedby={member?.legacyMainRole ? `${ids.role}-hint` : undefined}>
          <option value="">— Aucun rôle —</option>
          {legacy && (
            <option value={legacy}>Ancien rôle : {legacy} (hors catalogue)</option>
          )}
          {groups.map(g => (
            <optgroup key={g.pole.id} label={g.pole.label}>
              {g.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </optgroup>
          ))}
        </select>
        {member?.legacyMainRole && (
          <p id={`${ids.role}-hint`} className="text-xs text-dim mt-1">
            Ancien libellé avant migration : « {member.legacyMainRole} »
          </p>
        )}
        {legacy && form.mainRole === legacy && (
          <p className="text-xs text-amber-500 mt-1">
            Ce rôle n'existe pas dans le catalogue : choisis un rôle de la liste pour qu'il soit
            pris en compte (presets Drive, organigramme, moteur).
          </p>
        )}
      </div>

      <div>
        <label htmlFor={ids.column} className={labelCls}>Colonne / Pôle</label>
        <select id={ids.column} value={form.columnId} onChange={set('columnId')} className={inputCls(false)}>
          {columns.map(col => <option key={col.id} value={col.id}>{col.title}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor={ids.notes} className={labelCls}>Notes privées</label>
        <textarea id={ids.notes} value={form.notes} onChange={set('notes')}
          className={`${inputCls(false)} min-h-[70px] text-sm`} placeholder="Infos diverses, contexte, historique..." />
      </div>

      <AdminSection formId={formId} form={form} set={set} errors={errors} open={adminOpen} onToggle={() => setAdminOpen(o => !o)} />

      <fieldset>
        <legend id={ids.badges} className={`${labelCls} mb-2`}>Badges</legend>
        <div className="flex flex-wrap gap-2 mb-3 max-h-40 overflow-y-auto p-1">
          {badgeChoices.map(badge => {
            const active = form.badges.includes(badge);
            return (
              <button type="button" key={badge} onClick={() => toggleBadge(badge)}
                aria-pressed={active}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                  active
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-elevated border-line text-dim hover:border-dim'
                }`}>
                {badge}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <label htmlFor={ids.newBadge} className="sr-only">Nouveau badge</label>
          <input id={ids.newBadge} type="text" value={newBadge} onChange={(e) => setNewBadge(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomBadge(); } }}
            placeholder="Créer un nouveau badge..."
            className="flex-1 min-w-0 bg-elevated border border-line rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-blue-500" />
          <button type="button" onClick={handleAddCustomBadge} disabled={!newBadge.trim()}
            aria-label="Ajouter ce badge"
            className="bg-elevated hover:bg-line text-ink px-3 rounded-lg transition-colors border border-line disabled:opacity-40">
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/** Section repliable « Informations administratives (optionnel) ». */
function AdminSection({ formId, form, set, errors, open, onToggle }) {
  const regionId = `${formId}-admin`;
  const filled = adminFilledCount(form);
  const hasError = MEMBER_ADMIN_FIELDS.some(f => errors[f.key]);
  return (
    <div className={`rounded-xl border ${hasError ? 'border-red-500/60' : 'border-line'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={regionId}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
        <FileText size={15} className="text-dim shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-ink">Informations administratives <span className="font-normal text-dim">(optionnel)</span></span>
        {filled > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-300">{filled} renseigné{filled > 1 ? 's' : ''}</span>}
        <ChevronDown size={16} className={`ml-auto text-dim transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={regionId} className="px-3 pb-3 space-y-3">
          <p className="text-xs text-dim">
            Utilisées uniquement pour générer les documents (attestations, listes officielles). Laisse vide si inutile.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MEMBER_ADMIN_FIELDS.map(f => {
              const id = `${formId}-adm-${f.key}`;
              const err = errors[f.key];
              return (
                <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                  <label htmlFor={id} className={labelCls}>{f.label}</label>
                  {f.type === 'consent' ? (
                    <select id={id} value={form[f.key]} onChange={set(f.key)} className={inputCls(false)}>
                      <option value="">Non renseigné</option>
                      <option value="oui">Oui — autorise l'utilisation de son image</option>
                      <option value="non">Non — refuse</option>
                    </select>
                  ) : (
                    <input id={id} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                      inputMode={f.type === 'number' ? 'decimal' : f.inputMode} min={f.type === 'number' ? 0 : undefined}
                      step={f.type === 'number' ? '0.01' : undefined}
                      value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder} autoComplete="off"
                      className={inputCls(err)} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} />
                  )}
                  {err && <p id={`${id}-err`} className="text-xs text-red-500 mt-1">{err}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

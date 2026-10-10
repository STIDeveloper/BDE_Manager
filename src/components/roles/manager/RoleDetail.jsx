// Détail d'un rôle : édition sur place + tout ce qui l'utilise.
import { useId, useMemo } from 'react';
import {
  ArrowLeft, Copy, FolderLock, Trash2, UserCheck, Users, Vote, X, Info,
} from 'lucide-react';
import { useStore } from '../../../store.js';
import { CATALOG_LIMITS } from '../../../core/catalog.js';
import { toast } from '../../ui/toastStore';
import { memberDisplayName, plural, usageOf } from './helpers.js';
import { DRIVE_LEVELS, inputCls, labelCls } from './constants.js';
import { AliasEditor, InlineNumber, InlineText } from './fields.jsx';
import { DetailSection, IconButton, LevelBadge, PoleDot, RoleFlags } from './ui.jsx';

const update = (roleId, patch) => useStore.getState().updateRole(roleId, patch);

/** Mise à jour immédiate (select, case à cocher) : erreur éventuelle en toast. */
function updateNow(roleId, patch) {
  const res = update(roleId, patch);
  if (!res.ok) toast.error(res.error);
  return res;
}

function DriveSection({ roleId, usage }) {
  const folders = useStore(s => s.folders);
  const preset = useStore(s => s.rolePresets[roleId]);
  const stats = usageOf.preset(usage, roleId);
  const entries = useMemo(() => (
    preset ? folders.filter(f => preset[f.id] && preset[f.id] !== 'none').map(f => ({ folder: f, level: preset[f.id] })) : []
  ), [folders, preset]);

  return (
    <DetailSection title="Permissions Drive associées" icon={FolderLock}>
      {!stats || stats.total === 0 ? (
        <p className="text-sm text-dim">
          Aucun preset. Tu peux en créer un dans l'onglet <strong className="text-ink">Drive</strong>, bouton <strong className="text-ink">Presets</strong> :
          il servira de modèle de permissions pour les membres ayant ce rôle.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {DRIVE_LEVELS.map(l => (
              <span key={l.id} className={`badge ${l.cls}`}>{l.label} : {stats[l.id]}</span>
            ))}
          </div>
          <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {entries.map(({ folder, level }) => {
              const l = DRIVE_LEVELS.find(x => x.id === level);
              return (
                <li key={folder.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-[10px] text-dim w-12 shrink-0">{folder.code}</span>
                  <span className="flex-1 min-w-0 truncate text-ink" title={folder.name}>{folder.name}</span>
                  {l && <span className={`badge ${l.cls}`} title={l.label}>{l.label}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </DetailSection>
  );
}

function CandidatesSection({ roleId, usage }) {
  const choices = usageOf.choices(usage, roleId);
  return (
    <DetailSection title="Candidats intéressés" icon={Vote}>
      {usage.candidateCount === 0 ? (
        <p className="text-sm text-dim">Aucun CSV importé. Importe les réponses du Google Form dans <strong className="text-ink">Moteur de rôles › Import CSV</strong>.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {['1er choix', '2e choix', '3e choix'].map((label, i) => (
              <div key={label} className="bg-elevated rounded-lg py-2">
                <dt className="text-[11px] text-dim">{label}</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">{choices.ranks[i]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-dim mt-2">
            {plural(choices.total, 'candidat sur', 'candidats sur')} {usage.candidateCount} l'ont dans leurs vœux.
          </p>
        </>
      )}
    </DetailSection>
  );
}

function MembersSection({ role, usage }) {
  const members = usageOf.members(usage, role.id);
  const over = members.length > role.capacity;
  return (
    <DetailSection
      title="Membres actuels" icon={Users}
      aside={<span className={`text-xs tabular-nums ${over ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-dim'}`}>{members.length} / {plural(role.capacity, 'place', 'places')}</span>}
    >
      {members.length === 0 ? (
        <p className="text-sm text-dim">Aucun membre n'occupe ce rôle.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {members.map(m => (
            <li key={m.id} className="px-2 py-1 rounded-lg bg-elevated border border-line text-xs text-ink">{memberDisplayName(m)}</li>
          ))}
        </ul>
      )}
      {over && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Plus de membres que de places : augmente la capacité ou réaffecte quelqu'un.</p>}
    </DetailSection>
  );
}

function AssignmentSection({ role, usage }) {
  const asg = usageOf.assignment(usage, role.id);
  return (
    <DetailSection title="Affectation actuelle" icon={UserCheck}>
      {!usage.hasScenario ? (
        <p className="text-sm text-dim">Aucun scénario calculé pour l'instant (le moteur a besoin d'un CSV importé).</p>
      ) : (
        <>
          <p className="text-xs text-dim mb-2">Scénario : <span className="text-ink font-medium">{usage.scenarioName}</span></p>
          {asg.assigned.length === 0 && asg.vacant === 0 && (
            <p className="text-sm text-dim">Ce rôle n'a pas de place dans ce scénario (capacité 0 ou rôle ajouté depuis le calcul).</p>
          )}
          {asg.assigned.length > 0 && (
            <ul className="space-y-1">
              {asg.assigned.map(a => (
                <li key={a.slotId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink truncate">{a.name}</span>
                  {Number.isFinite(a.score) && <span className="text-xs text-dim tabular-nums">score {Math.round(a.score)}</span>}
                </li>
              ))}
            </ul>
          )}
          {asg.vacant > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{plural(asg.vacant, 'place vacante', 'places vacantes')}</p>
          )}
        </>
      )}
    </DetailSection>
  );
}

/**
 * @param {{role:object, catalog:object, usage:object, onDuplicate:(role:object)=>void, onDelete:(role:object)=>void, onClose?:()=>void, closeMode?:'back'|'close'}} props
 */
export default function RoleDetail({ role, catalog, usage, onDuplicate, onDelete, onClose, closeMode = 'close', titleId }) {
  const { poles, levels, roles, poleList, levelList } = catalog;
  const pole = poles[role.pole];
  const level = levels[role.level];
  const uid = useId();
  const id = (k) => `${uid}-${k}`;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-start gap-2 px-3 py-2.5 border-b border-line shrink-0">
        {onClose && closeMode === 'back' && (
          <IconButton label="Retour à la liste des rôles" onClick={onClose}><ArrowLeft size={16} aria-hidden="true" /></IconButton>
        )}
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] text-dim">
            {pole && <PoleDot color={pole.color} size={8} />}
            {pole ? `${pole.emoji} ${pole.label}` : 'Pôle inconnu'}
          </p>
          <h3 id={titleId} className="text-base font-semibold text-ink truncate">{role.label}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <LevelBadge level={level} />
            <RoleFlags role={role} />
          </div>
        </div>
        <IconButton label={`Dupliquer ${role.label}`} onClick={() => onDuplicate(role)}><Copy size={15} aria-hidden="true" /></IconButton>
        <IconButton label={`Supprimer ${role.label}`} tone="danger" onClick={() => onDelete(role)}><Trash2 size={15} aria-hidden="true" /></IconButton>
        {onClose && closeMode === 'close' && (
          <IconButton label="Fermer le détail" onClick={onClose}><X size={16} aria-hidden="true" /></IconButton>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <DetailSection title="Paramètres" icon={Info}>
          <p className="text-[11px] text-dim mb-3">Chaque champ s'enregistre quand tu le quittes (ou avec Entrée). Échap annule la saisie.</p>
          <div className="space-y-3">
            <div>
              <label htmlFor={id('label')} className={labelCls}>Nom affiché</label>
              <InlineText id={id('label')} value={role.label} maxLength={CATALOG_LIMITS.maxLabel} onCommit={(label) => update(role.id, { label })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={id('pole')} className={labelCls}>Pôle</label>
                <select id={id('pole')} value={role.pole} onChange={(e) => updateNow(role.id, { pole: e.target.value })} className={inputCls}>
                  {poleList.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={id('level')} className={labelCls}>Niveau</label>
                <select id={id('level')} value={role.level} onChange={(e) => updateNow(role.id, { level: e.target.value })} className={inputCls}>
                  {levelList.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor={id('cap')} className={labelCls}>Capacité (places)</label>
              <InlineNumber id={id('cap')} value={role.capacity} min={0} max={CATALOG_LIMITS.maxCapacity} onCommit={(capacity) => update(role.id, { capacity })} className="max-w-[8rem]" />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-line cursor-pointer min-h-[44px]">
                <input type="checkbox" checked={!!role.leadership} onChange={(e) => updateNow(role.id, { leadership: e.target.checked })} className="mt-0.5 w-4 h-4 accent-blue-600" />
                <span className="text-sm text-ink">⭐ Leadership<span className="block text-xs text-dim">Encadre une équipe ou un projet.</span></span>
              </label>
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-line cursor-pointer min-h-[44px]">
                <input type="checkbox" checked={!!role.essential} onChange={(e) => updateNow(role.id, { essential: e.target.checked })} className="mt-0.5 w-4 h-4 accent-blue-600" />
                <span className="text-sm text-ink">🔒 Essentiel<span className="block text-xs text-dim">Poste indispensable, à pourvoir en priorité.</span></span>
              </label>
            </div>
            <div>
              <label htmlFor={id('alias')} className={labelCls}>Alias pour l'import CSV</label>
              <AliasEditor
                id={id('alias')} value={role.aliases || []} roles={roles} roleId={role.id} describedBy={id('aliasHelp')}
                onChange={(aliases) => update(role.id, { aliases })}
              />
              <p id={id('aliasHelp')} className="text-xs text-dim mt-1">
                Autres noms écrits par les candidats dans le Google Form (ex. « Prez », « Respo com »). Ils servent à reconnaître ce rôle à l'import CSV.
              </p>
            </div>
            <p className="text-[11px] text-dim">
              Identifiant technique : <code className="font-mono text-ink bg-elevated px-1 py-0.5 rounded">{role.id}</code> — ne change jamais
              (les presets Drive, les membres et les contraintes restent liés même si tu renommes le rôle).
            </p>
          </div>
        </DetailSection>

        <MembersSection role={role} usage={usage} />
        <AssignmentSection role={role} usage={usage} />
        <CandidatesSection roleId={role.id} usage={usage} />
        <DriveSection roleId={role.id} usage={usage} />
      </div>
    </div>
  );
}

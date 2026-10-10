// Hook React : contexte de génération à jour (store principal + moteur + coffre).
import { useMemo } from 'react';
import { useStore } from '../store.js';
import { useRolesStore } from '../roleEngine/store.js';
import { buildContext } from './context.js';

export function useDocumentContext() {
  const members = useStore(s => s.members);
  const columns = useStore(s => s.columns);
  const poles = useStore(s => s.poles);
  const levels = useStore(s => s.levels);
  const roles = useStore(s => s.roles);
  const folders = useStore(s => s.folders);
  const rolePresets = useStore(s => s.rolePresets);
  const drivePermissions = useStore(s => s.drivePermissions);
  const organization = useStore(s => s.organization);
  const documentLog = useStore(s => s.documentLog);
  const vaultEntries = useStore(s => s.vaultEntries);
  const vaultUnlocked = useStore(s => !!s._vaultKey);
  const candidates = useRolesStore(s => s.candidates);
  const scenario = useRolesStore(s => s.scenarios[s.selectedScenarioIndex] || null);

  return useMemo(() => buildContext(
    { members, columns, poles, levels, roles, folders, rolePresets, drivePermissions, organization, documentLog },
    {
      candidates,
      scenario,
      // Seuls les LIBELLÉS des entrées du coffre sont exposés, jamais les valeurs.
      vaultEntryLabels: vaultUnlocked ? vaultEntries.map(e => e.label).filter(Boolean) : null,
    },
  ), [members, columns, poles, levels, roles, folders, rolePresets, drivePermissions, organization, documentLog, vaultEntries, vaultUnlocked, candidates, scenario]);
}

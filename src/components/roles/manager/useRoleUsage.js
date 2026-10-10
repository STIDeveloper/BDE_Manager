// Statistiques d'usage des rôles (membres, presets Drive, candidats, moteur).
// Sélecteurs ATOMIQUES (Zustand v5) + dérivation via useMemo.
import { useMemo } from 'react';
import { useStore } from '../../../store.js';
import { useRolesStore } from '../../../roleEngine/store.js';
import { computeUsage } from './helpers.js';

/** @returns {ReturnType<typeof computeUsage>} */
export function useRoleUsage() {
  const members = useStore(s => s.members);
  const rolePresets = useStore(s => s.rolePresets);
  const candidates = useRolesStore(s => s.candidates);
  const constraints = useRolesStore(s => s.constraints);
  const scenarios = useRolesStore(s => s.scenarios);
  const selectedScenarioIndex = useRolesStore(s => s.selectedScenarioIndex);

  const scenario = scenarios[selectedScenarioIndex] || null;

  return useMemo(
    () => computeUsage({ members, rolePresets, candidates, constraints, scenario }),
    [members, rolePresets, candidates, constraints, scenario],
  );
}

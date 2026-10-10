// ============================================================
// TABLEAU DE BORD — lecture des modules facultatifs
// ============================================================
// Trésorerie et adhésions sont lues SANS dépendance d'ordre : si un module
// est absent, un store vide le remplace et le tableau de bord se dégrade
// proprement (cartes « module non installé »).

import { create } from 'zustand';

const financeMods = import.meta.glob('../finance/store.js', { eager: true });
const membershipMods = import.meta.glob('../membership/store.js', { eager: true });

const pick = (mods, name) => {
  for (const mod of Object.values(mods)) {
    const hook = mod?.[name];
    if (typeof hook === 'function' && typeof hook.getState === 'function') return hook;
  }
  return null;
};

// Store vide de repli : les hooks sont toujours appelés (règles des hooks).
const useEmpty = create(() => ({}));
export const useFinanceSource = pick(financeMods, 'useFinanceStore') || useEmpty;
export const useMembershipSource = pick(membershipMods, 'useMembershipStore') || useEmpty;
export const hasFinance = useFinanceSource !== useEmpty;
export const hasMembership = useMembershipSource !== useEmpty;

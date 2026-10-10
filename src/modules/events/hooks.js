import { useMemo } from 'react';
import { useStore } from '../../store.js';
import { isPlaceholderMember } from '../../documents/context.js';

export const memberLabel = (m) => (m ? `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Sans nom' : 'Membre supprimé');

/** Membres réels (sans fiches « poste vacant »), triés, + index par id. */
export function useMembers() {
  const raw = useStore(s => s.members);
  return useMemo(() => {
    const list = (raw || []).filter(m => !isPlaceholderMember(m))
      .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), 'fr'));
    const byId = new Map(list.map(m => [m.id, m]));
    return { list, byId, name: (id) => memberLabel(byId.get(id)) };
  }, [raw]);
}

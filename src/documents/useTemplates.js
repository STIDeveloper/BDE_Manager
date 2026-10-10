// Hook React : modèles intégrés + personnalisés, mis à jour en direct.
import { useSyncExternalStore } from 'react';
import { getAllTemplates, subscribeTemplates } from './registry.js';

export function useTemplates() {
  return useSyncExternalStore(subscribeTemplates, getAllTemplates, getAllTemplates);
}

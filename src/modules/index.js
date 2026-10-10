// Charge (de façon anticipée) les stores de TOUS les modules présents dans
// src/modules/<module>/store.js : ils s'enregistrent alors dans le registre
// (sauvegarde + synchronisation), même si leur écran n'a jamais été ouvert.
// Les écrans (Page.jsx) restent chargés à la demande (voir App.jsx).
const stores = import.meta.glob('./*/store.js', { eager: true });

export const loadedModuleStores = Object.keys(stores);

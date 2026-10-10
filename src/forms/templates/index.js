// ============================================================
// STUDIO FORMULAIRES — bibliothèque de modèles
// ============================================================
// Chaque modèle : { id, title, category, kind, icon (nom lucide),
//   description, highlights: string[], build(): FormDefinition }
// build() renvoie une définition neuve (sans id : attribué par l'éditeur).

import inscriptionEvenement from './inscriptionEvenement.js';
import candidatureBureau from './candidatureBureau.js';
import adhesion from './adhesion.js';
import voteAg from './voteAg.js';
import reservationCreneaux from './reservationCreneaux.js';
import enqueteSatisfaction from './enqueteSatisfaction.js';
import quiz from './quiz.js';
import appelBenevoles from './appelBenevoles.js';
import noteDeFrais from './noteDeFrais.js';
import partenariat from './partenariat.js';
import contact from './contact.js';

export const FORM_TEMPLATES = [
  inscriptionEvenement, candidatureBureau, adhesion, voteAg, reservationCreneaux,
  enqueteSatisfaction, quiz, appelBenevoles, noteDeFrais, partenariat, contact,
];

export const TEMPLATE_CATEGORIES = [...new Set(FORM_TEMPLATES.map(t => t.category))];

export const getTemplate = id => FORM_TEMPLATES.find(t => t.id === id) || null;

export { THEME_PRESETS, themeFromPreset } from './themes.js';
export { baseDefinition, defaultSettings, opts, optionValue } from './helpers.js';

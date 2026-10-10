// Blocs de mise en page proposés par la palette.
import { Heading, Columns2, Type as TypeIcon, Image as ImageIcon, Minus } from 'lucide-react';
import { QUESTION_TYPES } from '../../../forms/schema.js';

export const BLOCKS = [
  { type: 'block:section', label: 'Section', icon: Heading, hint: 'Groupe titré, répétable' },
  { type: 'block:columns', label: 'Colonnes', icon: Columns2, hint: '2 ou 3 colonnes' },
  { type: 'block:text', label: 'Texte', icon: TypeIcon, hint: 'Paragraphe d\'information' },
  { type: 'block:image', label: 'Image', icon: ImageIcon, hint: 'Illustration' },
  { type: 'block:divider', label: 'Séparateur', icon: Minus, hint: 'Ligne horizontale' },
];
export function paletteLabel(type) {
  return QUESTION_TYPES.find(t => t.type === type)?.label || BLOCKS.find(b => b.type === type)?.label || type;
}


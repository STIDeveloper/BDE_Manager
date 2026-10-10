// Registre des composants de question : type → { Component, group }.
// group : true → rendu dans <fieldset><legend> (groupe de contrôles).
// Tous les types de QUESTION_TYPES (src/forms/schema.js) sont couverts ;
// 'hidden' n'est jamais rendu.

import { lazy } from 'react';
import { TextInput } from './TextInputs.jsx';
import { SingleChoice, MultipleChoice, Dropdown, YesNo, ImageChoice } from './ChoiceInputs.jsx';
import { Rating, Scale, Nps } from './RatingInputs.jsx';
import Matrix from './Matrix.jsx';
import { NameInput, AddressInput, ConsentInput } from './StructuredInputs.jsx';
import FileInput from './FileInput.jsx';
import { SignatureInput, PickerInput, PaymentInput, CalculatedField } from './OtherInputs.jsx';

// Classement : @dnd-kit chargé seulement si le formulaire en contient un.
const Ranking = lazy(() => import('./Ranking.jsx'));

export const QUESTION_COMPONENTS = {
  short_text: { Component: TextInput },
  long_text: { Component: TextInput },
  email: { Component: TextInput },
  phone: { Component: TextInput },
  url: { Component: TextInput },
  number: { Component: TextInput },
  date: { Component: TextInput },
  time: { Component: TextInput },
  datetime: { Component: TextInput },
  single_choice: { Component: SingleChoice, group: true },
  multiple_choice: { Component: MultipleChoice, group: true },
  dropdown: { Component: Dropdown },
  yes_no: { Component: YesNo, group: true },
  image_choice: { Component: ImageChoice, group: true },
  ranking: { Component: Ranking, group: true, lazy: true },
  matrix: { Component: Matrix, group: true },
  rating: { Component: Rating, group: true },
  scale: { Component: Scale, group: true },
  nps: { Component: Nps, group: true },
  slots: { Component: SingleChoice, group: true },
  file: { Component: FileInput },
  signature: { Component: SignatureInput, group: true },
  address: { Component: AddressInput, group: true },
  name: { Component: NameInput, group: true },
  consent: { Component: ConsentInput, group: true },
  member_picker: { Component: PickerInput, group: true },
  event_picker: { Component: PickerInput, group: true },
  payment: { Component: PaymentInput, group: true },
  calculated: { Component: CalculatedField },
  hidden: null,
};

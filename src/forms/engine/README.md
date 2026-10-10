# Formules du Studio Formulaires

Les formules servent à **afficher une question sous condition**, la **rendre obligatoire**, la **verrouiller**, **calculer une valeur** (variables, champs calculés, valeur par défaut), **choisir la page suivante** et définir des **quotas**.
Elles ressemblent aux formules d'un tableur, en français. Aucune formule ne peut exécuter de code : elles sont analysées et évaluées par un moteur dédié.

## Valeurs

| Écriture | Signification |
|---|---|
| `18`, `12,5`, `12.5` | nombres (virgule ou point décimal) |
| `"texte"` ou `'texte'` | texte (`""` ou `\"` pour un guillemet dans le texte) |
| `VRAI`, `FAUX` (`true`, `false`) | valeurs logiques |
| `vide` | absence de réponse |
| `age`, `regime` | réponse à la question dont la **clé** est `age`, `regime`… ou valeur d'une **variable** |
| `adresse.ville`, `nom.firstName` | partie d'une réponse structurée |
| `membre.email` | donnée du membre connecté (si identifié) |
| `params.source` | paramètre de l'adresse du formulaire (`/f/wei?source=insta`) |

Les dates s'écrivent `"2026-09-01"` (ou `"01/09/2026"`). Une question masquée vaut toujours `vide`.

> Pour séparer les arguments d'une fonction, utilise `;` (recommandé) ou `,` suivi d'un espace : `MAX(1; 2)` ou `MAX(1, 2)`. Attention : `MAX(1,2)` (sans espace) se lit comme le nombre 1,2.

## Opérateurs (du plus prioritaire au moins prioritaire)

| Opérateur | Rôle | Exemple |
|---|---|---|
| `( )` | regroupement | `(a + b) * 2` |
| `-x` | opposé | `-remise` |
| `*` `/` `%` | multiplication, division, reste | `total / 3` |
| `+` `-` | addition, soustraction (aussi date ± jours, date − date) | `arrivee + 7` |
| `&` | mise bout à bout de textes | `prenom & " " & nom` |
| `=` `<>` (`!=`) `<` `<=` `>` `>=` | comparaisons | `age >= 18` |
| `NON` (`!`) | négation | `NON adherent` |
| `ET` (`&&`) | les deux conditions | `age >= 18 ET adherent` |
| `OU` (`\|\|`) | au moins une condition | `role = "prez" OU role = "trez"` |

Règles pratiques :
- `=` ne tient pas compte des majuscules ni des espaces autour : `regime = "Vegetarien"` est vrai pour « vegetarien ». `"4" = 4` est vrai. `oui`/`non` valent `VRAI`/`FAUX`.
- Une comparaison avec une réponse vide est **fausse** : `age >= 18` est faux tant que l'âge n'est pas renseigné.
- En calcul, une réponse vide compte pour 0 (`prix * quantite`). Une division par zéro donne `vide`.
- Une erreur pendant le calcul (ex. `"abc" * 2`) donne `vide` et un avertissement, jamais un plantage du formulaire.

## Fonctions

Les noms ne tiennent compte ni de la casse ni des accents (`ANNÉE`, `annee`, `Annee`). Les noms anglais courants sont acceptés (`IF`, `SUM`, `AND`, `TODAY`…).

| Fonction | Résultat | Exemple |
|---|---|---|
| `SI(condition; si_vrai; si_faux)` | valeur selon la condition (`si_faux` facultatif) | `SI(age >= 18; "Majeur"; "Mineur")` |
| `ET(c1; c2; …)` / `OU(c1; c2; …)` / `NON(c)` | logique | `ET(age >= 18; adherent)` |
| `SOMME(a; b; …)` | somme (listes additionnées, vides ignorés) | `SOMME(note_1; note_2)` |
| `MOYENNE(a; b; …)` | moyenne des valeurs renseignées | `MOYENNE(note_1; note_2)` |
| `MIN(…)` / `MAX(…)` | plus petite / plus grande valeur (nombres ou dates) | `MAX(0; budget - depenses)` |
| `ARRONDI(x; décimales)` | arrondi (0 décimale par défaut) | `ARRONDI(total / 3; 2)` |
| `ABS(x)` | valeur absolue | `ABS(ecart)` |
| `LONGUEUR(texte)` | nombre de caractères | `LONGUEUR(motivation) >= 200` |
| `CONTIENT(texte_ou_liste; valeur)` | vrai si le texte contient la valeur (sans casse ni accents) ou si la sélection la contient | `CONTIENT(activites; "escalade")` |
| `NB(liste)` | nombre d'éléments sélectionnés / renseignés | `NB(activites) <= 3` |
| `VIDE(x)` / `NON_VIDE(x)` | réponse absente / présente | `NON_VIDE(allergies)` |
| `CONCAT(a; b; …)` | textes bout à bout | `CONCAT(prenom; " "; nom)` |
| `MAJUSCULE(t)` / `MINUSCULE(t)` | changement de casse | `MAJUSCULE(nom)` |
| `TEXTE(x)` / `NOMBRE(t)` | conversions | `NOMBRE(code_postal)` |
| `AUJOURDHUI()` | date du jour (heure de Paris) | `date_event >= AUJOURDHUI()` |
| `ANNEE(d)` / `MOIS(d)` / `JOUR(d)` | parties d'une date | `ANNEE(naissance)` |
| `AGE(naissance; référence)` | âge en années révolues (à aujourd'hui par défaut) | `AGE(naissance) >= 18` |
| `JOURS_ENTRE(début; fin)` | nombre de jours | `JOURS_ENTRE(arrivee; depart)` |
| `DATE(année; mois; jour)` | construit une date | `naissance <= DATE(2008; 9; 1)` |
| `EST_EMAIL(t)` | vrai si adresse e-mail valide | `EST_EMAIL(email_parent)` |
| `CHOIX(valeur; cas1; résultat1; …; défaut)` | résultat associé à la valeur choisie | `CHOIX(formule; "complete"; 45; "soiree"; 20; 0)` |
| `SCORE()` | score courant du quiz | `SI(SCORE() >= 15; "Admis"; "Refusé")` |
| `NB_REPONSES()` | réponses déjà reçues (quotas, côté serveur) | `NB_REPONSES() < 100` |

## Où utiliser les formules

- **Afficher si** (question, bloc, option, page) : la formule doit être vraie. Une question masquée n'est jamais obligatoire et sa réponse n'est pas enregistrée.
- **Obligatoire si** : `regime = "vegetarien"`.
- **Lecture seule si** : `statut = "valide"`.
- **Valeur par défaut calculée** : `{ "expr": "membre.email" }` — appliquée seulement si la question est vide.
- **Champ calculé / variable** : `prix - remise` (les variables peuvent utiliser d'autres variables, sans boucle : `a` → `b` → `a` est refusé).
- **Page suivante** : règles « aller à la page X si … », évaluées dans l'ordre ; sinon page suivante visible.
- **Quotas** : `formule = "soiree"` avec un maximum ; au-delà, refus ou liste d'attente.

## Limites

2 000 caractères et 60 niveaux d'imbrication par formule. Les clés `et`, `ou`, `non`, `vrai`, `faux`, `vide`, `membre`, `params` (et leurs équivalents anglais) sont réservées.

---

## Notes développeurs (API `src/forms/engine/index.js`)

- `parseExpr(source)` → AST figé (cache) ou `ExprError { message, detail, position }` ; `tryParse` ne lève pas.
- `evaluate(exprOuAst, scope, { now, timeZone, score, stats, diagnostics: [] })` → valeur, jamais d'exception (erreurs → `null` + diagnostic).
- `compileForm(def)` (cache par identité : ne jamais muter une définition) → `{ questions[{ key, type, id, pageId, path:[pageId,…,itemId], repeatKey? }], keys, answerKeys, variables, dependencies, issues }`.
- `evaluateForm(def, answers, { now, member, params, stats })` → `{ visiblePages, visible, required, readOnly, computed, score, maxScore, pageOrder, nextPageId(id), prevPageId(id), defaults, values, options (options visibles par clé), fullOptions (options complètes par clé), diagnostics }`.
- `validateAnswers(def, answers, context, { pageId, partial })` → `{ ok, errors, cleaned, computed, score, maxScore }`. Erreurs d'une section répétable : clé `groupe.index.clé`. `context.lookup = { members, events }` (Set/tableau d'ids) active le contrôle d'existence des sélecteurs.
- Section répétable : `{ kind: 'section', key, repeat: {min,max}, items }` → réponse `answers[key] = [{ cléEnfant: valeur }]` ; dans les formules hors section, `cléEnfant` vaut la liste des valeurs (`SOMME(montant)`), et `groupe.cléEnfant` aussi.
- Formats normalisés : `phone` compact (`0612345678`, `+33…`), `url` avec schéma, `date` `AAAA-MM-JJ`, `time` `HH:MM`, `name { firstName, lastName }`, `address { line1, line2, postalCode, city, region, country }`, `file [{ id, name, size, type }]`, `payment { amount, currency, option? }`, `yes_no`/`consent` booléens.
- `quotaStatus(def, answers, { now, stats: { total, optionCounts, quotaCounts? } })` → `{ allowed, waitlist, message?, reasons }`. `quotaCounts[i]` (fourni par le serveur) prime ; à défaut, un quota `cle = "valeur"` est compté via `optionCounts`.
- `summarizeAnswers(def, answers, { context, includeEmpty, includeHidden, labelFor })` → `[{ key, label, value, sensitive? }]`.

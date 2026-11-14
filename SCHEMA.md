# Format du plan mensuel — v1

Ce document décrit le fichier JSON que l'application **Batch cooking** importe. Il est écrit pour
être donné tel quel à Claude (claude.ai) afin qu'il produise directement un fichier valide.

- JSON Schema équivalent (structure seule) : `public/schema/plan-v1.schema.json`, publié avec
  l'application à l'adresse `<url-de-l-app>/schema/plan-v1.schema.json`.
- Exemple complet et valide : `fixtures/novembre-2026-semaine1.json`.
- Vérification hors application : `npm run valider -- mon-plan.json`.

## Consigne à donner à Claude

> Produis le plan du mois au format JSON décrit dans SCHEMA.md (version 1), dans un seul bloc de
> code ou un fichier `.json`. Respecte strictement les noms de champs et les listes de valeurs.
> Règles :
> 1. Un ingrédient = une entrée dans `ingredients` avec un `id` unique ; les recettes, les courses
>    et le placard y font référence par cet `id`.
> 2. Les quantités des recettes sont celles **achetées** (poids brut, en g) quand c'est possible ;
>    si une quantité est pesée après préparation, dis-le dans `note`.
> 3. Si une quantité n'est pas connue, mets `"quantite": null` : n'estime rien.
> 4. Ne mets **aucune valeur nutritionnelle ni durée de conservation** : l'application les calcule
>    (table Ciqual 2025) ou les lit dans ses réglages. Indique seulement le type de conservation de
>    chaque recette (`conservation`) et, pour chaque ingrédient, le code Ciqual 2025 de l'aliment
>    **dans l'état où la quantité est écrite** (`ciqual.code` : lentilles **sèches**, riz **cru**,
>    pois chiches **égouttés**…) quand la correspondance est claire ; sinon, laisse-le absent.
>    Marque `feculent: true` les féculents (riz, pâtes, semoule, légumineuses, pommes de terre,
>    pain) : leur part varie selon la personne. Ne donne `masseParUnite` (g par pièce, cuillère,
>    boîte…) que si elle est connue (indiquée sur l'emballage, par exemple) : jamais estimée.
> 5. Les courses et la liste « à sortir » ne se fournissent pas : l'application les calcule à
>    partir des recettes. N'ajoute dans `coursesSupplementaires` que ce qui n'est dans aucune
>    recette (fruits du dessert, herbes achetées en botte pour toute la semaine…).
> 6. La session est une liste d'étapes horodatées ; le planning (Gantt) et les minuteurs en sont
>    déduits. Donne pour chaque étape `actifMin`, et `passifMin` quand une cuisson tourne seule.
>    N'écris **aucune heure dans le texte** des étapes (pas de « À 1:08, sors… ») : chaque action
>    à un autre moment (sortir, retourner, égoutter, couper le feu) est une **étape séparée**
>    avec `alerte: true`, la **même `tache`** que l'étape de cuisson, et `debut` = début de la
>    cuisson + temps écoulé. L'app s'en sert pour décaler ces étapes quand la cuisson est déplacée.
> 7. Indique dans `repas` quand chaque plat est mangé (dimanche soir → jeudi par défaut).

## Vue d'ensemble

```text
plan
├─ format: "batch-cooking-plan"      (obligatoire, valeur fixe)
├─ version: 1                         (obligatoire, valeur fixe)
├─ mois: "AAAA-MM"
├─ titre
├─ personnes[]        { id, nom }
├─ ingredients[]      catalogue : rayon, stockage, placard, codes Ciqual / Open Food Facts
├─ recettes[]         bibliothèque : portions, ingrédients (réf. catalogue), tags, étapes…
├─ semaines[]         numéro, dimanche de session, plats (réf. recette + portions + repas), session
└─ placard[]          produits de fond de placard à vérifier une fois par mois
```

Toute clé absente de ce document est **refusée** à l'import (pour ne jamais perdre une donnée en
silence). Les champs marqués « facultatif » peuvent être omis.

## Conventions

| Sujet | Règle |
|---|---|
| Identifiants (`id`) | minuscules, chiffres et tirets : `riz-basmati`, `s1-03`. Uniques dans leur liste. |
| Dates | `AAAA-MM-JJ`. `dateSession` est un dimanche (sinon avertissement). |
| Heures de session | `h:mm` depuis le début de la session : `0:05`, `1:30`. |
| Quantités | nombre > 0, ou `null` si inconnue. Décimales avec un point : `0.5`. |
| Texte des étapes | phrases courtes ; seul le gras `**…**` est interprété (ingrédients et quantités). |

### Listes fermées

| Champ | Valeurs |
|---|---|
| `rayon` | `fruits-legumes`, `boucherie-poissonnerie`, `cremerie`, `epicerie`, `surgeles`, `autre` |
| `stockage` | `frigo`, `congelateur`, `legumes`, `placard` |
| `unite` | `g`, `kg`, `ml`, `cl`, `l`, `piece`, `botte`, `gousse`, `tranche`, `sachet`, `boite`, `pot`, `cas` (c. à s.), `cac` (c. à c.), `pincee` |
| `poste` | `plan-de-travail`, `feux`, `four`, `cook-expert` |
| `moment` | `midi`, `soir` |
| `tags.saisons` | `printemps`, `ete`, `automne`, `hiver` |
| `tags.feculents` | `riz`, `pates`, `semoule`, `legumineuses`, `pommes-de-terre`, `pain`, `autre` |
| `four.mode` | `traditionnel`, `chaleur-tournante` |

Stockage par défaut quand il est omis : fruits-legumes → `legumes`, boucherie-poissonnerie et
cremerie → `frigo`, surgeles → `congelateur`, epicerie et autre → `placard`.

Les quantités sont additionnées dans les courses **uniquement au sein d'une même famille
d'unités** : masse (g, kg), volume (ml, cl, l), ou unité comptée identique (pièces avec pièces…).
Ex. « 265 g de carottes » et « 3 carottes » restent deux lignes. Garder la même unité pour un même
ingrédient dans tout le plan évite ces doublons.

## `personnes[]`

| Champ | Type | Description |
|---|---|---|
| `id` | id | ex. `apolline`, `aurelien` — doit correspondre d'un mois à l'autre. |
| `nom` | texte | Prénom affiché. |

## `ingredients[]`

| Champ | Type | Description |
|---|---|---|
| `id` | id | |
| `nom` | texte | Nom affiché dans les courses (« Lentilles vertes »). |
| `rayon` | liste | Rayon du magasin. |
| `stockage` | liste, facultatif | Où il est rangé (« à sortir »). |
| `placard` | booléen, facultatif | `true` : épices, huiles, sauces… vérifiés une fois par mois, absents des courses hebdomadaires. |
| `ciqual.code` | texte de chiffres, facultatif | Code de l'aliment dans la [table Ciqual 2025](https://doi.org/10.57745/RDMHWY) **dans l'état où la quantité est écrite** (cru, sec, égoutté, chair sans peau…). Sans code, l'ingrédient n'est pas compté dans la nutrition et c'est signalé. |
| `feculent` | booléen, facultatif | `true` pour un féculent (riz, pâtes, semoule, légumineuses, pommes de terre, pain…) : dans les portions, sa part suit le coefficient « féculents » de chaque personne (réglages de l'app). |
| `off.codeBarres` | 8 à 14 chiffres, facultatif | Produit de marque sur Open Food Facts. |
| `masseParUnite` | objet, facultatif | Grammes par unité non massique, si connus avec certitude : `{"piece": 60}`, `{"boite": 240}` (égouttée), `{"ml": 1.03}` (densité, vaut pour ml, cl et l). Sert au calcul nutritionnel ; sans elle, les lignes dans cette unité ne sont pas comptées. Peut aussi être saisie dans l'app (ingrédient → ✎). |

## `recettes[]`

| Champ | Type | Description |
|---|---|---|
| `id`, `nom` | | |
| `portions` | entier > 0 | Portions pour lesquelles les quantités sont écrites. |
| `conservation` | liste d'ids, facultatif | Types de conservation définis dans les réglages de l'app. Par défaut : `plat-cuisine`, `soupe`, `quiche`, `oeufs-durs`, `pates`, `riz`, `poisson-cru`. Plusieurs types possibles (`["riz", "oeufs-durs"]`) : le plus court s'applique. Un type inconnu est signalé, pas deviné. |
| `tags` | objet, facultatif | `saisons[]`, `vegetarien` (booléen), `feculents[]`, `libres[]` (texte). |
| `durees` | objet, facultatif | `preparationMin`, `cuissonMin`. |
| `ustensiles` | liste de textes, facultatif | |
| `four` | objet, facultatif | `temperatureC` + `mode` pour lequel elle est écrite ; l'app affiche la valeur ajustée à son four. |
| `ingredients[]` | liste, ≥ 1 | `{ ingredient, quantite, unite, note?, facultatif? }` |
| `etapes` | liste de textes, facultatif | Recette seule, hors session. |
| `source` | texte, facultatif | Lien ou référence de la recette. |

## `semaines[]`

| Champ | Type | Description |
|---|---|---|
| `numero` | 1 à 6 | Unique. |
| `dateSession` | date | Dimanche de la session. |
| `titre` | texte, facultatif | « Butternut, poulet, feta ». |
| `plats[]` | liste, ≥ 1 | Voir ci-dessous. |
| `coursesSupplementaires[]` | facultatif | `{ ingredient, quantite, unite, note? }` hors recettes. |
| `session` | facultatif | Voir ci-dessous. |

### `plats[]`

| Champ | Type | Description |
|---|---|---|
| `recette` | id | Recette de `recettes`. |
| `portions` | entier > 0 | Portions cuisinées ; les quantités sont mises à l'échelle (`portions / recette.portions`). |
| `pour` | ids, facultatif | Personnes qui mangent ce plat (ex. `["apolline"]`). Par défaut : tout le monde. Les exclusions alimentaires ne sont vérifiées que pour elles. |
| `repas[]` | facultatif | `{ date, moment, portions?, pour?, aPreparer?, aPreparerMin? }`. Deux repas ou plus = plat « en double ». `portions` vaut par défaut le nombre de personnes concernées. `aPreparer` : ce qui se fait à la minute ce soir-là. |

Contrôles : un repas ne peut pas précéder la session (erreur) ; plus de 6 jours après, ou plus de
portions mangées que cuisinées → avertissement. L'app colore chaque repas selon les durées de
conservation de ses réglages (J0 = jour de session).

### `session`

| Champ | Type | Description |
|---|---|---|
| `dureeMin` | entier, facultatif | Durée annoncée. |
| `modeFour` | liste, facultatif | Mode pour lequel les températures écrites dans les étapes sont données ; par défaut `traditionnel`. L'app ajoute la température ajustée à côté (ex. « 210 °C (190 °C en chaleur tournante) »). |
| `ustensiles` | textes, facultatif | Complétés par ceux des recettes. |
| `taches[]` | facultatif | `{ id, libelle }` : une ligne du planning (Gantt). |
| `etapes[]` | ≥ 1 | Voir ci-dessous. |

Chaque étape :

| Champ | Type | Description |
|---|---|---|
| `id` | id | Unique dans la session (`s1-01`…). |
| `debut` | `h:mm` | Heure depuis le début. |
| `poste` | liste | Plan de travail, feux, four, Cook Expert. |
| `tache` | id, facultatif | Ligne du planning. Toutes les étapes d'une même préparation (mise au four, retourner, sortir) partagent la même tâche : quand on déplace une étape dans l'app, les étapes plus tardives de sa tâche suivent. Sans tâche, l'étape a sa propre ligne et n'est liée à rien. |
| `actifMin` | entier ≥ 0 | Minutes de travail actif (barre bleue). |
| `passifMin` | entier, facultatif | Cuisson qui tourne seule après la partie active (barre verte, minuteur de `actifMin + passifMin`). |
| `rappelsMin` | entiers, facultatif | Rappels répétés pendant l'étape (remuer toutes les 10 min : `[10, 20, 30]`). Pour une action distincte (sortir des œufs), préférer une étape séparée. |
| `alerte` | booléen, facultatif | Action courte à ne pas rater (⚠, barre rouge). |
| `texte` | texte | Consigne ; ingrédients en `**gras**`. Pas d'heure dans le texte : une action à un autre moment = une autre étape. |
| `details` | textes, facultatif | Sous-points (plaque 1, plaque 2…). |
| `recettes` | ids, facultatif | Recettes concernées. |
| `groupe` | id, facultatif | Étapes fusionnées : des étapes **consécutives** de même `groupe` s'affichent comme une seule carte, à l'heure de la première ; chacune garde ses durées et son minuteur. Donner la même heure aux membres. |

## `placard[]`

`{ ingredient, quantite?, unite?, note? }` — liste vérifiée en début de mois. L'app y ajoute tout
ingrédient marqué `placard: true` utilisé par les recettes du mois, avec la quantité utilisée.

## Exemple minimal

```json
{
  "format": "batch-cooking-plan",
  "version": 1,
  "mois": "2026-11",
  "titre": "Batch cooking – Novembre",
  "personnes": [{ "id": "apolline", "nom": "Apolline" }, { "id": "aurelien", "nom": "Aurélien" }],
  "ingredients": [
    { "id": "lentilles-vertes", "nom": "Lentilles vertes", "rayon": "epicerie" },
    { "id": "feta", "nom": "Feta", "rayon": "cremerie" },
    { "id": "cumin", "nom": "Cumin", "rayon": "epicerie", "placard": true }
  ],
  "recettes": [
    {
      "id": "salade-lentilles-feta",
      "nom": "Salade de lentilles et feta",
      "portions": 4,
      "conservation": ["plat-cuisine"],
      "tags": { "vegetarien": true, "feculents": ["legumineuses"] },
      "ingredients": [
        { "ingredient": "lentilles-vertes", "quantite": 240, "unite": "g" },
        { "ingredient": "feta", "quantite": 150, "unite": "g" },
        { "ingredient": "cumin", "quantite": null, "unite": "pincee" }
      ]
    }
  ],
  "semaines": [
    {
      "numero": 1,
      "dateSession": "2026-11-08",
      "plats": [
        {
          "recette": "salade-lentilles-feta",
          "portions": 4,
          "repas": [
            { "date": "2026-11-08", "moment": "soir" },
            { "date": "2026-11-09", "moment": "midi" }
          ]
        }
      ],
      "session": {
        "taches": [{ "id": "lentilles", "libelle": "Lentilles (25 min)" }],
        "etapes": [
          { "id": "s1-01", "debut": "0:00", "poste": "feux", "tache": "lentilles", "actifMin": 3, "passifMin": 22,
            "texte": "**240 g de lentilles vertes** dans l'eau bouillante, 25 min." },
          { "id": "s1-02", "debut": "0:25", "poste": "feux", "tache": "lentilles", "actifMin": 2, "alerte": true,
            "texte": "Égoutte les lentilles." }
        ]
      }
    }
  ]
}
```

## Évolution du format

Le champ `version` permet de faire évoluer le format : un fichier v1 restera importable par les
versions futures de l'application (migration à l'import).

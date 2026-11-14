# Texte à reporter dans la skill `plan-batch-cooking`

La skill contient un schéma JSON « provisoire ». Remplacez sa section **« JSON pour
l'application »** par le texte ci-dessous, puis joignez `SCHEMA.md` à la conversation (ou au projet
Claude) chaque mois.

---

## JSON pour l'application

Produire un fichier JSON conforme à `SCHEMA.md` (format `batch-cooking-plan`, version 1), en le
suivant strictement : toute clé non documentée est refusée à l'import.

Points clés :
- `ingredients` est un catalogue : chaque ingrédient a un `id`, un `rayon`, et `placard: true` pour
  les produits de fond de placard. Les recettes, le placard et les courses supplémentaires y font
  référence par `id`.
- Les quantités des recettes sont exactes et par recette (pas seulement des totaux de courses) ;
  `null` si une quantité n'est pas connue. Ne jamais estimer.
- Ne pas fournir les courses, « à sortir », la nutrition ni les durées de conservation :
  l'application les calcule. Indiquer seulement `conservation` (types : `plat-cuisine`, `soupe`,
  `quiche`, `oeufs-durs`, `pates`, `riz`, `poisson-cru`, ou un type créé dans les réglages de
  l'app).
- Nutrition (calculée par l'app depuis la table Ciqual 2025 de l'ANSES) : pour chaque ingrédient,
  donner `ciqual.code` = code Ciqual 2025 de l'aliment **dans l'état où la quantité est écrite**
  (lentilles sèches, riz cru, pois chiches égouttés, filet de poulet cru…), seulement si la
  correspondance est claire ; sinon l'omettre (l'app le signale et permet de le choisir).
  Marquer `feculent: true` les féculents (riz, pâtes, semoule, légumineuses, pommes de terre,
  pain) : l'app ajuste leur part selon la personne (coefficient réglé dans l'app). Préférer des
  quantités en grammes ; `masseParUnite` seulement si la masse est connue (emballage), jamais
  estimée. Ne plus écrire de valeurs nutritionnelles dans le document ni dans le JSON.
- `coursesSupplementaires` : seulement ce qui n'est dans aucune recette (fruits du dessert, herbes
  en botte pour la semaine…).
- Ordre de consommation : `plats[].repas[]` (date, `midi`/`soir`, `pour` si le plat n'est que
  pour une personne, `aPreparer` pour ce qui se fait à la minute).
- Session : une liste unique d'`etapes` (heure `h:mm`, `poste`, `actifMin`, `passifMin`,
  `rappelsMin`, `alerte`, ingrédients en `**gras**`) et des `taches` (lignes du Gantt). Le Gantt est
  déduit des étapes : ne pas le fournir séparément.
- **Aucune heure dans le texte des étapes** (pas de « À 1:08, sors-en 4 ») : chaque action à un
  autre moment (sortir, retourner, égoutter, couper le feu) est une **étape séparée**, avec
  `alerte: true`, la **même `tache`** que l'étape de cuisson et `debut` = début de la cuisson +
  temps écoulé. Exemple : « 10 œufs dans l'eau bouillante » à 1:02 (`actifMin` 1, `passifMin` 9,
  tâche `oeufs`), puis « Sors 4 œufs (mollets) » à 1:08 et « Sors les 6 autres (durs) » à 1:12,
  tâche `oeufs`. Dans l'app, déplacer la cuisson déplace ces étapes avec elle.
- `rappelsMin` : seulement pour des rappels répétés pendant une étape (remuer toutes les 10 min).
- Pour présenter plusieurs actions comme une seule étape tout en gardant leurs minuteurs (ex.
  lancer lentilles et riz ensemble), leur donner le même `groupe` et la même heure.
- Les températures des étapes sont écrites pour un four traditionnel (sinon préciser
  `session.modeFour`) ; l'app affiche la valeur en chaleur tournante.
- Vérifier avant de livrer : `npm run valider -- plan.json` dans le dépôt de l'app, ou l'écran
  « Importer » qui liste les erreurs avec leur chemin.

---

## Tenir compte des notes de l'app (à ajouter dans « Déroulé », étape 1)

Ajoutez à la liste des questions de départ :

- « As-tu un fichier de notes exporté de l'app (`batch-cooking-notes-….json`) ? » (l'export de la
  bibliothèque, ci-dessous, contient aussi les notes : l'un ou l'autre suffit)

Et cette règle dans « Règles de conception du menu » :

- Si un fichier `batch-cooking-notes` est fourni : les notes vont de 1 (mauvais) à 5 (excellent),
  pour la facilité et le goût, par personne. Reproposer en priorité les recettes de goût moyen
  ≥ 4 ; ne pas reproposer telle quelle une recette de goût moyen ≤ 2 ; tenir compte des
  commentaires (« trop long », « plus épicé »…) et le dire quand une recette est adaptée.
  Garder le même `id` pour une recette reproposée, afin que ses notes restent attachées.
  Ne jamais inventer de note pour une recette qui n'en a pas.

---

## Réutiliser la bibliothèque (à ajouter dans « Déroulé », étape 1)

Ajoutez à la liste des questions de départ :

- « As-tu un export de la bibliothèque de l'app (`batch-cooking-bibliotheque-….json`) ? »

Et ces règles dans « Règles de conception du menu » :

- Si un fichier `batch-cooking-bibliotheque` est fourni, il contient chaque recette complète au
  format du plan (`recette`, `ingredients`), ses `saisons` (« non renseignée » sinon), le résumé de
  ses `notes` et sa `nutrition` calculée par l'app (intervalles par portion, étiquettes
  « riche en protéines », « pauvre en glucides »…, `complet: false` si des ingrédients n'ont pas
  été comptés).
- Ne reproposer que des recettes dont les `saisons` contiennent la saison du mois ; une recette
  sans saison (« non renseignée ») peut être proposée en le signalant, avec la saison proposée.
- Une recette reprise garde **son `id`** et ses quantités, sauf adaptation annoncée ; reprendre
  aussi ses ingrédients (avec `ciqual.code`, `feculent`, `masseParUnite`) dans le catalogue du plan.
- Se servir des étiquettes et de la nutrition pour équilibrer la semaine (ex. assez de plats
  « riche en protéines »), sans recopier de valeurs nutritionnelles dans le plan. Les objectifs
  personnels ne sont pas dans l'export : les demander si besoin.

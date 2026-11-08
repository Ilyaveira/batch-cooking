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
  l'app) et, si le code est certain, `ciqual.code`.
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

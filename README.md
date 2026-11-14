# Batch cooking

Application mobile (PWA) en français pour préparer et suivre un plan mensuel de batch cooking à
deux : menu, quand manger quoi, courses par rayon, placard du mois, déroulé de la session du
dimanche et mode cuisine. Le plan est généré chaque mois par Claude au format décrit dans
[`SCHEMA.md`](SCHEMA.md), puis importé dans l'app. Tout fonctionne hors ligne, sans compte ; les
données restent sur le téléphone.

## Installer l'app sur un téléphone Android

1. Ouvrir l'adresse de l'app dans **Chrome** (après déploiement : `https://<compte>.github.io/<dépôt>/`).
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Ouvrir l'app depuis l'icône : elle fonctionne ensuite en mode avion.

Sur iPhone : Safari → Partager → **Sur l'écran d'accueil**. L'écran ne reste allumé en mode
cuisine qu'à partir d'iOS 18.4 ([données de compatibilité](https://web-platform-dx.github.io/web-features-explorer/features/screen-wake-lock)).
Une app non installée peut voir ses données effacées par Safari après quelques jours sans visite :
installez-la, et utilisez **Réglages → Exporter une sauvegarde** de temps en temps.

## Utilisation chaque mois

1. Dans claude.ai, préparer le plan avec la skill `plan-batch-cooking`, en joignant `SCHEMA.md`
   (texte à reporter dans la skill : [`docs/mise-a-jour-skill.md`](docs/mise-a-jour-skill.md)).
2. Récupérer le fichier `.json` produit par Claude sur le téléphone.
3. Dans l'app : **Réglages → Importer un plan** (ou depuis l'accueil). L'app vérifie le fichier et
   liste les erreurs avec leur emplacement (`semaines[1].plats[2].recette : …`) : il suffit de les
   renvoyer à Claude pour qu'il corrige.
4. À la première importation, renseigner dans **Réglages** les aliments exclus de chaque personne
   et vérifier les durées de conservation.

Réimporter le plan d'un mois le remplace ; les cases cochées, les réglages, la bibliothèque et
l'ordre des étapes modifié dans l'app sont conservés.

### Données par appareil

Les données sont enregistrées dans le navigateur de chaque appareil, sans compte ni serveur : un
plan importé sur le PC n'apparaît pas sur le téléphone (la synchronisation est prévue plus tard).
Pour passer d'un appareil à l'autre :
- importer le même fichier JSON sur chaque appareil ;
- ou **Réglages → Exporter une sauvegarde**, puis **Restaurer une sauvegarde** sur l'autre appareil
  (remplace tout son contenu) ;
- pour ne transmettre qu'un plan avec l'ordre d'étapes modifié : **Réglages → Plans importés →
  Exporter**, puis l'importer sur l'autre appareil (ou le redonner à Claude).

### Modifier les ingrédients

- **Fiche recette → ✎ Modifier les ingrédients** : quantité (vide = non précisée), unité, note,
  **Retirer**, **Remplacer** (par un ingrédient du plan ou un nouveau, créé avec son rayon),
  **+ Ajouter un ingrédient**. À l'enregistrement : **cette semaine seulement** (depuis une semaine)
  ou **tout le mois** (et la bibliothèque) ; un remplacement peut être reporté dans les autres
  recettes de la semaine ou du mois. Les textes des étapes ne sont pas réécrits : l'app indique
  ceux qui citent encore l'ancien ingrédient. « Revenir à la recette du plan » annule.
- **Courses et « à sortir » → ✎** sur un article : nom, rayon, lieu de rangement, produit de
  placard. **Mémorisé sur le téléphone pour tous les mois** (par identifiant d'ingrédient). Dans les
  courses, le détail par recette mène à la fiche pour corriger une quantité.
- Priorité : semaine > mois > plan importé. Conservé au réimport (une ligne citant un ingrédient
  disparu est ignorée et signalée sur l'accueil). L'export du plan inclut tout : une modification
  « semaine » y devient une recette dérivée `<id>-s<n>`.

### Nutrition, objectifs et étiquettes

- **Calcul** : depuis la table [Ciqual 2025 de l'ANSES](https://doi.org/10.57745/RDMHWY)
  (embarquée dans l'app, fonctionne hors ligne) : énergie, protéines, glucides, sucres, lipides,
  acides gras saturés, fibres, sel, **par portion et par personne** (fiche recette) et **par jour
  et par personne** (Repas, plats du plan seulement).
- **Rien d'estimé** : un ingrédient sans code Ciqual, sans quantité ou dont la masse de l'unité est
  inconnue (pièce, cuillère, boîte…) est listé « non compté » et les totaux deviennent des minimums
  (« ≥ »). Bouton ✎ à côté de chaque ingrédient non compté : choisir l'aliment Ciqual (recherche),
  saisir la masse d'une unité (à peser une fois), marquer « féculent ». Mémorisé pour tous les mois.
  Les teneurs Ciqual « < x », « traces » ou absentes sont gardées comme des intervalles.
- **Portions par personne** : chacun a la même part de tout, sauf les ingrédients marqués
  **féculents**, répartis selon le **coefficient féculents** de chaque personne (Réglages ; ex.
  0,75 contre 1). Le total du plat est conservé.
- **Objectifs** (Réglages, par personne) : plages d'énergie (kcal/jour) et de protéines (g/jour).
  La fiche indique la part de l'objectif du jour apportée par une portion ; les journées affichent
  « dans l'objectif », « sous l'objectif », « au-dessus » ou « incertain ». Ces valeurs restent sur
  le téléphone et ne sont dans aucun export pour Claude.
- **Étiquettes nutritionnelles calculées** (fiche, bibliothèque avec filtre) : seuils des
  allégations nutritionnelles du [règlement (CE) 1924/2006](https://food.ec.europa.eu/food-safety/labelling-and-nutrition/nutrition-and-health-claims/nutrition-claims_en)
  (riche / source de protéines et de fibres, pauvre en matières grasses, en graisses saturées, en
  sucres, en sel) ; « pauvre en glucides » n'ayant pas de définition réglementaire, son seuil est
  personnel (Réglages, 26 % de l'énergie par défaut). Indicatives : ces règles visent les produits
  vendus, et les seuils « pour 100 g » portent sur la masse des ingrédients tels que pesés.
- **Étiquettes modifiables** : fiche recette → ✎ Étiquettes (saisons, étiquettes libres), pour
  tous les mois.
- **Réglages → Exporter la bibliothèque (pour Claude)** : toutes les recettes complètes (format du
  plan), leurs ingrédients, saisons (« non renseignée » sinon), notes et nutrition par portion.
  Consignes à ajouter à la skill : [`docs/mise-a-jour-skill.md`](docs/mise-a-jour-skill.md).

### Réorganiser et modifier les étapes

Écran **Session → Réorganiser** :
- changer le **n°** d'une étape la déplace à cette place (15 → 8 : l'ancienne 8 devient la 9…) ;
  les flèches ↑ / ↓ la déplacent d'un cran. Une étape déplacée **prend l'heure de l'étape dont
  elle prend la place**, pour que la liste reste chronologique ;
- changer l'**heure** d'une étape (ex. `0:25`, `0h25`, `25`) la replace d'elle-même ;
- **✎ Modifier** : réécrire la consigne ; une ligne commençant par `-` devient un sous-point,
  `**…**` met un ingrédient en gras ;
- **Scinder en deux** (dans « Modifier ») : coupure proposée après la 1ʳᵉ phrase, modifiable. La
  1ʳᵉ partie garde l'heure, les durées et le minuteur ; la 2ᵉ commence à la même heure, juste après,
  sans minuteur ;
- **Fusionner avec la suivante** : une seule carte (et une seule case à cocher), à l'heure de la
  1ʳᵉ ; chaque étape garde ses durées et son minuteur (deux boutons en mode cuisine). **Séparer**
  défait la fusion ;
- **Étapes liées** : les étapes d'une même préparation partagent la même ligne du planning
  (`tache`). Déplacer une étape (n°, flèches ou heure) décale d'autant les étapes **plus tardives
  de sa ligne** (ex. avancer « Enfourne » avance « Retourne » et « Sors les plaques »), y compris
  les heures écrites dans leur texte ; elles restent des cartes séparées, dans l'ordre. Un message
  indique combien d'étapes ont suivi, avec « Annuler ». Déplacer une étape liée seule ne bouge qu'elle ;
- **Durées** : minutes actives + cuisson, avec l'heure de fin ; le minuteur suit. Si la fin change,
  les étapes liées prévues à la fin ou après sont décalées (pas celles prévues pendant la cuisson) ;
- **⚠ incohérence** : signalée quand une étape tombe avant la fin de la cuisson dont elle dépend ;
- **Revenir au plan importé** annule toutes les modifications de la semaine.

Les modifications sont gardées à part du plan importé : elles survivent à un réimport (les étapes
non touchées reprennent le texte du nouveau plan ; les étapes disparues sont ignorées, les
nouvelles s'insèrent selon leur heure). L'export du plan les inclut (champ `groupe` pour les
fusions, voir SCHEMA.md).

## Ce que fait l'app (MVP)

| Écran | Contenu |
|---|---|
| Plan | Semaines du mois, plats, portions, plats « en double », alertes (aliments exclus, repas hors délai). |
| Repas | « Quand manger quoi » du dimanche soir au jeudi (réglable), avec J+n et un statut de conservation par repas, et les apports du jour par personne comparés aux objectifs. |
| Courses | Quantités agrégées par ingrédient, triées par rayon, à cocher ; détail par recette. |
| Placard | Liste mensuelle à vérifier, avec ce que les recettes du mois en utilisent. |
| Planning | Dans Session : Gantt d'une ligne par tâche (bleu : actif, vert : cuisson passive, rouge : à surveiller), calculé à partir des étapes, y compris celles modifiées dans l'app. Toucher une barre affiche l'étape ; « Agrandir en paysage » ouvre le planning en plein écran, tourné, tout tient à l'écran. |
| Session | « À sortir » à cocher (frigo, congélateur, légumes, placard, ustensiles ; compteur et « Tout décocher ») et étapes horodatées par tranches de 30 min, poste en couleur, ingrédients en gras. Bouton **Réorganiser** : déplacer une étape (n° ou flèches), changer son heure, modifier son texte, la scinder, ou la fusionner avec la suivante. |
| Mode cuisine | Gros texte, écran maintenu allumé (Screen Wake Lock), minuteurs avec rappels (vibration + bip), étapes à cocher, chrono de session. **Heure de début** facultative : les étapes affichent alors l'heure réelle (14:30, 14:35…). |
| Recettes | Bibliothèque (recherche, filtres végétarien / féculent / saison / étiquette nutritionnelle / note, tri par nom, goût, facilité ou dernière fois cuisinée), fiche avec portions ajustables, **nutrition par portion et par personne**, étiquettes modifiables et **notes** (facilité et goût de 1 à 5 par personne, commentaire, date, historique et moyennes). |
| Réglages | Personnes, aliments exclus, **objectifs (énergie, protéines) et coefficient féculents**, seuil « pauvre en glucides », durées de conservation (avec leur source), four (chaleur tournante, écart), Cook Expert, sauvegarde, exports (notes, bibliothèque). |

### Règles de calcul (aucune valeur inventée)

- **Portions** : quantité × portions voulues / portions de la recette. Arrondi à l'affichage
  seulement (5 g au-delà de 100 g, ¼ de pièce, ½ cl…).
- **Courses** : somme par ingrédient au sein d'une même famille d'unités (masse g/kg, volume
  ml/cl/l, ou unité comptée identique). Des unités de familles différentes restent sur des lignes
  séparées. Une quantité absente du plan est affichée « quantité non précisée », jamais estimée.
- **Conservation** : J0 = jour de session. Vert jusqu'à la borne basse, orange entre les bornes,
  rouge au-delà ; si une recette a plusieurs types, le plus court s'applique ; sans type, « durée
  non renseignée ». Les valeurs par défaut reprennent celles citées dans le plan de novembre, avec
  leur source affichée ; elles se modifient dans les réglages.
- **Nutrition** : teneur Ciqual pour 100 g × masse de la ligne (g et kg directs ; autres unités
  via `masseParUnite`). Portion = recette ÷ portions ; part de féculents d'une personne =
  coefficient × nombre de mangeurs ÷ somme des coefficients. Énergie des macronutriments pour
  les étiquettes : 4 kcal/g (protéines, glucides), 9 kcal/g (lipides), règlement (UE) 1169/2011,
  annexe XIV. Protéines : « N × 6,25 » (code Ciqual 25003). Une étiquette n'est attribuée que si
  elle est vraie pour toutes les valeurs possibles de l'intervalle ; sinon « indéterminé ».
- **Four** : les températures des étapes du poste Four sont annotées pour le mode de votre four
  (écart réglable, 20 °C par défaut). Les températures du Cook Expert ne sont pas touchées.

## Développement

Prérequis : Node.js 22.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run valider -- fixtures/novembre-2026-semaine1.json
```

- `npm run build` régénère `public/schema/plan-v1.schema.json`, vérifie les types et produit `dist/`.
- `npm run valider -- <fichier>` vérifie un plan en ligne de commande.
- Parcours de bout en bout sur mobile émulé : `tests/e2e/parcours-mobile.cjs`, `reorganisation-mobile.cjs`, `edition-mobile.cjs`, `dependances-mobile.cjs`, `v2-mobile.cjs`, `sortir-mobile.cjs`, `ingredients-mobile.cjs`, `nutrition-mobile.cjs` (mode d'emploi en tête de chaque fichier).
- Icônes : `node scripts/generer-icones.mjs` (Playwright requis).
- Table Ciqual : `public/data/ciqual-2025.json` est produit par
  `npx tsx scripts/construire-ciqual.ts <dossier>` à partir des fichiers XML `alim.xml`,
  `alim_grp.xml` et `compo.xml` de [Ciqual 2025](https://doi.org/10.57745/RDMHWY) (seuls les
  constituants utiles sont gardés, valeurs recopiées telles quelles).

### Structure du projet

```text
src/
├─ domain/            Logique pure, sans React, entièrement testée
│  ├─ schema/         Schéma Zod du plan (source unique), validation FR, avertissements
│  ├─ constantes.ts   Listes fermées : rayons, unités, postes, stockages…
│  ├─ unites.ts       Familles d'unités et affichage des quantités
│  ├─ portions.ts     Mise à l'échelle
│  ├─ courses.ts      Agrégation des courses et placard du mois
│  ├─ session.ts      À sortir, étapes, Gantt (couloirs/segments), minuteurs
│  ├─ calendrier.ts   Quand manger quoi et statuts de conservation
│  ├─ gantt.ts        Géométrie du planning (barres, graduations)
│  ├─ modifications.ts Ingrédients modifiés dans l'app (infos, recettes semaine / mois, export)
│  ├─ notation.ts     Notes : moyennes, tri, filtres, export
│  ├─ nutrition.ts    Nutrition Ciqual (intervalles), portions par personne, étiquettes, journées
│  ├─ bibliotheque.ts Étiquettes modifiées, export de la bibliothèque pour Claude
│  ├─ reorganisation.ts Étapes modifiées dans l'app (ordre, heures, textes, scissions, fusions)
│  ├─ exclusions.ts   Aliments exclus par personne
│  └─ reglages.ts     Réglages par défaut sourcés, températures du four
├─ data/              IndexedDB (Dexie) et fonctions d'accès (import, cases cochées, sauvegarde)
├─ features/          Écrans (Accueil, Importer, Courses, Session, Cuisine, Recettes, Réglages…)
├─ ui/                Composants communs et minuteurs
└─ app/               Routage (hash), mise en page, hooks
scripts/              JSON Schema, validation en ligne de commande, icônes, table Ciqual
public/data/          Extrait de la table Ciqual 2025 (Licence Ouverte Etalab 2.0)
fixtures/             Exemple : semaine 1 de novembre 2026 convertie au format v1
tests/e2e/            Parcours mobile Playwright
```

### Choix techniques

React 19 + TypeScript strict + Vite ; PWA via `vite-plugin-pwa` (tout est pré-caché) ;
IndexedDB via Dexie ; validation et JSON Schema via Zod 4 ; routage par hash (compatible GitHub
Pages) ; CSS natif avec variables (clair/sombre, contrastes AA, cibles tactiles ≥ 44 px) ; Vitest.

Chaque enregistrement local porte `majLe`, `appareil` et peut porter `supprimeLe` : la
synchronisation entre deux téléphones pourra fusionner enregistrement par enregistrement.

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` teste, construit et publie l'app à chaque push sur
`main`. Dans le dépôt GitHub : **Settings → Pages → Source : GitHub Actions**.

## Feuille de route

- ~~Itération 2~~ (faite) : vue Gantt de la session ; notation des recettes avec historique, tri,
  filtre et export des notes pour Claude (Réglages → Exporter les notes ; consigne à ajouter à la
  skill dans `docs/mise-a-jour-skill.md`).
- ~~Itération 3~~ (faite) : nutrition par portion et par personne depuis Ciqual 2025, objectifs
  d'énergie et de protéines, étiquettes nutritionnelles calculées, étiquettes modifiables, export
  de la bibliothèque.
- **Itération 4** : Open Food Facts pour les produits de marque ; composer un plan dans l'app ;
  proposition automatique du calendrier.
- **Itération 5** : synchronisation entre les deux téléphones.

## Limites connues

- Les quantités de la fixture de novembre suivent le document source : quand il ne donne qu'un
  total (herbes, tomates séchées), la ligne de recette est `null` et le total est en courses
  supplémentaires. La butternut est pesée épluchée dans les étapes (1,3 kg) alors que les courses
  du document indiquent « 2 moyennes (~2 kg) » : l'écart vient de la source.
- Écran allumé : dépend du navigateur (voir plus haut pour iOS).
- Nutrition : la masse après cuisson n'est pas connue (seuils « pour 100 g » sur la masse pesée) ;
  les acides gras trans ne sont pas dans Ciqual ; Open Food Facts (produits de marque) n'est pas
  encore branché.
- `npm audit` signale des vulnérabilités modérées dans des dépendances de **build** de
  `vite-plugin-pwa` (glob/minimatch de workbox-build) ; elles ne sont pas incluses dans l'app.

## Sources

- Durées de conservation par défaut : [FoodSafety.gov — Cold Food Storage Chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts),
  [NSW Food Authority — Leftovers](https://www.foodauthority.nsw.gov.au/node/23948),
  [Food Standards Scotland — Food storage](https://www.foodstandards.gov.scot/consumer-advice/food-safety/food-safety-in-the-kitchen/food-storage).
- Données nutritionnelles : ANSES, *Table de composition nutritionnelle des aliments Ciqual 2025*,
  publiée le 19/11/2025, [doi:10.57745/RDMHWY](https://doi.org/10.57745/RDMHWY),
  [Licence Ouverte Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) ;
  extrait réutilisé sans modification des valeurs (`public/data/ciqual-2025.json`).
- Seuils des étiquettes : [Commission européenne — allégations nutritionnelles (annexe du règlement (CE) 1924/2006)](https://food.ec.europa.eu/food-safety/labelling-and-nutrition/nutrition-and-health-claims/nutrition-claims_en).

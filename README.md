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
| Repas | « Quand manger quoi » du dimanche soir au jeudi (réglable), avec J+n et un statut de conservation par repas. |
| Courses | Quantités agrégées par ingrédient, triées par rayon, à cocher ; détail par recette. |
| Placard | Liste mensuelle à vérifier, avec ce que les recettes du mois en utilisent. |
| Planning | Dans Session : Gantt d'une ligne par tâche (bleu : actif, vert : cuisson passive, rouge : à surveiller), calculé à partir des étapes, y compris celles modifiées dans l'app. Toucher une barre affiche l'étape ; « Agrandir en paysage » ouvre le planning en plein écran, tourné, tout tient à l'écran. |
| Session | « À sortir » à cocher (frigo, congélateur, légumes, placard, ustensiles ; compteur et « Tout décocher ») et étapes horodatées par tranches de 30 min, poste en couleur, ingrédients en gras. Bouton **Réorganiser** : déplacer une étape (n° ou flèches), changer son heure, modifier son texte, la scinder, ou la fusionner avec la suivante. |
| Mode cuisine | Gros texte, écran maintenu allumé (Screen Wake Lock), minuteurs avec rappels (vibration + bip), étapes à cocher, chrono de session. **Heure de début** facultative : les étapes affichent alors l'heure réelle (14:30, 14:35…). |
| Recettes | Bibliothèque (recherche, filtres végétarien / féculent / saison / note, tri par nom, goût, facilité ou dernière fois cuisinée), fiche avec portions ajustables et **notes** (facilité et goût de 1 à 5 par personne, commentaire, date, historique et moyennes). |
| Réglages | Personnes et aliments exclus, durées de conservation (avec leur source), four (chaleur tournante, écart), Cook Expert, sauvegarde. |

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
- Parcours de bout en bout sur mobile émulé : `tests/e2e/parcours-mobile.cjs`, `reorganisation-mobile.cjs`, `edition-mobile.cjs`, `dependances-mobile.cjs`, `v2-mobile.cjs`, `sortir-mobile.cjs`, `ingredients-mobile.cjs` (mode d'emploi en tête de chaque fichier).
- Icônes : `node scripts/generer-icones.mjs` (Playwright requis).

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
│  ├─ reorganisation.ts Étapes modifiées dans l'app (ordre, heures, textes, scissions, fusions)
│  ├─ exclusions.ts   Aliments exclus par personne
│  └─ reglages.ts     Réglages par défaut sourcés, températures du four
├─ data/              IndexedDB (Dexie) et fonctions d'accès (import, cases cochées, sauvegarde)
├─ features/          Écrans (Accueil, Importer, Courses, Session, Cuisine, Recettes, Réglages…)
├─ ui/                Composants communs et minuteurs
└─ app/               Routage (hash), mise en page, hooks
scripts/              Génération du JSON Schema, validation en ligne de commande, icônes
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
- **Itération 3** : nutrition par portion depuis la table Ciqual de l'ANSES (kcal, protéines,
  lipides, AGS, glucides, fibres, sel ; source affichée ; ingrédients non trouvés signalés) ;
  profil et objectifs journaliers.
- **Itération 4** : Open Food Facts pour les produits de marque ; composer un plan dans l'app ;
  proposition automatique du calendrier.
- **Itération 5** : synchronisation entre les deux téléphones.

## Limites connues

- Les quantités de la fixture de novembre suivent le document source : quand il ne donne qu'un
  total (herbes, tomates séchées), la ligne de recette est `null` et le total est en courses
  supplémentaires. La butternut est pesée épluchée dans les étapes (1,3 kg) alors que les courses
  du document indiquent « 2 moyennes (~2 kg) » : l'écart vient de la source.
- Écran allumé : dépend du navigateur (voir plus haut pour iOS).
- `npm audit` signale des vulnérabilités modérées dans des dépendances de **build** de
  `vite-plugin-pwa` (glob/minimatch de workbox-build) ; elles ne sont pas incluses dans l'app.

## Sources

- Durées de conservation par défaut : [FoodSafety.gov — Cold Food Storage Chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts),
  [NSW Food Authority — Leftovers](https://www.foodauthority.nsw.gov.au/node/23948),
  [Food Standards Scotland — Food storage](https://www.foodstandards.gov.scot/consumer-advice/food-safety/food-safety-in-the-kitchen/food-storage).
- Table Ciqual (itération 3) : [ANSES — Ciqual](https://ciqual.anses.fr).

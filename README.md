# Garden Journal

**`gladys-garden-journal`** — un carnet local pour les plantes de la maison, du balcon et du jardin, intégré à **Gladys Assistant ≥ 5.2.0**.

![Garden Journal](cover.jpg)

Une fiche par plante ou par lot, des emplacements, un historique des soins et des déplacements, des rappels à vérifier et des alertes météo ciblées. Un rappel d’arrosage invite à vérifier la terre : il ne déclenche pas un arrosage automatique.

- Inventaire : nom, espèce, quantité, emplacement, intérieur/extérieur, pot/pleine terre, phase et notes.
- Déplacements datés et durée passée dehors ; archivage réversible.
- Soins : arrosage, engrais, rempotage, taille, inspection, récolte.
- Rappels individuels, report sans enregistrer un faux soin, récapitulatif quotidien.
- Météo via **l’API de Gladys et son fournisseur actif**, avec seuils froid/chaleur/vent par plante.
- **4 widgets**, **5 déclencheurs**, **4 actions de scène** ; formulaires natifs FR/EN.
- SDK **0.15** : notes de soin et durée du report depuis le widget, sélection native des maisons.
- Volume local `/data`, écritures atomiques, export/import et sauvegardes.

## État et installation

Le projet part du [template JavaScript officiel](https://github.com/GladysAssistant/integration-template-js) et utilise le [SDK officiel](https://github.com/GladysAssistant/integration-sdk-js). Le code source est hébergé dans [valentinhttr/gladys-garden-journal](https://github.com/valentinhttr/gladys-garden-journal). La première release est **v1.0.0**, avec l’image `ghcr.io/valentinhttr/gladys-garden-journal:1.0.0` pour AMD64 et ARM64. **L’intégration n’est pas inscrite au catalogue Gladys.**

[Guide français](docs/fr.md) · [English guide](docs/en.md) · [Sécurité](SECURITY.md) · [Changelog](CHANGELOG.md) · [Contribuer](AGENTS.md)

### Développement local

Node 22 ou 24. Les trois variables `GLADYS_*` proviennent de l’installation en mode développeur de Gladys ; le superviseur les injecte automatiquement en conteneur.

```bash
npm ci
export GLADYS_HOST_API_URL=http://localhost:1443
export GLADYS_INTEGRATION_SELECTOR=gladys-garden-journal
# Fournir GLADYS_INTEGRATION_TOKEN dans l’environnement, sans le committer.
export GARDEN_DATA_DIR="$PWD/data"
npm start
```

`GARDEN_DATA_DIR` est réservé au développement/aux outils hors conteneur ; en production, le stockage est `/data`. Une seule instance doit écrire dans un dossier de données.

```bash
npm run format:check
npm run lint
npm test
docker build -t gladys-garden-journal:local .
```

Les tests sont hors réseau : règles métier, persistence, SDK simulé, contrats du manifeste et des widgets, indisponibilité météo, unités, sauvegardes et déduplication. Le schéma officiel du manifeste est conservé dans `test/fixtures/manifest.schema.json`. La validation de schéma ne remplace pas un essai sur une instance Gladys ≥ 5.2.0.

## Météo : contrat et limite actuelle

Garden Journal fait un `GET /api/v1/house/:house_selector/weather` sur **le même hôte Gladys que le SDK**. Par défaut, Gladys choisit son fournisseur ; `provider` permet de fixer un service avec `?service=...`. Toute intégration météo respectant le format commun de Gladys peut donc alimenter le carnet, selon les champs qu’elle fournit.

Le SDK 0.15 n’expose pas de lecture météo avec le jeton d’intégration. Cette version utilise une **clé API utilisateur Gladys distincte**, stockée dans un champ `secret`. Le cœur vérifié exige actuellement la portée **`dashboard:write`**, même pour cette route GET : cette clé a donc des droits plus larges que la météo. Elle est facultative et révocable ; le carnet fonctionne sans elle. Une future route météo limitée aux intégrations permettra de supprimer ce besoin. Voir les étapes et alternatives dans les guides.

Aucun appel direct à Open-Meteo, Météo France ou autre fournisseur n’est effectué. Le manifeste porte le transport **`local`** ; le fournisseur météo choisi peut lui-même dépendre d’Internet. Sans données utilisables, aucune conclusion de sécurité n’est affichée.

## Workflows

- `ci.yml` : formatage, lint, tests sur Node 22/24, build Docker sur les PR, admission au catalogue après publication.
- `build.yml` : image `linux/amd64` et `linux/arm64`, GHCR ; lancement manuel avec un tag de test, ou publication sur tag de version.
- `release.yml` : version, manifeste, changelog, commit et tag, puis image et GitHub Release.
- `github-release.yml` : création des releases manquantes ; Dependabot met à jour npm et les actions GitHub.

Le compte de publication est configuré sur `valentinhttr`. Pour installer la release, ouvrez **Intégrations → Installer une intégration → Mode développeur** dans Gladys **5.2.0 minimum**, puis collez le [manifeste v1.0.0](https://raw.githubusercontent.com/valentinhttr/gladys-garden-journal/v1.0.0/gladys-assistant-integration.json). Vérifiez que la machine Gladys peut télécharger l’image depuis GHCR. Vous pouvez aussi utiliser le développement local ou construire l’image avec la commande ci-dessus. Pour une installation locale en conteneur, l’image doit être présente sur la machine Docker utilisée par Gladys ; utilisez `gladys-garden-journal:local` comme `docker_image` dans une copie du manifeste fournie au mode développeur.

L’inscription au catalogue est reportée : ne pas ajouter le topic `gladys-assistant-integration`. `STORE_PUBLISHED` reste désactivé. L’ajout au catalogue demandera une autorisation explicite. La validation locale du manifeste reste toujours active.

## Architecture

`src/journal.js` porte le métier ; `store.js` la persistance ; `weather.js` la lecture météo et les conversions ; `engine.js` les échéances et événements ; `widgets.js` les composants natifs ; `runtime.js` branche ces modules au SDK. Les scènes qui enregistrent un soin ou un déplacement n’émettent pas d’événement de même nature, pour éviter une boucle.

Limites de cette première version : 500 fiches, 20 000 entrées d’historique, 16 Mio par journal ; pas de diagnostic botanique, d’identification photo ni de pilotage automatique d’arrosage. Les phases sont manuelles et ne prescrivent aucun soin. Les photos, capteurs, acclimatation et mode vacances sont des évolutions possibles, pas des fonctions déjà implémentées.

Licence Apache-2.0. L’intégration ne revendique aucune affiliation avec un fournisseur météo.

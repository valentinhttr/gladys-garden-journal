# Garden Journal — guide utilisateur

Garden Journal (`gladys-garden-journal`) gère les plantes de votre maison et de votre jardin dans Gladys Assistant **5.2.0 ou plus récent**. Les formulaires, widgets et scènes sont ceux de Gladys ; aucun site ni compte supplémentaire n’est nécessaire pour le carnet local.

## Première plante

1. Ouvrez **Intégrations → Garden Journal → Configuration**.
2. Dans **Ajouter une plante ou un lot**, donnez un nom, une quantité et un emplacement (par exemple Salon ou Terrasse). Choisissez intérieur/extérieur et pot/pleine terre. L’espèce, les notes et la phase sont facultatives.
3. Ouvrez **Découverte** et ajoutez l’appareil correspondant à la plante. Cette étape alimente les listes de sélection des formulaires, widgets et scènes. Chaque fiche a un identifiant durable indépendant de son nom.
4. Dans Configuration, utilisez **Configurer un rappel de soin**. Choisissez la plante, le soin et un intervalle en jours. Sans première échéance précisée, la première vérification arrive après cet intervalle.
5. Ajoutez les widgets Garden Journal au tableau de bord.

Une fiche peut représenter un lot de 12 tomates : les soins et rappels concernent alors le lot entier. Les lots ne sont pas divisés automatiquement. Pour suivre deux groupes différemment, créez deux fiches et ajustez leurs quantités.

Les emplacements sont des libellés libres, distincts des pièces Gladys. Utilisez exactement le même libellé pour regrouper les plantes. La date de départ correspond à l’ajout ; si la plante est déjà dehors, « dehors depuis » signifie « suivie dehors depuis son ajout ». Une observation peut préciser son historique antérieur.

## Soins, étapes et déplacements

**Noter un soin réalisé** enregistre arrosage, engrais, rempotage, taille, inspection ou récolte. Une observation peut accompagner le soin. Par défaut, la date est maintenant. Une date passée utilise ISO 8601 avec fuseau horaire, par exemple `2026-10-12T09:00:00+02:00`. Une date future est refusée. Si un rappel existe, son échéance se recalcule à partir du dernier soin réellement réalisé ; saisir un soin plus ancien n’écrase pas un soin récent.

Un rappel d’arrosage signifie **vérifier les besoins**, pas arroser systématiquement. Si la terre est encore humide, utilisez **Reporter un rappel** ou **Reporter le contrôle** dans le widget. Cela ne crée pas un faux arrosage. Les intervalles sont des durées de 24 heures ; seul le récapitulatif suit une heure civile dans le fuseau choisi.

**Modifier la plante et ses seuils** permet de changer le nom, l’espèce, la quantité, les notes et la phase : semis, croissance, floraison, fructification, repos. Les champs vides conservent les valeurs actuelles. Les phases sont manuelles et n’ajustent pas automatiquement les soins. Pour une pause saisonnière, désactivez les rappels concernés ; leur réactivation crée une nouvelle échéance.

**Enregistrer un déplacement** conserve le nouvel emplacement et la date. Un déplacement extérieur → extérieur conserve la date de sortie initiale. Une rentrée met fin au séjour dehors ; la prochaine sortie démarre un nouveau séjour. L’historique conserve les déplacements précédents. Une suggestion météo ne déplace jamais une plante toute seule.

**Archiver ou restaurer** suspend les rappels et risques d’une fiche sans effacer son historique. Pour restaurer, choisissez la plante et désactivez « Archivée ». Son appareil reste disponible dans Gladys ; les rappels anciens peuvent redevenir immédiatement échus. Garden Journal ne supprime pas vos appareils ou scènes. Un changement de nom dans le carnet ne renomme pas automatiquement l’appareil déjà ajouté dans Gladys.

## Météo via Gladys

Le carnet utilise l’API météo commune de Gladys, donc son fournisseur automatique ou le service explicitement sélectionné. Aucune clé du fournisseur météo n’est demandée dans Garden Journal. Une intégration externe météo peut fonctionner avec lui si elle alimente le format météo normalisé de Gladys.

**Limite actuelle :** le SDK 0.15 ne propose pas de lecture météo avec le jeton d’intégration. L’API utilisateur `GET /api/v1/house/:house_selector/weather` demande une clé API Gladys distincte. Le cœur actuellement vérifié exige la portée `dashboard:write` pour cette route, malgré la lecture seule. Cette clé est donc plus puissante qu’une clé limitée à la météo. Si vous ne souhaitez pas la fournir, laissez la météo désactivée : inventaire, soins, rappels, journal et scènes de soins restent disponibles.

Configuration :

1. Configurez les coordonnées de la maison et vérifiez que le widget météo normal de Gladys fonctionne.
2. Dans Configuration, choisissez **Maison par défaut** dans la liste des maisons Gladys. Le carnet conserve son identifiant stable ; aucune copie manuelle n’est nécessaire.
3. Créez une clé API Gladys dédiée à Garden Journal. L’API officielle est `POST /api/v1/session/api_key`, authentifiée par votre session utilisateur, avec le corps `{"scope":["dashboard:write"],"useragent":"Garden Journal"}`. Utilisez une interface de gestion de clés si votre version en fournit une pour cette portée. Une clé MCP limitée à `mcp` et la clé Open API Gladys Plus ne sont pas interchangeables avec cette clé. N’insérez aucun secret dans le dépôt ou dans un message public.
4. Dans Configuration, choisissez **Maison par défaut** et renseignez **Clé API Gladys**, puis activez les vérifications météo. Le champ de clé est de type `secret` et géré par Gladys.
5. Laissez le service fournisseur vide pour le mode automatique. Pour le fixer, utilisez son `service_name` renvoyé par `GET /api/v1/weather/provider` (par exemple le service de votre intégration météo, pas son titre).
6. Lancez **Tester / actualiser la météo Gladys**. Une erreur 401 correspond notamment à une clé invalide, révoquée ou sans la portée nécessaire ; une maison inconnue ou un fournisseur arrêté empêchent aussi la lecture.
7. Configurez les seuils de chaque plante avec **Modifier la plante et ses seuils**. Aucun seuil botanique n’est inventé. « Effacer les seuils existants » permet de repartir sans alertes pour cette plante.

La maison facultative d’une fiche remplace celle par défaut. Lors d’un déplacement, une maison vide conserve l’association existante. Le fournisseur est commun à l’intégration. Le transport déclaré est `local` : seul Gladys est interrogé ; sa source météo peut être cloud.

Les températures sont normalisées en °C et le vent en km/h, même si le compte Gladys utilise les unités américaines. Les seuils sont inclusifs : minimum ≤ seuil de froid, maximum ≥ seuil de chaleur, vent ≥ seuil de vent. Les prévisions horaires sont limitées à l’horizon choisi. Les prévisions journalières couvrent les journées civiles touchées par cet horizon, donc peuvent inclure des heures au-delà de celui-ci. Les données actuelles sont également prises en compte. Sans prévision, un risque actuel peut être signalé, mais le widget mentionne l’absence de prévision de température.

Seules les plantes dehors et actives sont évaluées. Pour le froid, une plante en pot reçoit « À rentrer » ; une plante en pleine terre reçoit « À protéger ». Les risques de chaleur et vent demandent une protection. L’action concrète reste votre décision. Une prévision absente ou périmée ne devient jamais une valeur nulle ni une promesse d’absence de risque. Les champs que le fournisseur n’expose pas ne peuvent pas être évalués. Une panne garde le dernier cache pendant sa durée maximale ; ensuite, il est inutilisable.

## Widgets

- **Inventaire des plantes** : quantités, fiches, intérieur/extérieur, détails et notes. Filtre facultatif par emplacement et inclusion des archives.
- **Soins à vérifier** : rappels arrivés à échéance. Les boutons concernent uniquement la première tâche de la page, identifiée dans le texte. « Noter le soin réalisé » ouvre un formulaire avec une observation facultative puis demande confirmation ; « Reporter le contrôle » permet de choisir de 1 à 365 jours (1 par défaut), sans enregistrer de soin.
- **Plantes à protéger** : plante, risque, valeur, seuil et conseil, avec indication des données indisponibles et des seuils non configurés.
- **Journal d’une plante** : emplacement, phase, date de sortie, statut et événements datés.

Chaque liste affiche 8 éléments par page. Changez **Page** dans les paramètres du widget, ou créez plusieurs widgets filtrés par emplacement. Les formulaires d’ajout et de modification des plantes se trouvent dans Configuration. Le widget de soins permet de saisir une observation ou la durée du report après avoir cliqué sur le bouton. Ces formulaires nécessitent Gladys 5.2 ; une action sans formulaire est refusée. Le contenu se renouvelle au plus tard après 60 secondes ; les modifications demandent aussi un rafraîchissement immédiat.

Les appareils virtuels exposent le nombre de soins à vérifier et le nombre de jours dehors. Ce sont des indicateurs calculés, pas des capteurs physiques. Le nombre de jours dehors revient à zéro à la rentrée ou à l’archivage.

## Scènes et notifications

Les notifications passent par vos scènes Gladys et les canaux déjà installés. Aucune notification n’est envoyée avant leur configuration.

| Déclencheur                       | Variables principales                                                  |
| --------------------------------- | ---------------------------------------------------------------------- |
| Soin à vérifier                   | `name`, `care`, `due_at`, `location`                                   |
| Risque météo pour une plante      | `name`, `risk`, `value`, `threshold`, `location`, `advice`, `forecast` |
| Soin enregistré manuellement      | `name`, `care`, `at`                                                   |
| Plante déplacée manuellement      | `name`, `location`, `environment`                                      |
| Récapitulatif quotidien du jardin | `date`, `due_count`, `risk_count`, `plant_count`                       |

Exemple : déclencheur **Risque météo pour une plante**, filtré sur froid, puis action de votre canal de notification : `À vérifier : {{triggerEvent.data.name}} — {{triggerEvent.data.value}} °C, seuil {{triggerEvent.data.threshold}} °C.` Les variables des déclencheurs « care » portent les clés `water`, `fertilize`, `repot`, `prune`, `inspect`, `harvest`. Les conseils météo sont `bring_inside` et `protect`.

Pour un message quotidien sans multiplication de notifications, utilisez seulement **Récapitulatif quotidien** : `Jardin : {{triggerEvent.data.due_count}} soins à vérifier et {{triggerEvent.data.risk_count}} risques météo.` Choisissez le fuseau IANA et l’heure dans Configuration. Aucun résumé n’est émis s’il n’y a rien à vérifier au premier contrôle après cette heure. Après un arrêt, seul le jour courant est rattrapé.

Actions disponibles : **Noter un soin réalisé**, **Enregistrer un déplacement**, **Reporter un rappel**, **Tester / actualiser la météo Gladys**. Elles renvoient `updated`. Un soin/déplacement venant d’une scène n’émet pas le déclencheur manuel correspondant, afin d’éviter les boucles. Ne reliez pas automatiquement « risque de froid » à « déplacer dedans » : cela enregistrerait un déplacement que personne n’a réellement effectué.

Une échéance et un épisode météo ne déclenchent qu’un événement chacun, y compris après redémarrage. Un risque peut se déclencher à nouveau après un retour mesuré sous le seuil, un changement de seuil ou un déplacement. Les événements en attente sont persistés et réessayés ; un arrêt exactement entre réception par Gladys et acquittement local peut produire un doublon. Ils conviennent à des notifications, pas à des commandes irréversibles.

## Sauvegarde et restauration

Les données sont dans `/data/journal.json`. Le bouton **Créer une sauvegarde locale** écrit dans `/data/backups`, conserve les 10 dernières sauvegardes et n’exporte pas la configuration ni les clés API. Copiez une sauvegarde hors de la machine pour la protéger d’une perte du disque. Le volume peut être supprimé lors de la désinstallation de l’intégration : sauvegardez auparavant.

Les outils hors ligne utilisent Node 22+ et le même code que le service. **Arrêtez l’intégration avant de les utiliser**, et indiquez le dossier de données monté par Gladys :

```bash
GARDEN_DATA_DIR=/chemin/vers/les/donnees npm run backup -- export /chemin/sauvegarde.json
GARDEN_DATA_DIR=/chemin/vers/les/donnees npm run backup -- import /chemin/sauvegarde.json --replace
```

L’export refuse d’écraser un fichier existant. L’import valide le format et sauvegarde d’abord le journal actuel ; il remplace ensuite l’ensemble du carnet. Les événements en attente et le cache météo ne sont pas restaurés. Les identifiants de plantes sont conservés ; gardez aussi le même identifiant d’intégration pour préserver les appareils/scènes Gladys. Les rappels échus peuvent de nouveau notifier après un import.

Le fichier est écrit atomiquement avec synchronisation disque. Un journal corrompu bloque le démarrage et n’est pas réinitialisé silencieusement. Arrêtez le service, renommez le fichier corrompu pour le conserver hors de `journal.json`, puis importez une sauvegarde valide. Les limites sont 10 maisons spécifiques en plus de celle par défaut, 500 fiches, 20 000 événements historiques et 16 Mio. Aucun historique n’est effacé automatiquement ; une fois la limite atteinte, exportez puis réduisez l’historique dans une copie hors ligne avant de la réimporter. Archiver une plante ne libère pas sa place dans le journal.

## Publication et limites de validation

Le manifeste exige une image publiée pour installer depuis le catalogue. Le dépôt public est `valentinhttr/gladys-garden-journal`, mais aucune image ni release n’est publiée et l’inscription au catalogue est reportée. Pour un essai local, construisez l’image sur la machine Docker de Gladys et indiquez `gladys-garden-journal:local` dans une copie du manifeste utilisée en mode développeur. Ne confondez pas la validation locale du manifeste avec une publication effective ou une installation testée sur votre instance.

La licence du projet est Apache-2.0. Les conditions et attributions des données météo restent celles du fournisseur configuré dans Gladys. Les photos, identification d’espèce, diagnostic, capteurs, pilotage d’arrosage et mode vacances ne sont pas implémentés dans cette version.

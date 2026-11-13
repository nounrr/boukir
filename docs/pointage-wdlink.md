# Connexion de la pointeuse Wdlink au VPS

L’appareil annoncé est une **WDU505PROFP**, installé au magasin, et l’application tourne sur un VPS Hostinger. L’intégration préparée utilise les callbacks HTTP du SDK fourni. La connexion locale a été vérifiée sur le firmware `OS-V500.2106` ; plusieurs paramètres diffèrent de la documentation générique. La réception complète d’un passage réel sur le VPS reste à valider.

## Fonctionnement préparé

La pointeuse envoie chaque reconnaissance au serveur. Le serveur conserve l’identifiant sur l’appareil, l’employé associé, la date et l’heure, le mode de reconnaissance et le sens du passage. Les renvois identiques ne créent aucun doublon. Les passages reçus avant l’association à un employé sont conservés et rattachés lors de l’association.

Le journal et le formulaire d’association sont dans « Pointage & absences », pour les personnes ayant le droit de gestion des absences. Les absences et les retenues manuelles restent indépendantes. Aucun calcul de salaire ne repose sur ces nouveaux passages.

Les empreintes et modèles biométriques restent sur l’appareil. À la demande de l’utilisateur, les photos capturées lors des passages sont conservées séparément dans la table privée `pointage_event_photos` et accessibles uniquement avec les droits de gestion du pointage. L’enrôlement des employés se fait pour cette première version sur la pointeuse. Il n’y a pas encore de synchronisation automatique des employés ni de récupération des archives antérieures à la configuration du callback.

## Paramètres dans l’application

Une fois la version déployée, ouvrir **Pointage & absences → Paramètres de la pointeuse** avec le compte PDG. Les paramètres restent modifiables depuis l’application :

- Numéro de série (`deviceKey`) de la pointeuse.
- IP locale au magasin, conservée comme référence pour le réglage local.
- Firmware, conservé comme référence pour confirmer la compatibilité.
- Fuseau horaire, initialement `Africa/Casablanca`.
- Codes des statuts entrée et sortie, à confirmer sur l’appareil.
- Sens de secours, laissé « à confirmer » par défaut.

Le premier enregistrement génère une adresse de réception sur `https://boukirdiamond.com` (le domaine public qui partage le même backend). Copier cette adresse dans la configuration callback de la pointeuse au magasin. Le secret de cette adresse n’est affiché qu’à sa génération et seul son hash est conservé dans la table de configuration. Une sauvegarde ordinaire conserve l’adresse existante ; « Remplacer l’adresse de réception » ou un changement de numéro de série en génère une nouvelle et invalide l’ancienne. Reporter alors la nouvelle adresse dans l’appareil.

Les paramètres sont enregistrés dans MySQL, ils persistent après redémarrage du serveur. Les tables `pointage_device_config`, `pointage_identities` et `pointage_events` sont créées à la première utilisation ; le compte MySQL doit pouvoir créer des tables. Le formulaire de configuration est réservé au PDG, et le journal et les associations au droit de gestion des absences.

L’adresse de réception contient un secret d’accès machine. Le backend ne journalise pas cette route ; masquer également son chemin dans les journaux du proxy du VPS, par exemple `access_log off;` dans le bloc Nginx dédié. Ne pas exposer directement le port de la pointeuse sur Internet.

Le magasin doit pouvoir joindre le domaine public du VPS en HTTPS. Le VPS n’a pas besoin d’initier une connexion à l’adresse privée de l’appareil pour recevoir ses nouveaux passages. La prise en charge HTTPS/certificat du firmware doit être vérifiée. Si elle ne fonctionne pas, prévoir une passerelle locale ou un VPN.

Une configuration initiale par variables d’environnement reste disponible si aucun paramètre n’a été enregistré dans l’application : `WDLINK_DEVICE_KEY`, `WDLINK_CALLBACK_TOKEN` (secret aléatoire base64url de 43 caractères minimum), `WDLINK_TIMEZONE`, `WDLINK_DIRECTION` et `WDLINK_ATTENDANCE_MAP` (objet JSON). Les réglages enregistrés dans l’application sont prioritaires.

## Configuration de l’appareil après vérification du firmware

Source locale : `sdk wdlink/API(http)-20261112T165618Z-1-001/API(http)/DEVICE LAN VERSION INTERFACE DOCUMENT V5.1.14.docx`, sections 2.13 et 2.34.

Depuis un ordinateur sur le même réseau local que la pointeuse, l’API documentée permet de configurer le callback avec `POST http://IP_APPAREIL:8090/setIdentifyCallBack` en formulaire `application/x-www-form-urlencoded`, avec le mot de passe appareil `pass`. Sur le firmware `OS-V500.2106` testé, le champ de l’adresse est **`callbackUrl`**, et non `url`. Ajouter `base64Enable=2` pour transmettre la photo capturée dans le callback lorsque l’affichage des photos est activé. La configuration et sa relecture par `GET /device/callback` ont été vérifiées sur cet appareil. Ne pas appeler les interfaces de remise à zéro, suppression ou mise à jour du SDK.

Le callback attendu contient `deviceKey`, `personId`, `time` (timestamp Unix en millisecondes), `type` (`face_0`, `finger_0`, etc.) et éventuellement `attendance`. Le serveur répond exactement `{"result":1,"success":true}` après enregistrement. Selon la section 2.13, l’appareil renvoie les callbacks non acquittés toutes les dix minutes. Les événements doivent réellement être enregistrés avant cette réponse ; en cas d’erreur SQL, le serveur renvoie un échec pour permettre la reprise.

Vérifier l’heure et le fuseau de l’appareil par un passage réel. Le serveur traite `time` comme un timestamp Unix et en déduit le jour et l’heure en `Africa/Casablanca`. Un firmware qui envoie une heure locale déguisée en timestamp nécessite un adaptateur confirmé par ce test.

## Sens des passages

Le champ `type=face_0` indique une reconnaissance réussie ; le suffixe 0 n’indique pas une entrée. Le sens dépend des statuts de présence réellement configurés sur l’appareil.

Après confirmation que le statut 1 signifie entrée et le statut 2 sortie, renseigner ces codes dans les paramètres de l’application. L’équivalent pour le mode de configuration par environnement est :

```dotenv
WDLINK_ATTENDANCE_MAP={"1":"entree","2":"sortie"}
```

Les autres codes restent « Sens à confirmer ». Pour un appareil physiquement dédié à un seul sens, `WDLINK_DIRECTION=entree` ou `sortie` permet ce classement de secours. Aucun basculement automatique « premier scan entrée, deuxième sortie » n’est appliqué : les pauses et les scans répétés rendraient cette supposition ambiguë.

## Vérification sur place

1. Confirmer la version du firmware, l’adresse IP locale et le numéro de série de la WDU505PROFP.
2. Déployer les fichiers backend et frontend, redémarrer le backend puis renseigner les paramètres dans l’application.
3. Vérifier l’accès HTTPS depuis le magasin et définir le callback sur l’appareil.
4. Enrôler un employé sur la pointeuse puis associer son `personId` dans la page Pointage & absences.
5. Faire une entrée et une sortie par visage puis empreinte. Comparer date, heure et sens avec l’affichage de l’appareil.
6. Couper puis rétablir Internet au magasin et vérifier le renvoi sans doublons. La conservation hors ligne dépend du firmware et de sa capacité ; elle reste à valider sur cet appareil.

## Vérification locale du code

`node --test backend/utils/pointage.test.js` couvre la normalisation du SDK, les changements de jour au Maroc, les rejets, l’authentification machine, la déduplication, la reprise après erreur SQL et l’absence de modèles biométriques dans les données du journal, les paramètres modifiables réservés au PDG et la rotation du secret de callback. Ces tests utilisent une base simulée ; le test avec MySQL et la pointeuse reste requis avant mise en service.


## Observations sur le firmware OS-V500.2106

- Numéro de série relevé : `E03C1CB9EF325611` ; IP locale constatée : `192.168.110.187`.
- La lecture des statuts fonctionne avec **GET** `/device/getAttendanceStatus` et le paramètre `pass`, contrairement au POST indiqué dans le document générique.
- L’activation fonctionne avec POST `/device/setAttendanceStatus`, `enable=2`, `method=1` et la liste JSON des statuts. Les codes ont été conservés. Les libellés des heures supplémentaires ont été raccourcis pour respecter la limite de 32 caractères imposée par le firmware.
- L’appareil a confirmé l’enregistrement du callback HTTPS. Sa relecture correspond à l’adresse générée par l’application ; aucun secret de cette adresse n’est enregistré dans ce guide.
- Le test du récepteur sur le domaine du backoffice a reçu une erreur Nginx **400 No required SSL certificate was sent**. Cette erreur intervient avant le backend. Le domaine public `boukirdiamond.com` utilise déjà le même backend et accepte ce callback sans certificat client. Le générateur utilise désormais ce domaine, tout en conservant le secret d’authentification et la protection mTLS du backoffice.
- Aucun faux passage n’a été inséré pour tester la liaison. Un passage réel et le renvoi après coupure réseau restent à vérifier après correction du VPS.


## Domaine de réception et protection du backoffice

L’adresse de réception de la pointeuse utilise `https://boukirdiamond.com/api/pointage/wdlink/callback/SECRET`. Le backoffice reste accessible à `https://backoffice.boukirdiamond.com`, avec sa vérification de certificat client inchangée. Les deux domaines atteignent le même backend sur `127.0.0.1:3011`.

Pour une adresse générée avant ce correctif, remplacer seulement le domaine `backoffice.boukirdiamond.com` par `boukirdiamond.com` conserve le même secret et la même configuration serveur. Le premier enregistrement et les régénérations futures utilisent automatiquement le domaine public.

Le test sans événement utilise une reconnaissance refusée (`type=face_2`) du bon appareil. Le serveur la valide puis répond sans insérer de passage. Un secret erroné doit recevoir 401. La validation d’un véritable pointage nécessite toujours une reconnaissance physique sur la pointeuse.


## Format du statut sur OS-V500.2106

Les passages réels de ce firmware contiennent `attendance: { attendanceId: 1, attendanceStatus: "Entrée" }` ou le même objet avec l’identifiant 2 pour la sortie. Le connecteur extrait `attendanceId` et applique la correspondance des codes configurée dans l’application. Il continue d’accepter les codes simples des autres variantes du SDK. Les libellés traduits ne sont jamais utilisés pour deviner un sens.

Les passages dont le statut avait été enregistré comme `[object Object]` peuvent être réparés en les rapprochant des archives réelles de la pointeuse. Le rapprochement doit utiliser l’appareil, l’identifiant de la personne, le timestamp milliseconde et la méthode de reconnaissance, sans déduire une alternance entrée/sortie.


## Photos des passages

La colonne Photo du journal affiche les photos JPEG/PNG capturées au pointage. Un clic agrandit la miniature. La route `GET /api/pointage/events/:id/photo` exige un JWT valide et le droit de gestion des absences/pointages ; aucune image n’est publiée dans le répertoire public des uploads. Les réponses interdisent le cache.

Les images sont limitées à 2 Mo et 4096 pixels par côté. Le callback accepte un JSON de 4 Mo pour contenir l’image base64 ; la route Nginx de callback doit également autoriser `client_max_body_size 4m`. La photo est enregistrée séparément des événements ; une répétition du même callback ne crée pas de deuxième photo. Les chemins/URLs d’images envoyés par l’appareil ne sont jamais téléchargés par le VPS.

Sur la pointeuse, `POST /setIdentifyCallBack` avec `pass`, `callbackUrl` et `base64Enable=2` active l’envoi des photos. Les nouveaux passages peuvent alors apporter leur photo. Les anciens passages restent sans photo tant qu’aucune archive réelle correspondante n’a été récupérée. Aucun modèle d’empreinte ou de reconnaissance faciale n’est importé.


## Registre quotidien et employés obligés de pointer

Dans **Employés**, le PDG coche **Pointage obligatoire** sur les personnes concernées. L’activation commence au jour courant, dans le fuseau de la pointeuse ; elle ne crée pas d’absences rétroactives. La désactivation termine l’obligation au début du jour courant, tout en conservant les périodes passées dans `pointage_requirement_periods`. Aucun employé n’est coché automatiquement lors de l’installation.

Les réglages de l’appareil et l’association des identifiants sont séparés dans **Employés → Paramètres de la pointeuse** (`/employees/pointage-settings`). Les paramètres de connexion restent réservés au PDG ; les personnes autorisées à gérer les absences conservent l’association des identifiants.

La page **Pointage & absences** affiche par défaut **Présences du mois**, avec une ligne par employé et par date. Les employés obligés sont affichés chaque jour jusqu’à aujourd’hui, à partir de leur activation et de leur embauche. Les journées avec de vrais passages associés ou une absence saisie sont également conservées, même sans obligation. Les jours futurs ne sont pas marqués absents. Aucun calendrier de jours de repos n’est défini à ce stade : l’obligation s’applique à chaque jour calendaire de sa période.

- **Absent** : aucune entrée enregistrée pour la journée.
- **Présent** : une entrée ouvre une période de travail ; la sortie est encore attendue.
- **Travail terminé** : une sortie clôt la dernière période de travail.

La même cellule regroupe l’entrée et la sortie, avec les photos disponibles. Le temps de travail additionne les paires entrée/sortie ; les scans répétés dans le même sens ne redémarrent pas le compteur. Une période ouverte compte en direct uniquement pour aujourd’hui. Une sortie manquante sur une journée passée est signalée et aucun temps jusqu’au lendemain n’est inventé. Les durées utilisent les timestamps UTC pour rester correctes lors d’un changement d’heure.

Les filtres portent sur le mois, le jour, l’employé, l’état de présence et le nom/CIN. Les passages sans employé associé sont signalés dans **Passages détaillés** et ne sont attribués à personne par supposition. Les absences et retenues déjà saisies restent accessibles dans **Absences saisies**. Le registre automatique ne crée ni ne supprime de retenue sur salaire.

Les colonnes et tables nécessaires sont créées à la première utilisation, via `ensurePointageRequirementSchema` : `employees.pointage_obligatoire` (défaut 0) et `pointage_requirement_periods`. Le compte MySQL du backend doit pouvoir créer une table et ajouter une colonne. Le registre est calculé depuis ces périodes et les vrais passages ; il ne nécessite pas de tâche planifiée à minuit.

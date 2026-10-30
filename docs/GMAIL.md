# Capturer un mail Gmail dans Oshka

Le module Google Workspace **Oshka** ajoute le mail ouvert à l’Inbox dès son
ouverture, sans formulaire d’édition : objet, expéditeur, date, extrait de
500 caractères et lien vers la conversation Gmail. Tant que le panneau Oshka
reste ouvert, chaque mail consulté est ajouté automatiquement. Ferme le panneau
pour arrêter la capture. Un écran confirme chaque ajout ou propose de réessayer
en cas d’échec. Une nouvelle tentative sur le même mail ne crée pas une
seconde carte, même après rangement de la première.

Sur Mac : Gmail dans le navigateur, icône Oshka dans la barre à droite.
Sur iPhone : app Gmail, ouvre un mail puis trouve Oshka en bas du message.
Le module utilise Apps Script : les modules HTTP déployés via l’API Google
Workspace Add-ons ne prennent pas encore en charge les fonctionnalités iOS.

## Installation privée

Cette première version s’installe depuis un projet Apps Script ; elle n’est pas
encore distribuée dans Google Workspace Marketplace. Chaque compte Google doit
installer et autoriser le module. L’installation sur un compte est partagée entre
Gmail sur Mac et sur iPhone.

1. Crée un projet dans [Google Apps Script](https://script.google.com/home).
2. Remplace `Code.gs` par [`integrations/gmail/Code.gs`](../integrations/gmail/Code.gs).
   Dans ce fichier et dans le manifeste ci-dessous, remplace `<projet>` par l’ID
   du projet Firebase de ton instance.
3. Dans **Paramètres du projet**, active l’affichage du manifeste `appsscript.json`.
4. Dans l’éditeur, remplace le manifeste par
   [`integrations/gmail/appsscript.json`](../integrations/gmail/appsscript.json).
5. Enregistre, puis **Déployer → Tester les déploiements → Installer**.
6. Ouvre Gmail et autorise le module Oshka pour ce compte Google.

Ne partage pas le projet Apps Script ni son accès éditeur pour installer le
module sur d’autres comptes sans avoir décidé explicitement de leur donner ces
droits.

## Relier Oshka une fois

1. Dans Oshka : **Paramètres → Connexions et partage → Gmail → Créer un code de connexion**.
2. Dans Gmail : ouvre Oshka, colle ce code, puis **Connecter Oshka**.
3. Ouvre le mail à conserver puis le module **Oshka** : la carte est créée
   immédiatement avec l’objet du mail comme titre. Si un mail est déjà ouvert
   lors de la connexion, il est capturé dès la connexion réussie.

Le code est à usage unique et expire après 10 minutes. La connexion au compte
Oshka dure au maximum un an et peut être révoquée à tout moment depuis
**Déconnecter Gmail** dans Oshka. La révocation couvre tous les modules reliés à
ce compte Oshka ainsi que les codes non utilisés. Après révocation, le module
Gmail demande une nouvelle connexion lors du prochain ajout.

## Accès et stockage

- Gmail fournit un accès temporaire au message ouvert lorsque le module est utilisé.
- Le module ne recherche pas dans la boîte et ne lit pas les pièces jointes.
  Il ne demande aucun droit d’envoi, de suppression ou de modification des mails.
- Après connexion, ouvrir le module sur un mail transmet son objet, son
  expéditeur, sa date, son extrait, son lien et ses identifiants à Oshka. Changer
  de mail avec le panneau actif déclenche le même ajout automatique. La page
  d’accueil sans mail sélectionné n’effectue aucune capture.
- Le jeton Gmail temporaire ne quitte pas Apps Script. Le jeton Oshka est privé
  au compte Google (`UserProperties`) et n’autorise que l’ajout à l’Inbox.
- Oshka ne garde que les empreintes SHA-256 des codes et jetons, dans
  `gmail_link_codes` et `gmail_links`. Les reçus anti-doublon (`gmail_imports`)
  ne contiennent pas le texte du mail.
- Le lien source conserve le compte Gmail (`authuser`), pour éviter d’ouvrir une
  autre boîte lorsque plusieurs comptes Google sont connectés.

Le backend écrit le même document `boards/{uid}` que Slack. La limite existante
sur les écritures concurrentes du document complet est décrite dans
[SLACK.md](SLACK.md).

## Déploiement

```sh
npm run build:functions
npm test
npm run build
npx --yes firebase-tools@15.34.1 deploy --only functions:gmail,hosting,firestore:indexes --project <projet>
```

Aucun nouveau secret Firebase ni clé Gmail n’est nécessaire. Pour mettre à jour
le module privé, remplace les fichiers modifiés dans le même projet Apps Script,
enregistre puis ferme et rouvre le module dans Gmail. La connexion existante
reste conservée ; une correction limitée à `Code.gs` ne demande pas de modifier
le manifeste.

Le bouton **Réessayer**, affiché uniquement après un échec, lie sa carte à
l’identifiant canonique renvoyé par
`GmailApp.getMessageById(...).getId()`. Lors du clic, il relit le message courant
et compare cet identifiant canonique à celui de la carte. L’identifiant de
l’événement Gmail peut être de la forme `msg-f:...` : le comparer directement à
la valeur hexadécimale de `getId()` bloquait à tort chaque capture avec le message
« Le mail sélectionné a changé ». Le test du module reproduit les deux formats
et récupère les paramètres depuis le véritable bouton construit par le code.

Le serveur accepte les deux formes de liens Gmail : ceux avec un fragment
`#inbox/...` et les permaliens Apps Script de la forme
`https://mail.google.com/mail?extsrc=sync&client=docs&plid=...`. Exiger un `/`
final et un fragment rejetait ces derniers avec `invalid_mail` (HTTP 400).
Les tests du module vérifient désormais le contrat réel du validateur serveur.
Les diagnostics ne journalisent que le statut, le code d’erreur et le nom du
champ rejeté, jamais les valeurs du mail, les liens ni les jetons.

Documentation Google :
[installation et tests](https://developers.google.com/workspace/add-ons/how-tos/testing-workspace-addons),
[utilisation sur ordinateur et mobile](https://developers.google.com/workspace/add-ons/guides/using-addons),
[permissions temporaires Gmail](https://developers.google.com/workspace/add-ons/concepts/workspace-scopes),
[limites iOS de l’API Add-ons](https://developers.google.com/workspace/add-ons/overview).

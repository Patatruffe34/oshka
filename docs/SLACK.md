# Ajouter un message Slack à l’Inbox

Le message est choisi explicitement depuis son menu. Une fenêtre Slack permet
de modifier le titre, puis de confirmer l’ajout. La carte contient le texte et
le lien permanent du message, y compris pour une réponse dans un fil.
Aucun message n’est publié dans un canal par l’intégration.

## 1. Configurer l’app créée dans Slack

Dans **App Manifest**, importer le JSON de
[`functions/slack/manifest.json`](../functions/slack/manifest.json), après y avoir
remplacé `<projet>` par l’ID du projet Firebase, puis enregistrer. Cela configure :

- **Interactivity & Shortcuts** activé.
- Request URL : `https://<projet>.web.app/integrations/slack/interactions`.
- Un raccourci **On messages** : **Ajouter à Oshka**.
- Callback ID : `oshka_save_message`.
- **OAuth & Permissions → Bot Token Scopes** : uniquement `commands`.

Pas de scopes de lecture de l’historique, pas de `chat:write`, pas d’abonnement
aux événements. **Socket Mode** reste désactivé. Cette version utilise le token
d’une seule installation dans un workspace ; l’ajout à d’autres workspaces
nécessiterait un parcours OAuth multi-workspace supplémentaire.

## 2. Installer dans le workspace et configurer les secrets

Dans **Install App**, installer l’app dans le workspace choisi. Récupérer :

- **Basic Information → App Credentials → Signing Secret**.
- **OAuth & Permissions → Bot User OAuth Token** (commence par `xoxb-`).

Ne pas coller ces valeurs dans un chat, dans un fichier suivi par Git, ni dans
un argument de commande. Les commandes suivantes demandent chacune la valeur
de façon interactive et l’enregistrent dans Google Secret Manager :

```bash
npx --yes firebase-tools@15.34.1 functions:secrets:set OSHKA_SLACK_SIGNING_SECRET --project <projet>
npx --yes firebase-tools@15.34.1 functions:secrets:set OSHKA_SLACK_BOT_TOKEN --project <projet>
```

Exécuter les commandes une par une. Attendre l’invite **Enter a value for…**,
puis coller uniquement le secret et valider avec Entrée. Les caractères saisis
ne sont pas affichés. Attendre la confirmation de création de la version avant
de lancer la deuxième commande. Le CLI npm évite l’ancien binaire autonome
`/usr/local/bin/firebase` (13.4.0), qui ne présentait pas l’invite correctement.

## 3. Déployer le service et l’interface

Après configuration des deux secrets :

```bash
npm run build
npx --yes firebase-tools@15.34.1 deploy --only functions:slack,hosting,firestore:indexes --project <projet>
```

Le pré-déploiement Functions compile déjà les fonctions métier partagées.
Les règles Firestore existantes ferment toutes les collections de l’intégration
aux clients ; seul le service Admin peut les lire et les modifier. Les TTL
suppriment les codes et captures temporaires expirés.

## 4. Relier son compte Oshka

1. Dans Oshka : **Paramètres → Connexions et partage → Slack → Créer un code de connexion**.
2. Copier le code (valable 10 minutes, à usage unique).
3. Dans Slack, ouvrir le menu d’un message, puis **Ajouter à Oshka**.
4. Coller le code dans la fenêtre et confirmer.

Les captures suivantes demandent seulement la confirmation du titre. La liaison
porte sur le couple **workspace + utilisateur Slack**, jamais sur tout le
workspace. Chacun utilise son propre compte Oshka. **Déconnecter Slack** dans
Oshka retire les liaisons de ce compte et révoque ses codes en attente.

## Validation

Les tests couvrent le endpoint HTTP, les signatures HMAC, le rejet des requêtes
anciennes et des autres workspaces, la liaison à usage unique, les sessions
expirées, les captures atomiques et les répétitions sans doublon, même après
rangement de la carte. Le fichier `src/lib/__tests__/slack.test.js` nécessite
que le bundle métier ait été généré avec `npm run build:functions`.

`chat.getPermalink` utilise GET avec `channel` et `message_ts` en paramètres
d’URL. Un POST JSON renvoyait `invalid_arguments`, avant même l’ouverture de la
fenêtre. Le test HTTP reproduit ce refus : un mock qui accepte tous les verbes
ne couvre pas ce contrat. Le client partagé impose le verbe de chaque méthode.
Les logs conservent la méthode et le code d’erreur, sans contenu de message,
corps de réponse Slack, code de connexion ni token.

Avant de considérer l’installation validée, tester depuis le Slack réel sur
iPhone et Mac : un message de canal, une réponse dans un fil et un message privé,
puis retrouver le bon message via le lien de la carte. Vérifier aussi qu’un
second ajout ne crée pas de doublon. Un premier appel sur une fonction froide
peut nécessiter une nouvelle tentative si Slack expire son délai de 3 secondes.

Comme le serveur MCP, cette intégration écrit `boardJson` dans une transaction.
La limitation existante des deux rédacteurs décrite dans `ARCHITECTURE.md`
s’applique : une écriture de l’app déjà en vol peut encore remplacer un ajout
externe. Le correctif architectural de synchronisation reste distinct de cette
intégration ; un reçu de déduplication ne constitue pas une sauvegarde du board.

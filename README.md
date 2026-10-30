<div align="center">

# Oshka

**Des boards dans des boards.**

Un kanban où chaque carte contient un board entier, sans limite de profondeur.

</div>

---

## L'idée

Un board classique s'arrête à deux niveaux : des colonnes, des cartes. Quand une
carte devient un projet, il faut lui créer son propre board ailleurs, et le lien
entre les deux n'existe plus que dans votre tête.

Ici, **une carte *est* un board**. Ouvrez-la, elle a ses colonnes et ses cartes,
qui ont elles-mêmes les leurs. Le même geste sert à noter une tâche et à ouvrir
un projet, parce que c'est la même chose vue de plus ou moins loin.

D'où le nom — *matriochka*, la poupée russe. Le logo est un O qui s'ouvre le long
d'une couture, et l'animation de chargement le montre : la coque s'écarte, le
point du centre grandit et devient la poupée suivante.

## Le piège, et la réponse

Une arborescence sans fond finit par tout engloutir : on y range beaucoup, et on
n'y retrouve plus rien. Quatre vues répondent à ça, chacune à une question
différente.

| Vue | Répond à | Où |
|---|---|---|
| **Board** | *qu'est-ce qu'il y a ici ?* | la vue par défaut |
| **Plan** | *qu'est-ce qu'il y a en dessous ?* | l'arbre entier, dépliable |
| **Carte** | *quelle forme a tout ça ?* | une carte mentale radiale, la racine au centre |
| **Horizon** | *qu'est-ce que je fais maintenant ?* | tout l'arbre lu comme un calendrier |

**Horizon** est celle qui fait basculer l'outil. Elle rassemble les cartes de
tous les boards par échéance — aujourd'hui, demain, cette semaine, la semaine
prochaine, plus tard — et les rend déplaçables : poser une carte dans une voie
lui écrit sa date.

Sa dernière colonne ne liste pas ce qui n'a pas de date : ce serait la quasi
totalité de l'arbre. Elle liste **les branches à l'arrêt** — une carte dont le
board porte une colonne ✅ et où plus rien, nulle part en dessous, n'est engagé.
C'est ce qui mérite un « et la prochaine action, c'est quoi ? ».

## Ce que ça fait

**Sur une carte** — description en Markdown, commentaires, étiquettes partagées
par tout l'arbre, échéance, répétition, checklists, état terminé, archivage,
duplication, déplacement vers n'importe quel autre board.

Une carte peut revenir tous les *x* jours, semaines ou mois — la case se coche
sous l'échéance, parce que la répétition n'est pas une autre idée : c'est ce que
cette date fait ensuite. Et une carte qui revient n'est jamais terminée : la
cocher la reporte à sa prochaine occurrence et décoche ses checklists. Pour
arrêter la série, on retire la répétition.

**Sur un board** — colonnes colorées et nommées, glisser-déposer des cartes et
des colonnes, tri, filtre par étiquette, gabarits de départ, corbeille avec
restauration, annuler/rétablir.

**Partout** — recherche dans tout l'arbre, accès rapides, onglets pour garder
plusieurs boards ouverts, thème clair/sombre, français et anglais, et un mode
hors-ligne réel : les écritures sont mises en file et repartent au retour du
réseau.

**Conventions** — une colonne marquée ✅ signale un board qui progresse. Une
carte qu'on y dépose passe en terminée, et un board sans cette colonne n'est
jamais signalé comme à l'arrêt : une base de données ou une grille de réflexion
n'a pas d'état final, elle ne peut donc pas être en retard dessus.

## Raccourcis

Sur la carte survolée, sans rien ouvrir :

| Touche | Action |
|---|---|
| `R` | renommer |
| `E` | étiquettes |
| `D` | échéance |
| `A` | archiver |
| `M` | déplacer vers une autre colonne |

Et ailleurs : `⌘K` ou `/` pour chercher, `⌘Z` / `⇧⌘Z` pour annuler et rétablir,
`⌥1`…`⌥9` pour changer d'onglet. Un clic sur une carte l'ouvre, un double-clic
entre dans son board.

## Partager un lien depuis le téléphone

**iPhone / iPad** — Dans Oshka, ouvre **Paramètres → Connexions et partage →
iPhone / iPad**, puis installe le raccourci **Ajouter à Oshka**. Ouvre le fichier
téléchargé depuis les téléchargements de Safari ou l’app Fichiers pour l’ajouter
dans Raccourcis. Touche simplement le lien : un appui long affiche un aperçu.
Ensuite, dans Safari ou une autre app :
**Partager → Ajouter à Oshka → Ajouter à l’Inbox**. Le raccourci ouvre Oshka dans
le navigateur ; une première connexion peut être nécessaire, même si l’app est
déjà installée sur l’écran d’accueil.

**Android** — Installe Oshka depuis le menu de Chrome. Depuis une autre app,
choisis **Partager → Oshka**, vérifie la carte et ajoute-la à l’Inbox. Si l’app
était déjà installée avant cette fonctionnalité, laisse Chrome la mettre à jour
ou réinstalle-la ; les cartes restent dans le compte.

Le titre et le contenu sont modifiables avant l’ajout. Un partage en attente est
conservé pendant la connexion ; annuler ne crée aucune carte. L’ajout est une
seule opération annulable. Les photos et fichiers joints ne sont pas pris en
charge par ce parcours.

Le raccourci signé n’est pas versionné : il se génère et se signe sur Mac, dans
`public/shortcuts/`, avant de déployer Hosting :

```bash
python3 scripts/build-share-shortcut.py /tmp/oshka-unsigned.shortcut
shortcuts sign --mode anyone --input /tmp/oshka-unsigned.shortcut --output public/shortcuts/Ajouter-a-Oshka.shortcut
```

Le script lit l’origine de l’instance dans `OSHKA_ORIGIN` (`.env`) ou en
deuxième argument. La signature publique fait valider le fichier par Apple,
sans inclure de compte ni de jeton Oshka.

L’entrée de l’action URL Encode doit être un `WFTextTokenString` contenant le
jeton `ExtensionInput`. Un `WFTextTokenAttachment` directement dans ce paramètre
est ignoré à l’import par Apple : le raccourci s’exécute mais ouvre seulement
`/share#text=`, sans lien. Ce défaut a été reproduit dans le moteur Raccourcis
sur Mac avec une URL en entrée. Après une correction du fichier, il faut
remplacer le raccourci installé sur l’iPhone ; il ne se met pas à jour avec le
site. Un partage vide affiche désormais un message et permet de coller le lien.

Le téléchargement doit conserver l’extension `.shortcut` et être servi en pièce
jointe (`Content-Disposition: attachment`). L’en-tête manquant faisait afficher
le fichier signé comme du texte brut dans l’aperçu de Safari. Le service worker
laisse ces téléchargements au navigateur. Vérification HTTP sur l’émulateur
Hosting ou après déploiement :

```bash
node scripts/check-share-download.mjs https://<projet>.web.app
```

## Gmail

Le module Gmail Oshka fonctionne sur iPhone et Mac : ouvrir Oshka sur un mail
crée directement une carte avec son lien source. Chaque mail consulté tant que
le panneau reste ouvert est aussi ajouté ; ferme le panneau pour arrêter. Installation privée et connexion :
[guide Gmail](docs/GMAIL.md).

## Depuis Slack

Une app Slack permet d’ouvrir **Ajouter à Oshka** depuis le menu d’un message,
de confirmer le titre et d’enregistrer le texte avec son lien dans l’Inbox.
La configuration du workspace, des deux secrets et de la liaison personnelle
est décrite dans [docs/SLACK.md](docs/SLACK.md).

## Depuis Claude ou Codex

Un serveur MCP donne accès aux boards depuis un assistant : lire l'arbre et
l'agenda, chercher, capturer dans l'Inbox, créer, déplacer, terminer, commenter.
La connexion passe par votre compte Oshka.

| Client | Pour le brancher |
|---|---|
| **claude.ai** (web, puis mobile) | Paramètres → Connecteurs → *Ajouter un connecteur personnalisé* → `https://<projet>.web.app/mcp` |
| **Claude Code** | `claude mcp add --transport http oshka https://<projet>.web.app/mcp`, puis `/mcp` pour se connecter |
| **Codex** | `codex mcp add oshka --url https://<projet>.web.app/mcp`, puis `codex mcp login oshka` |

Un connecteur ajouté sur claude.ai suit le compte : il est ensuite disponible
dans l'app mobile. Le fonctionnement est décrit dans
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#le-serveur-mcp).

## Démarrer

```bash
npm install
```

Copiez `.env.example` en `.env` et renseignez les valeurs depuis la console
Firebase (Paramètres du projet → Vos applications), puis associez le dossier à
votre projet Firebase :

```bash
cp .env.example .env
firebase use --add
```

`authDomain` et `storageBucket` se déduisent de l'ID du projet dans
`src/lib/firebase.js`. Ces valeurs sont publiques par nature : la sécurité tient
aux règles Firestore, pas à leur discrétion. Côté Cloud Functions, l'origine est
`https://<projet>.web.app` par défaut ; pour un domaine personnalisé, définissez
`OSHKA_ORIGIN` dans `functions/.env`.

```bash
npm run dev
```

| Commande | |
|---|---|
| `npm run dev` | serveur de développement |
| `npm test` | la suite de tests |
| `npm run test:watch` | les tests en continu |
| `npm run lint` | ESLint |
| `npm run build` | build de production |
| `firebase deploy --only hosting` | déploiement de l'app |
| `firebase deploy --only functions:mcp,hosting,firestore` | déploiement du serveur MCP (et des réécritures qui le servent) |
| `npm run seed:local` | compte et board de test dans les émulateurs |

### Tester sans toucher à la prod

La configuration de lancement `dev-local` (`.claude/launch.json`) démarre les
émulateurs Auth et Firestore et sert l'app sur **`localhost:5174`** avec
`VITE_EMULATORS=1`. L'app pointe alors sur un projet `demo-oshka`, qui n'existe
pas côté Firebase : rien ne peut atteindre la vraie base, même par erreur. Le
port différent sépare aussi le stockage du navigateur de celui de la prod.

Les émulateurs gardent tout en mémoire : chaque lancement repart de zéro, et
recrée donc d'abord le compte de test et un board d'exemple (les identifiants
sont dans `scripts/seed-emulator.mjs`). Pour remettre le board à zéro sans
relancer :

```bash
npm run seed:local
```

Un banc d'essai pour l'animation du logo est disponible sur **`/loader`** en
développement uniquement — il la joue en boucle, au ralenti, image par image.

## Sous le capot

React 19, Vite, Firebase (Auth + Firestore), `@hello-pangea/dnd` pour le
glisser-déposer. Aucun framework de style : une seule feuille CSS, construite
sur des variables de thème.

```
src/
├── components/   les vues et les panneaux
├── hooks/        useBoard (l'état et la synchro), useTabs, useAuth…
├── lib/          la logique pure — et c'est là que sont les tests
└── styles/       app.css
```

**La logique métier vit dans `src/lib`, en fonctions pures**, séparée du rendu :
le déplacement d'une carte entre boards, le découpage d'Horizon, la disposition
radiale de la carte mentale, la recherche. C'est ce qui est testé — 203 tests.

Pour le pourquoi des décisions — le modèle de données, la synchronisation, les
pièges rencontrés — voir **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Licence

[MIT](LICENSE)

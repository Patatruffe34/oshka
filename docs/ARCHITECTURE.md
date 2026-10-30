# Architecture

Ce document explique **pourquoi** le code est fait ainsi. Le *quoi* se lit dans
les fichiers ; ce qui se perd, ce sont les raisons — et les pièges déjà payés.

---

## Le modèle de données

Tout l'arbre d'un utilisateur tient dans **un seul document Firestore**,
`boards/{uid}`, sérialisé en JSON.

```js
board = { columns: [ column ] }
column = { id, title, emoji, color, cards: [ card ] }
card   = { id, title, description, comments, done, doneAt, archived,
           labels, dueAt, repeat, checklists, board }   // ← et board recommence
```

La récursion est dans la dernière ligne : une carte porte un board, qui porte des
colonnes, qui portent des cartes. Il n'y a pas de table des boards ni de
références croisées — la structure *est* l'arbre.

**Pourquoi un seul document.** Du texte compresse bien : un arbre de plusieurs
centaines de cartes reste à quelques dizaines de kilo-octets, très loin de la
limite d'un mégaoctet par document. En échange, l'arbre entier est en mémoire à
tout instant, et c'est ce qui rend possibles les vues transverses : Horizon, la
carte mentale, le plan et la recherche le parcourent sans une seule requête
réseau.

**Quand il faudra changer.** Le déclencheur n'est pas la taille, c'est le
**partage à plusieurs**. Deux personnes sur un même document, c'est le dernier
qui écrit qui gagne. Le jour où ça arrive, il faudra découper — et toutes les
vues transverses devront être repensées.

---

## L'état et la synchronisation

`useBoard` détient l'arbre, le chemin courant, la corbeille, les favoris et les
réglages. Il écrit dans Firestore avec un délai, et écoute les changements
distants avec `onSnapshot`.

Deux gardes protègent cette boucle, et **toutes deux viennent d'un bug de perte
de données** :

```js
if (dirty.current) return;                      // une édition locale est en cours
if (data.boardJson === lastWrittenJson.current) return;  // c'est notre propre écho
```

Sans la première, une mise à jour distante arrivant pendant une frappe écrasait
ce qui était en train d'être tapé. Sans la seconde, chaque sauvegarde revenait
par l'écoute et relançait un rendu.

> **Faiblesse connue.** La première garde *abandonne* la mise à jour distante au
> lieu de la rejouer plus tard. Avec deux appareils actifs en même temps, une
> modification peut être perdue. Ça n'a pas encore été traité.

### Muter n'importe où dans l'arbre

Les mutations passent par `mutateAt(segments, updater, label)`, qui applique une
fonction au board situé à un chemin donné. `mutate(...)` n'en est que le cas
particulier : « là où je me tiens ».

Cette distinction n'est pas décorative. Horizon affiche des cartes venues de
partout et peut en ouvrir une sur place ; sans cible explicite, une checklist
modifiée depuis cette vue aurait été écrite **sur le board d'en dessous**.
Chaque mutation de carte accepte donc un `at` optionnel.

**Les updaters doivent rester purs** : React les invoque deux fois en mode strict.
Décider d'une action de suite à l'intérieur d'un updater est un piège — la
décision se prend avant.

### Annuler

Un instantané `{root, trash}` est empilé avant chaque mutation, avec une
étiquette. Deux mutations de même étiquette rapprochées de moins de 700 ms
fusionnent, pour qu'une frappe ne remplisse pas la pile.

Conséquence utile : une action composée est **une seule étape**. Déposer une
carte dans une colonne ✅ la déplace *et* la coche dans le même instantané, donc
un seul `⌘Z` défait les deux.

La suppression globale des archives retire définitivement les cartes archivées
et leur contenu, sans copie dans la corbeille. Une confirmation affiche le
nombre de cartes concernées, descendants compris. Cette opération efface les
piles d'annulation et de rétablissement pour éviter de ressusciter les données
supprimées ; les autres cartes et la corbeille restent présentes.

Le groupe « Clean » réunit cette suppression et l'archivage des cartes terminées.
Ce dernier parcourt tous les tableaux, ne touche qu'aux cartes explicitement
terminées et conserve leur contenu. Une seule étape d'annulation couvre toute
l'opération. Le sous-menu s'ouvre au survol, au clic ou au clavier sur ordinateur ;
ses deux actions sont directement affichées sous « Clean » dans le menu mobile.

### Inbox

Les partages mobiles arrivent sur `/share` : `title`, `text` et `url` en query
string depuis la PWA Android (`manifest.share_target`), ou `#text=…` depuis le
raccourci iOS signé. Le fragment garde le contenu iOS hors des requêtes HTTP.
`main.jsx` les lit avant les réécritures d’URL de l’authentification, conserve
une capture en attente dans `oshka_pending_share_v1` et nettoie l’URL. Ce stockage
local permet de retrouver le partage après un aller-retour par le lien magique.
Sans stockage disponible, il reste utilisable dans l’onglet courant.

`SharedCapture` demande une validation explicite : une simple navigation GET ne
modifie jamais le compte. Après connexion et chargement du board, titre et
description sont enregistrés ensemble par `captureInbox`, en un instantané
annulable, puis l’Inbox s’ouvre. Annuler supprime seulement la capture en attente.
Le service worker sert le shell pour `/share`, y compris hors ligne, sans jamais
mettre en cache l’URL contenant les paramètres du partage.

Sur iOS, le raccourci utilise le navigateur et sa session de connexion ; la
session de l’application sur l’écran d’accueil peut être distincte. Son générateur
est `scripts/build-share-shortcut.py`, son fichier signé dans `public/shortcuts/`.
Le guide d’installation des deux plateformes est accessible dans les paramètres.

Le générateur sérialise l’entrée d’URL Encode en `WFTextTokenString` : son
paramètre texte ne conserve pas un jeton `WFTextTokenAttachment` nu à l’import
dans Raccourcis. La signature valide le fichier, sans vérifier que chaque action
reçoit la valeur attendue. Le test d’export couvre ce contrat. Une invocation
`/share` vide reste visible, y compris après connexion, avec une explication et
un formulaire vide ; elle ne doit jamais retomber silencieusement sur le board.

Les captures sans destination vivent dans `root.inbox`, un tableau de cartes au
format habituel, hors de la hiérarchie des boards. Un compte ancien sans ce champ
a une Inbox vide. La sérialisation JSON, la synchronisation et les instantanés
existants incluent ainsi l'Inbox, sans ajouter de document Firestore.

`fileInboxCard` valide le chemin et la colonne avant de retirer la capture, puis
la déplace en conservant son identifiant et son contenu. Le déplacement est une
seule étape annulable et respecte la préférence « terminer au dépôt » dans ✅.
Une suppression crée une entrée de corbeille `source: "inbox"` : la restauration
revient dans l'Inbox et ne crée pas de colonne dans le board courant.

L’Inbox occupe un panneau intégré à gauche, avec une palette bleutée distincte.
Elle réduit la largeur de l’application sans bloquer ses interactions. Sur mobile,
le panneau occupe le haut de l’écran et laisse le tableau utilisable en dessous.
Le brouillon reste présent quand on referme le panneau pendant la session.

L’ouverture et la fermeture glissent sur 240 ms : depuis la gauche sur ordinateur,
depuis le haut sur mobile, en ajustant progressivement la place du tableau.
Le panneau fermé est immédiatement `inert` et masqué pour les lecteurs d’écran,
mais reste rendu le temps de terminer sa sortie. Des marges animent le contenu
sans créer d’ancêtre transformé qui décalerait les cartes glissées. Avant les
mesures du DnD, les transitions de géométrie en cours sont terminées. La préférence
« réduire les animations » désactive ces transitions.

Sur mobile (≤ 640 px), le champ de capture se replie quand on fait défiler la
liste vers le bas, pour rendre sa hauteur aux cartes, et revient dès qu’on remonte
ou qu’on approche du haut de la liste. Il reste déplié tant qu’il a le focus ou
contient un brouillon. `foldCapture` (`src/lib/inbox-motion.js`) décide à partir
du défilement : une marge ignore les petites secousses, le reflux causé par le
repli lui-même est ignoré pendant sa transition, et le champ ne se replie pas si
la liste n’aurait plus de quoi défiler pour le faire revenir. Le repli anime une
ligne de grille (pas de `transform`), que `settleInboxTransition` termine avant
les mesures du DnD ; pendant un glisser qui survole ou quitte la liste, le
défilement ne replie ni ne déplie rien. Sur ordinateur, le champ reste fixe.

L’Inbox et le board partagent un `DragDropContext` ; `useBoardDrag` conserve les
zones de déplacement des colonnes et le défilement aux bords. Les captures sont
glissables par leur poignée vers les colonnes du tableau courant. Le dépôt utilise
l’index des cartes visibles (archives et filtre d’étiquettes exclus), puis range la
capture en une seule mutation annulable.

Action Plan partage également son contexte avec l’Inbox, via `usePlannerDrag`.
Le dépôt dans une voie datée conserve la date choisie et ouvre le sélecteur de
board : la voie du plan dit quand agir, pas où ranger la carte. La note reste dans
l’Inbox tant que cette destination n’a pas été validée. Date, rangement et ordre
dans « Aujourd’hui » sont appliqués en une seule étape annulable. L’annulation du
sélecteur ne touche pas à la note. Les voies restent présentes quand le plan est
vide mais que l’Inbox contient des captures ; « À l’arrêt » reste non déposable.

Le trajet inverse retire la carte de sa colonne par identifiant et la place dans
l’Inbox à la position déposée. L’opération conserve l’intégralité de la carte,
sous-board et métadonnées compris ; aucune copie ne passe par la corbeille.
Le déplacement, la sauvegarde et l’annulation utilisent un seul instantané.
La zone de dépôt de l’Inbox couvre la liste, même vide, et accepte les cartes du
board courant comme celles visibles dans Action Plan. L’Inbox peut également
être réordonnée par glisser-déposer ; fermée, elle refuse les dépôts.

Cliquer sur le titre d’une capture ouvre `CardDetail` via `InboxCardDetail`.
Les descriptions, commentaires et checklists utilisent la même interface que
les cartes rangées. `updateInboxCard` et `useBoard.updateInbox` ciblent
explicitement `root.inbox` pour sauvegarder les modifications et les annuler,
sans toucher au tableau affiché derrière. Le renommage rapide reste accessible
par un bouton distinct ; Entrée ouvre le détail et Espace garde son rôle DnD.

Les descriptions et commentaires passent par `react-markdown` avec GFM et
conservation des retours à la ligne. Le HTML reste du texte, les URL suivent le
filtrage du moteur, avec une exception limitée aux liens `obsidian://`.
Les longues chaînes et blocs de code reviennent à la ligne ; les tableaux larges
défilent dans leur propre zone pour rester dans la carte.

Le bug initial venait de deux choix incompatibles avec ce parcours : les captures
n’étaient pas glissables dans Action Plan, et les voies vivaient dans un contexte
imbriqué distinct. Le test d’intégration vérifie désormais que l’Inbox et les voies
partagent le même contexte dans l’application réelle, y compris sur un plan vide.

---

### Actions rapides du Plan

`PlannerCard` réutilise `CardMenu` pour les étiquettes, dates et répétitions,
déplacements, renommage, archivage et suppression. `useCardShortcuts` partage
les touches `E`, `D`, `M`, `R`, `A` avec les cartes des tableaux. Seule la carte
survolée écoute ; la saisie de texte, la composition, les modificateurs et les
panneaux ouverts suspendent ces raccourcis.

Chaque action reçoit le chemin de la carte dans l’arbre : le tableau affiché
derrière le Plan ne sert jamais de destination implicite. La suppression
enregistre aussi ce chemin dans la corbeille pour restaurer la carte à sa place.
Le menu est visible au survol, au focus et sur écran tactile. Les contrôles
gardent leurs événements clavier ; `Entrée` sur la carte l’ouvre et `Espace`
reste réservé au glisser-déposer.

## Le glisser-déposer

`@hello-pangea/dnd` (le fork maintenu de `react-beautiful-dnd`) impose deux
contraintes qui ont chacune coûté un bug :

**1. Un seul conteneur de défilement par liste, le plus proche — les conteneurs
imbriqués ne sont pas gérés.** Tant que chaque colonne défilait ses propres
cartes, c'était elle que la librairie surveillait, et faire glisser le board sous
elle rendait sa géométrie fausse : la carte se posait à des colonnes de l'endroit
visé. D'où la disposition actuelle — **le board porte les deux axes, les colonnes
n'en portent aucun**, et les en-têtes de colonne sont collants pour rester
lisibles.

Dans Action Plan sur mobile, les colonnes défilent indépendamment pendant la
lecture. Avant les mesures du glisser (`onBeforeCapture`), `preparePlannerDrag`
transfère leurs positions vers le conteneur commun et étend les zones de dépôt,
y compris celles des colonnes vides. Des marges compensent les positions de
lecture : la carte ne saute pas, et on peut encore défiler vers le haut. Après
le dépôt ou l'annulation, chaque colonne retrouve son défilement indépendant.
Le balayage horizontal utilise `useColumnSwipe`, comme les boards, avec les
colonnes du plan comme points d'arrêt. Les ancres sont désactivées avant les
mesures du glisser et pendant le balayage, pour ne pas contrer le défilement.

**2. Un glisser ne démarre pas depuis un élément interactif.** Une carte, un
onglet ou une ligne déplaçable doit être un `div` avec `role="button"`, jamais un
`<button>` — sinon rien ne se soulève, sans le moindre message. C'est aussi
pourquoi `Entrée` active ces éléments : `Espace` appartient au glisser.

Et une règle qui n'est pas de la librairie mais du bon sens : **les index doivent
suivre l'ordre affiché**. Dans Horizon, les cartes sont triées par date puis
regroupées par board — l'ordre à l'écran n'est pas celui du tableau source.

---

## Les vues transverses

Elles vivent dans `src/lib`, en fonctions pures, et c'est ce qui les rend
testables :

| Fichier | Rôle |
|---|---|
| `planner.js` | le découpage d'Horizon et les dates d'un dépôt |
| `mindmap.js` | l'arbre en disque, angles proportionnels au nombre de feuilles |
| `search.js` | parcours filtrant, avec le chemin de chaque résultat |
| `board-utils.js` | le reste — chemins, déplacements, étiquettes, statistiques |

### La convention de la colonne ✅

Une colonne dont l'emoji contient ✅ marque un board **qui progresse**. C'est une
convention plutôt qu'un réglage : on la pose comme n'importe quelle autre icône,
et elle se lit sur le board pour ce qu'elle est.

Elle sert deux fois : une carte qu'on y dépose passe en terminée, et un board qui
n'en a pas n'est jamais signalé comme à l'arrêt — une base de données ou une
grille de réflexion n'a pas d'état final.

### Une carte qui revient n'est jamais terminée

Une carte qui se répète porte `repeat = { every, unit }`, et la règle qui en
découle tient en une phrase : **la cocher ne la termine pas, elle la reporte.**
Son échéance avance d'une période, ses checklists se décochent, `done` reste
faux.

C'est cette phrase qui laisse le reste de l'application intacte. Comme une
carte répétée ne devient jamais terminée, elle n'est jamais rangée sous ✅,
jamais archivée automatiquement, et on ne demande jamais s'il faut terminer ce
qu'elle contient — aucun de ces chemins n'a eu à apprendre la répétition. Le
même raisonnement vaut pour un dépôt dans la colonne ✅ : c'est le même geste,
donc la même réponse.

Arrêter une série est le miroir de ça : on retire la répétition, et la coche
suivante termine la carte comme n'importe quelle autre.

La seule exception est **terminer une branche**, qui termine tout ce qu'elle
contient, répétitions comprises. C'est voulu : on y déclare que le projet
entier est fini, et c'est le seul endroit où une série s'arrête sans qu'on la
retire. La carte garde sa règle — la décocher relance la série là où elle en
était.

**La prochaine date se compte depuis celle qui est sur la carte**, pas depuis un
ancrage caché — reporter une occurrence reporte donc la série, et ce qu'on lit
sur la carte est la seule chose qui décide. Elle avance ensuite jusqu'à dépasser
aujourd'hui : un hebdomadaire coché avec trois semaines de retard revient une
fois la semaine prochaine, pas trois fois dans le passé.

Le seul cas ingrat est le mois : le 31 février n'existe pas, donc un jour qui
dépasse est replié sur la fin du mois où il atterrit. Le prix, c'est qu'un
mensuel posé le 31 reste ensuite le 28. L'alternative — un ancrage mémorisé —
ferait qu'un déplacement à la main ne déplacerait pas la série, et cette
surprise-là coûte plus cher que la seule date sur douze qui ne peut pas exister
partout.

### Ce que « cette semaine » veut dire

Deux lectures possibles, qui s'écartent de six jours : le reste de la semaine
calendaire, ou les sept prochains jours. C'est donc un réglage, pas une
supposition. Et un dépôt vise **le vendredi** de la voie, pas son dernier jour —
poser une échéance un dimanche ne rend service à personne.

---

## Les onglets

Plusieurs boards ouverts, un seul à l'écran. Un onglet est **une liste
d'identifiants**, rien d'autre ; son titre est résolu depuis l'arbre au moment du
dessin, ce qui fait qu'un renommage suit et qu'un onglet dont la carte a disparu
s'estompe au lieu de mentir.

**L'onglet affiché ne porte pas de chemin à lui : il *est* le chemin courant.**
Seuls les autres gardent des segments, et l'un d'eux est écrit au moment où il
cesse d'être affiché. Rien n'a besoin d'être tenu en phase, donc rien ne peut se
désynchroniser.

Ils vivent en `localStorage`, **par appareil** : ce sont les onglets de cet écran,
pas ceux du compte. Le document Firestore n'est pas touché.

Un onglet peut aussi porter une vue plutôt qu'une position — c'est le cas
d'Horizon, ancré à gauche et non déplaçable.

---

## Hors-ligne

Firestore est configuré avec `persistentLocalCache`. Les écritures faites sans
réseau sont mises en file et repartent au retour ; les lectures viennent du cache.

Le service worker (`public/sw.js`) sert le shell : **réseau d'abord pour le
document**, cache d'abord pour les fichiers versionnés. Les en-têtes d'hébergement
suivent la même logique — `no-cache` sur le point d'entrée et le worker,
`immutable` sur `/assets/**`.

> Un déploiement peut ne jamais atteindre les navigateurs si le worker rejoue un
> `index.html` périmé depuis le cache HTTP. D'où le `cache: "reload"` sur cette
> requête précise.

---

## La saisie et le clavier mobile

Sur téléphone ou tablette tactile, valider une carte ou un item de checklist
termine la saisie et retire explicitement le focus avant de fermer le formulaire.
Sur ordinateur, ces formulaires restent ouverts pour permettre la saisie en série.
Revenir du sélecteur de destination ne redonne le focus au titre que sur ordinateur.

`useMobileKeyboard` retire le focus après un tap hors des champs ou une navigation
dans l'historique du navigateur. Il écoute le clic, pas le début du toucher : un
défilement ou une sélection de texte ne doit pas interrompre la saisie. Les brouillons
restent présents tant qu'on ne les valide ou annule pas. Les éditions enregistrées
sur perte de focus passent par ce seul chemin à la validation pour éviter une double
écriture. Entrée reste un retour à la ligne dans les descriptions et commentaires.

## Les tests

La plupart des tests portent sur la logique pure. Les transitions de saisie sont
également testées avec les vrais composants React dans `happy-dom` : validation,
annulation, composition de texte, focus mobile et conservation de la saisie en série
sur ordinateur. Ces tests vérifient le DOM et les événements ; l'affichage du clavier
système et les animations du navigateur nécessitent encore une vérification sur appareil.

**La pratique qui compte : chaque suite est éprouvée en réintroduisant les bugs
qu'elle doit attraper.** Un test qui passe ne prouve rien tant qu'on n'a pas vu
qu'il sait échouer.

Ça a rattrapé plusieurs vrais défauts pendant le développement — dont une borne
de semaine décalée d'un jour, qu'aucun des onze tests d'origine ne voyait, et une
profondeur qui gardait la dernière branche parcourue au lieu de la plus profonde.

```bash
# Le geste : casser volontairement, vérifier que ça tombe, remettre.
cp src/lib/planner.js /tmp/bak
# … modifier une borne, une comparaison, une garde …
npm test
cp /tmp/bak src/lib/planner.js
```

---

## Sécurité

Les règles Firestore (`firestore.rules`) tiennent en trois blocs : un utilisateur
ne lit et n'écrit que `boards/{son uid}`, les codes de connexion sont fermés au
client, et tout le reste est refusé par défaut.

Les identifiants Firebase visibles dans `src/lib/firebase.js` — `authDomain`,
`projectId`, `storageBucket` — **sont publics par nature**. Une application web
les expose forcément ; la sécurité tient aux règles, pas à leur discrétion. Seule
la clé d'API passe par une variable d'environnement, par habitude.

---

## Le serveur MCP

`functions/mcp/` expose l'arbre aux clients MCP — claude.ai (web et mobile),
Claude Code, Codex — sur `https://<projet>.web.app/mcp`. Une seule fonction,
`mcp` (europe-west1, à côté de Firestore), sert le protocole et l'OAuth.

**Les mêmes règles que l'app, par le même code.** Le serveur ne réécrit pas la
logique : `npm run build:functions` empaquette `src/lib` en CommonJS
(`functions/mcp/build/oshka.cjs`, généré avant chaque déploiement). Cocher une
carte qui revient, déposer dans ✅, ce que « cette semaine » veut dire : tout
passe par les fonctions que les tests couvrent déjà. Les réglages par défaut
vivent pour la même raison dans `src/lib/settings.js`. Le fuseau horaire du
serveur est fixé à `Europe/Paris` (`OSHKA_TIMEZONE`), sans quoi « aujourd'hui »
serait celui de l'UTC.

**Écrire à deux.** Chaque outil lit, modifie et réécrit `boardJson` dans une
transaction ; corbeille, favoris et réglages ne sont pas touchés. L'app reçoit
le changement par son `onSnapshot`. Elle hérite donc de la faiblesse connue :
une écriture MCP qui arrive pendant une édition locale en cours peut être
écrasée par la sauvegarde qui suit. Aucun outil ne supprime : on archive.

**Tout passe par le domaine de l'app.** Les réécritures Hosting envoient `/mcp`,
`/.well-known/oauth-*`, `/authorize`, `/token`, `/register`, `/revoke` et
`/oauth/**` à la fonction. La découverte OAuth doit vivre à la racine d'un
domaine, et la page de connexion ne peut reprendre la session ouverte dans
Oshka que sur la même origine — Firebase Auth la garde dans l'IndexedDB de
celle-ci. Quelqu'un déjà connecté n'a qu'à cliquer « Autoriser ».

**L'OAuth.** Le serveur est son propre serveur d'autorisation, adossé à
Firebase Auth. Le routeur du SDK MCP porte le protocole (métadonnées,
enregistrement dynamique, PKCE, échange de jetons) ; `oauth.js` stocke ce qu'il
faut dans Firestore :

| Collection | Contenu | Durée |
|---|---|---|
| `mcp_clients` | clients enregistrés | — |
| `mcp_requests` | demande validée, en attente de la page | 15 min |
| `mcp_grants` | code d'autorisation, à usage unique | 5 min |
| `mcp_tokens` | jetons d'accès (1 h) et de rafraîchissement (60 j, renouvelés à chaque usage) | idem |

Les codes et jetons n'y figurent que **hachés** (SHA-256). Une politique TTL
(`firestore.indexes.json`) purge les entrées expirées. La page de connexion ne
renvoie que l'identifiant de la demande et un jeton d'identité Firebase, vérifié
côté serveur : rien de ce qu'elle poste ne peut élargir l'accès. L'enregistrement
est ouvert, comme claude.ai l'exige, mais ne retient que des redirections vers
claude.ai, claude.com ou une adresse locale (les CLI) : un inconnu ne peut pas
créer un client qui enverrait les codes chez lui.

**Tester.** `firebase emulators:start --only auth,firestore,functions,hosting
--project demo-oshka`, puis `npm run seed:local` : le serveur répond sur
`http://localhost:5002/mcp`, avec le compte de test.

---

## Ce qui reste ouvert

- **La perte de mise à jour à deux appareils** décrite plus haut.
- **Le partage** : le modèle à un document ne s'y prête pas.
- **Le poids du bundle** — Firebase en constitue l'essentiel. Un découpage
  deviendra pertinent si d'autres vues s'ajoutent.

# Consigne : proposer le menu demandé depuis l'appli

Tu as été lancé automatiquement par `tools/veilleur.py`, parce qu'Orane ou Ludo a demandé le menu de la semaine suivante depuis l'appli (ou a répondu à ta proposition, ou à ta question). **Personne n'est devant l'écran** : ne pose aucune question ici et n'attends pas de réponse. Tout ce que tu as à leur dire passe par l'appli, avec `boite.py`.

Outil : `python C:\Users\orane\code\menus-orane\tools\boite.py` (abrégé `boite.py` ci-dessous). Le numéro du plan t'est donné dans le message de lancement.

## 1. Lire la demande et la boîte

- `boite.py plan` : les réponses aux questions habituelles (étape 1 de CLAUDE.md, posées dans l'appli). Tu y trouveras :
  - les soirs à la maison (N dîners = nombre de soirs) et le jour du drive ;
  - leur semaine (soirs chargés, invités, quelqu'un seul), l'envie, la météo, les restes à finir, le budget, et « autre chose ».
  - Puis, au 2e tour et suivants : ta proposition précédente avec ce qui est gardé ✓ et ce qui est à changer ✗ avec la raison, les commentaires, et les réponses à tes questions.
- `boite.py lire` : la liste « Prochain drive » et les retours sur les recettes (étape 0 de CLAUDE.md).
  - ♡ adorée : ajoute la recette à `favoris.md` avec son nom exact et `| ♡ Orane` ou `| ♡ Ludo`.
  - ♡ retiré : enlève-la de `favoris.md`, ou enlève seulement la personne du ♡.
  - Remarque : tiens-en compte pour ce menu.
  - « À refaire bientôt » : propose ce plat si ça colle.
  - Une fois un retour pris en compte : `boite.py traite <id>`.

## 2. Une précision indispensable ?

Pose une question seulement s'il manque une information sans laquelle tu ne peux pas proposer correctement. Exemples : combien d'invités samedi, un régime pour un invité.

- Dans ce cas : `boite.py plan-question <id> "ta question"`, courte, en tutoyant, puis arrête-toi là.
- Sinon, choisis le plus raisonnable et dis-le dans le message.

## 3. Composer le menu

Applique CLAUDE.md (étapes 2 à 5) et toute la mémoire (profil, contraintes, ingrédients aimés et évités, style de plats, structure de semaine, anti-patterns) :

- **Nombre de dîners** : N dîners, un par soir coché. Chaque dîner couvre le déjeuner du lendemain : vérifie le premier midi.
- **Structure de la semaine** : idéale autant que pertinent, sans s'y enfermer.
- **Anti-répétition** : rien des ~21 derniers jours (dossier `menus/`).
- **Sources** : d'abord `favoris.md`, puis les box (`sources.md`, consultées en direct).
- **Temps de préparation** : 10 à 30 min, jamais plus de 35 min.
- **Gourmand ET ça va**, jamais « parce que c'est sain ».
- **Restes à finir** : utilise-les.
- **Au 2e tour** : garde **à l'identique** les plats gardés (même `id`, même contenu). Remplace **seulement** les plats à changer, en tenant compte de la raison. Ne refais pas tout.

## 4. Envoyer la proposition

Écris un fichier JSON (dans `%TEMP%`, pas dans le dossier des menus) :

```json
{
  "semaine": "2026-S47",
  "message": "1 à 2 phrases pour eux (vouvoiement collectif « vous »), ex. ce qui a guidé tes choix, le budget estimé.",
  "plats": [
    {
      "id": "p1",
      "jour": "2026-11-18",
      "moment": "soir",
      "nom": "Nom du plat",
      "pourquoi": "Justification en 1 ligne (étape 4) : « Crémeux comme vous aimez, 15 min »",
      "temps": 20,
      "source": "Jow",
      "url": "https://jow.fr/recipes/…"
    }
  ]
}
```

- Chaque plat a un `url` : sa recette (Jow, HelloFresh, Quitoque). Pour un plat maison, ajoute `"photo_page"`, une recette Jow proche qui sert de photo. La photo est récupérée automatiquement.
- Puis : `boite.py proposer <id> <fichier.json>`. Si l'outil signale un plat sans photo, ajoute `photo_page` et renvoie.

N'écris pas encore le fichier du menu, ne publie rien et ne touche pas à Chronodrive : ça se fait seulement une fois le menu validé.

## Si ça coince

Si tu ne peux pas aller au bout, envoie quand même un message clair :
`boite.py plan-statut <id> erreur "ce qui bloque"`

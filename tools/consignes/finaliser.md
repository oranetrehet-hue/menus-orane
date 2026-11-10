# Consigne : finaliser le menu validé dans l'appli

Tu as été lancé automatiquement par `tools/veilleur.py`, parce qu'Orane ou Ludo a validé le menu proposé dans l'appli. **Personne n'est devant l'écran** : ne pose aucune question ici. Tout ce que tu as à leur dire passe par l'appli, avec `boite.py`.

Outil : `python C:\Users\orane\code\menus-orane\tools\boite.py` (abrégé `boite.py` ci-dessous). Le numéro du plan t'est donné dans le message de lancement.

## 1. Relire ce qui a été validé

- `boite.py plan` : la demande (soirs, drive, envies, frigo, budget…), la proposition validée et tous les échanges (raisons des changements, commentaires, réponses).
- `boite.py lire` : la liste « Prochain drive » à ajouter au panier, et les retours sur les recettes. Traite-les comme à l'étape 0 de CLAUDE.md.

## 2. Écrire le menu

Écris `menus/AAAA-Sxx.md` selon CLAUDE.md (étapes 3, 4 et 8), au même format que `menus/2026-S46.md`.

**En-tête du fichier** :
- un titre avec les dates (« # Semaine 47 — mercredi 18 → mercredi 25 novembre 2026 ») ;
- le contexte, repris de la demande ;
- le tableau « Couverture des repas » (Jour | Midi | Soir) : chaque dîner couvre le déjeuner du lendemain, resto et soirs dehors compris ;
- la ligne des parts.

**Chaque recette** : `### N. Nom *(jour J soir + jour J+1 midi — XX min)*`, puis :
- `Source : [Jow](url)` ou `Photo : [Jow](url)` ;
- `**Ingrédients (4 portions)** :` : la liste complète pour cuisiner, avec les quantités ;
- `**Étapes** :` : **une vraie recette**, numérotée, un geste par étape, avec les temps, le feu et les repères visuels. Les réglages du Thermomix en gras. Jamais un résumé en une ligne : relis les étapes de 2026-S46 et fais au moins aussi précis ;
- `**Part Orane** :` puis `**Part Ludo** :` (Ludo plus léger en matière grasse) ;
- `💡 **À anticiper** (quand) :` quand c'est utile.

**À la fin** : la liste de courses groupée par recette, en volumes « 4 portions » sans redoubler. Légumes et oignons surgelés, viande fraîche, ce qui est en stock noté en italique.

## 3. Publier l'appli

```
cd C:\Users\orane\code\menus-orane
python build.py
git add -A
git -c user.name="Claude Setup" -c user.email="claude@local" commit -m "menu sXX"
git push
```

## 4. Préparer le panier Chronodrive

Utilise Chrome (Claude in Chrome), sur chronodrive.com, avec le compte déjà connecté (drive de Pessac). Suis la mémoire (courses surgelés et Chronodrive).

- Mets au panier les produits de la liste de courses, au meilleur rapport qualité-prix, ainsi que la liste « Prochain drive » (`boite.py lire`).
- Une fois ces produits au panier : `boite.py vider-achats`.
- Relis le panier (page du panier) : quantités et doublons.
- **Ne valide JAMAIS la commande et ne choisis pas de créneau** : Orane s'en occupe.
- Si Chrome n'est pas joignable, si Chronodrive n'est pas connecté ou si quelque chose bloque, ne force rien : dis-le dans le message final.
- Note le résumé du panier à la fin du fichier du menu (comme dans 2026-S46), puis republie l'appli (étape 3).

## 5. Prévenir dans l'appli

`boite.py plan-fini <id> "…"`, en une ou deux phrases. L'appli affiche déjà « Menu publié » au-dessus : ne le répète pas. Par exemple :
- « Panier prêt : 31 articles, 85 €. Choisis ton créneau et valide sur Chronodrive. »
- « Le panier n'a pas pu être préparé : Chronodrive n'était pas connecté dans Chrome. Dis à Claude « prépare le drive » sur l'ordinateur. »

## Si ça coince avant la publication

`boite.py plan-statut <id> erreur "ce qui bloque"`

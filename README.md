# menus-orane — site web statique des menus de la semaine

Mini app web qui affiche la semaine en cours + liste de courses cochable, à consulter depuis le tel.

## Source de vérité

Les menus eux-mêmes sont stockés dans
`C:\Users\orane\OneDrive\Documents\5. DOCUMENTS PERSO\10. RECETTES ET MENUS\menus\AAAA-Sxx.md`

Ce repo contient :
- `build.py` : script de génération
- `templates/` : gabarits Jinja2
- `static/` : CSS, JS, manifest PWA, icônes
- `site/` : site généré (déployé sur GitHub Pages)
- `.github/workflows/deploy.yml` : déploiement automatique

## Workflow hebdo

```
# Côté Claude Code, après validation d'un menu :
python build.py
git add site/
git commit -m "menu sXX"
git push
```

GitHub Actions prend le relais et publie sur `https://<user>.github.io/menus-orane/`.

## Auto-purge

Le site affiche par défaut les 5 dernières semaines. Les .md anciens restent dans OneDrive (jamais supprimés), mais ne sont plus inclus dans le site une fois passés hors fenêtre.

Pour changer la fenêtre :
```
python build.py --keep 8
```

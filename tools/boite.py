"""boite.py — la boîte partagée de l'appli des menus (service Cloudflare « menus-orane »).

Ce qu'Orane et Ludo mettent dans l'appli depuis leurs téléphones :
- la liste « À penser pour le prochain drive » (achats) ;
- les retours sur les recettes : ♡ « On a adoré » ou une remarque.

Usage (Claude) :
  python tools/boite.py lire                  # liste à penser + retours pas encore pris en compte
  python tools/boite.py ajouter "Essuie-tout" # ajoute un article (quand Orane le dit en conversation)
  python tools/boite.py retirer <id>          # retire un article (mis au panier)
  python tools/boite.py vider-achats          # vide toute la liste une fois le drive préparé
  python tools/boite.py traite <id>           # marque un retour comme pris en compte

L'adresse du service et le code sont dans worker/.secrets.json (jamais sur GitHub).
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SECRETS = Path(__file__).resolve().parent.parent / "worker" / ".secrets.json"


def appel(methode: str, chemin: str, corps: dict | None = None) -> dict:
    conf = json.loads(SECRETS.read_text(encoding="utf-8"))
    req = urllib.request.Request(
        conf["api"] + chemin,
        data=json.dumps(corps).encode("utf-8") if corps is not None else None,
        method=methode,
        headers={
            "x-code": conf["code"],
            "content-type": "application/json",
            "user-agent": "menus-orane-claude/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Erreur {e.code} : {e.read().decode('utf-8', 'replace')}")


def lire() -> None:
    d = appel("GET", "/api/tout")
    print("À penser pour le prochain drive :")
    for a in d["achats"]:
        print(f"  [{a['id']}] {a['texte']}  ({a['cree_le']} UTC)")
    if not d["achats"]:
        print("  (vide)")
    print("\nRetours sur les recettes (pas encore pris en compte) :")
    for r in d["retours"]:
        quoi = {"favori": "♡ adoré", "proposer": "à refaire bientôt"}.get(r["type"], f"remarque : {r['texte']}")
        print(f"  [{r['id']}] {r['semaine'] or '?'} · {r['recette']} → {quoi}  ({r['cree_le']} UTC)")
    if not d["retours"]:
        print("  (aucun)")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if not args or args[0] == "lire":
        lire()
    elif args[0] == "ajouter" and len(args) > 1:
        a = appel("POST", "/api/achats", {"texte": " ".join(args[1:])})["achat"]
        print(f"Ajouté : [{a['id']}] {a['texte']}")
    elif args[0] == "retirer" and len(args) == 2:
        appel("DELETE", f"/api/achats/{int(args[1])}")
        print(f"Retiré : {args[1]}")
    elif args[0] == "vider-achats":
        appel("DELETE", "/api/achats")
        print("Liste à penser vidée.")
    elif args[0] == "avatar" and len(args) == 3 and args[1] in ("O", "L"):
        import base64
        import io

        from PIL import Image, ImageOps

        im = ImageOps.fit(ImageOps.exif_transpose(Image.open(args[2])).convert("RGB"), (192, 192))
        tampon = io.BytesIO()
        im.save(tampon, "JPEG", quality=85)
        appel("POST", f"/api/avatars/{args[1]}", {"mime": "image/jpeg", "data": base64.b64encode(tampon.getvalue()).decode()})
        print(f"Photo {args[1]} envoyée ({len(tampon.getvalue()) // 1024} Ko).")
    elif args[0] == "traite" and len(args) == 2:
        appel("DELETE", f"/api/retours/{int(args[1])}")
        print(f"Retour {args[1]} marqué pris en compte.")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

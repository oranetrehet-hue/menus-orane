"""boite.py — la boîte partagée de l'appli des menus (service Cloudflare « menus-orane »).

Ce qu'Orane (O) et Ludo (L) mettent dans l'appli depuis leurs téléphones, signé par chacun :
- la liste « Prochain drive » (achats) ;
- les retours sur les recettes : ♡ adorée, ♡ retiré, « à refaire bientôt » ou une remarque ;
- la préparation de la semaine suivante (plan) : demande → proposition → réponses → validé.

Usage (Claude) :
  python tools/boite.py lire                  # liste du drive + retours pas encore pris en compte
  python tools/boite.py ajouter "Essuie-tout" # ajoute un article (quand Orane le dit en conversation)
  python tools/boite.py retirer <id>          # retire un article (mis au panier)
  python tools/boite.py vider-achats          # vide toute la liste une fois le drive préparé
  python tools/boite.py traite <id>           # marque un retour comme pris en compte

  python tools/boite.py plan                  # la préparation en cours : demande, proposition, réponses
  python tools/boite.py proposer <id> <fichier.json>   # envoie la proposition de menu à l'appli
  python tools/boite.py plan-question <id> "question"  # une précision à demander avant de proposer
  python tools/boite.py plan-statut <id> <statut> ["message"]  # en_cours, finalisation, erreur
  python tools/boite.py plan-fini <id> "message"       # menu publié (+ état du panier Chronodrive)

L'adresse du service et le code sont dans worker/.secrets.json (jamais sur GitHub).
"""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

SECRETS = Path(__file__).resolve().parent.parent / "worker" / ".secrets.json"
NOMS = {"O": "Orane", "L": "Ludo"}
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


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


def qui(code: str | None) -> str:
    return NOMS.get(code or "", "?")


def lire() -> None:
    d = appel("GET", "/api/tout")
    print("Prochain drive (à mettre au panier) :")
    for a in d["achats"]:
        print(f"  [{a['id']}] {a['texte']}  — ajouté par {qui(a.get('par'))} ({a['cree_le']} UTC)")
    if not d["achats"]:
        print("  (vide)")
    print("\nRetours sur les recettes (pas encore pris en compte) :")
    for r in d["retours"]:
        quoi = {
            "favori": "♡ adorée → l'ajouter à favoris.md (♡ " + qui(r.get("par")) + ")",
            "retrait": "♡ retiré → l'enlever de favoris.md (ou retirer " + qui(r.get("par")) + " du ♡)",
            "proposer": "à refaire bientôt → la proposer au prochain menu",
        }.get(r["type"], f"remarque : {r['texte']}")
        print(f"  [{r['id']}] {qui(r.get('par'))} · {r['semaine'] or '?'} · {r['recette']} → {quoi}  ({r['cree_le']} UTC)")
    if not d["retours"]:
        print("  (aucun)")


def _jour(iso: str) -> str:
    from datetime import date

    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return iso
    return f"{JOURS[d.weekday()]} {d.day}/{d.month}"


def plan() -> None:
    d = appel("GET", "/api/plan")
    p = d.get("plan")
    if not p:
        print("Aucune préparation en cours.")
        return
    print(f"Plan n° {p['id']} — statut : {p['statut']} (tour {p['tour']}), demandé par {qui(p.get('par'))} le {p['cree_le']} UTC")
    dem = p.get("demande") or {}
    if dem:
        print("\nDemande :")
        soirs = dem.get("soirs") or []
        print(f"  Soirs à la maison ({len(soirs)}) : " + ", ".join(_jour(s) for s in soirs))
        if dem.get("drive"):
            print(f"  Drive : {_jour(dem['drive'])}")
        if dem.get("envies"):
            print("  Envies : " + ", ".join(dem["envies"]))
        if dem.get("precision"):
            print(f"  Précision : {dem['precision']}")
        if dem.get("frigo"):
            print(f"  À finir au frigo : {dem['frigo']}")
        print(f"  Budget : {dem.get('budget') or 'normal'}")
        if dem.get("semaine"):
            print(f"  Leur semaine : {dem['semaine']}")
        if dem.get("meteo"):
            print(f"  Météo : {dem['meteo']}")
        if dem.get("autre"):
            print(f"  Autre chose : {dem['autre']}")
    histo = p.get("reponses") or []
    if isinstance(histo, dict):
        histo = [histo]
    derniere = next((h for h in reversed(histo) if h.get("type") == "plats"), None)
    prop = p.get("proposition") or {}
    if prop:
        print(f"\nDernière proposition envoyée (tour {p['tour']}, semaine {prop.get('semaine', '?')}) :")
        avis = (derniere or {}).get("plats") or {}
        repondu = derniere is not None and derniere.get("tour") == p["tour"]
        for pl in prop.get("plats", []):
            a = avis.get(pl.get("id"), {}) if repondu else {}
            marque = "" if not repondu else ("  ✓ gardé" if a.get("ok", True) else f"  ✗ À CHANGER : {a.get('raison') or '(pas de raison)'}")
            print(f"  [{pl.get('id')}] {_jour(pl.get('jour', ''))} {pl.get('moment', 'soir')} — {pl.get('nom')} ({pl.get('temps', '?')} min, {pl.get('url', '')}){marque}")
    if histo:
        print("\nÉchanges depuis l'appli (du plus ancien au plus récent) :")
        for h in histo:
            if h.get("type") == "question":
                print(f"  Tour {h.get('tour')} · Claude a demandé : {h.get('question')}")
                print(f"           {qui(h.get('par'))} a répondu : {h.get('reponse')}")
            else:
                refus = [f"{k} ({v.get('raison') or 'sans raison'})" for k, v in (h.get("plats") or {}).items() if not v.get("ok", True)]
                bilan = "menu VALIDÉ" if h.get("valide") else ("à changer : " + ", ".join(refus) if refus else "tout gardé")
                print(f"  Tour {h.get('tour')} · {qui(h.get('par'))} : {bilan}")
                if h.get("commentaire"):
                    print(f"           Commentaire : {h['commentaire']}")
    if p.get("message"):
        print(f"\nMessage affiché dans l'appli : {p['message']}")


def _og_image(url: str) -> str:
    """Photo publiée par la page de recette (balise og:image)."""
    if not url.startswith("http"):
        return ""
    if re.search(r"\.(jpe?g|png|webp)(\?|$)", url, re.IGNORECASE):
        return url
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept-Language": "fr-FR,fr;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=12) as r:
            page = r.read(800_000).decode("utf-8", "replace")
    except Exception:
        return ""
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]*content=["\']([^"\']+)', page) or re.search(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*property=["\']og:image', page)
    return m.group(1).replace("&amp;", "&") if m else ""


def proposer(pid: int, fichier: str) -> None:
    prop = json.loads(Path(fichier).read_text(encoding="utf-8"))
    plats = prop.get("plats") or []
    if not plats:
        sys.exit("La proposition n'a aucun plat.")
    for i, pl in enumerate(plats, 1):
        pl.setdefault("id", f"p{i}")
        pl.setdefault("moment", "soir")
        if not pl.get("photo"):
            pl["photo"] = _og_image(pl.get("photo_page") or pl.get("url") or "")
        if not pl["photo"]:
            print(f"  ! pas de photo trouvée pour {pl.get('nom')} : ajouter « photo_page » (une recette Jow proche)")
    d = appel("POST", f"/api/plan/{pid}/proposition", {"proposition": prop, "message": prop.get("message", "")})
    print(f"Proposition envoyée : {len(plats)} plats, statut {d['plan']['statut']}.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if not args or args[0] == "lire":
        lire()
    elif args[0] == "ajouter" and len(args) > 1:
        a = appel("POST", "/api/achats", {"texte": " ".join(args[1:]), "par": "O"})["achat"]
        print(f"Ajouté : [{a['id']}] {a['texte']}")
    elif args[0] == "retirer" and len(args) == 2:
        appel("DELETE", f"/api/achats/{int(args[1])}")
        print(f"Retiré : {args[1]}")
    elif args[0] == "vider-achats":
        appel("DELETE", "/api/achats")
        print("Liste du prochain drive vidée.")
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
    elif args[0] == "plan":
        plan()
    elif args[0] == "proposer" and len(args) == 3:
        proposer(int(args[1]), args[2])
    elif args[0] == "plan-statut" and len(args) in (3, 4):
        d = appel("POST", f"/api/plan/{int(args[1])}/statut", {"statut": args[2], "message": args[3] if len(args) == 4 else ""})
        print(f"Plan {args[1]} : {d['plan']['statut']}")
    elif args[0] == "plan-question" and len(args) == 3:
        d = appel("POST", f"/api/plan/{int(args[1])}/statut", {"statut": "question", "message": args[2]})
        print(f"Plan {args[1]} : {d['plan']['statut']} (question posée dans l'appli)")
    elif args[0] == "plan-fini" and len(args) == 3:
        d = appel("POST", f"/api/plan/{int(args[1])}/statut", {"statut": "publie", "message": args[2]})
        print(f"Plan {args[1]} : {d['plan']['statut']}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

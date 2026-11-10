"""
build.py — génère l'appli des menus (site statique publié sur GitHub Pages).

Lit les .md de menus (source de vérité, dans OneDrive) et favoris.md, et produit site/ :
- index.html                  : « Ce soir » (le jour est choisi sur le téléphone) + la semaine
- courses.html                : la liste de courses, cases cochées communes aux deux téléphones,
                                + « À penser pour le prochain drive »
- favoris.html                : les recettes adorées
- recettes/<semaine>-<n>.html : une page par recette (photo, provenance, ingrédients, étapes,
                                ♡, remarque, mode cuisine)
- semaines.html, semaines/<semaine>.html : les semaines précédentes
Les retours, la liste « à penser » et les cases cochées passent par le service Cloudflare
menus-orane (static/boite.js, worker/).

Usage:
    python build.py            # build standard
    python build.py --keep 6   # garde 6 semaines au lieu de 5
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import frontmatter
import markdown as md
from jinja2 import Environment, FileSystemLoader, select_autoescape

# --- Config ---------------------------------------------------------

REPO = Path(__file__).parent
SOURCE_MENUS = Path(
    r"C:\Users\orane\OneDrive\Documents\5. DOCUMENTS PERSO\10. RECETTES ET MENUS\menus"
)
SOURCE_FAVORIS = Path(
    r"C:\Users\orane\OneDrive\Documents\5. DOCUMENTS PERSO\10. RECETTES ET MENUS\favoris.md"
)
OUT = REPO / "site"
TEMPLATES = REPO / "templates"
STATIC = REPO / "static"
PHOTOS_CACHE = REPO / "photos.json"  # photo (og:image) de chaque recette source, pour ne pas la rechercher à chaque build

WEEK_FILE_RE = re.compile(r"^(\d{4})-S(\d{1,2})\.md$", re.IGNORECASE)

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
JOURS_COURTS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]
MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août",
               "sept.", "oct.", "nov.", "déc."]
MOTS_VIDES = {"de", "du", "des", "la", "le", "les", "et", "au", "aux", "a", "en", "d", "l",
              "un", "une", "avec", "sans", "pour", "sur", "ou"}

# Préprocessing : insère une ligne vide entre un paragraphe et une liste qui suit
# (sinon python-markdown ne reconnait pas la liste).
_LIST_FIX_RE = re.compile(r"(?m)^(?P<line>[^\-\*\s].*)\n(?P<bullet>[-*]\s)")


def _fix_list_spacing(text: str) -> str:
    prev = None
    while prev != text:
        prev = text
        text = _LIST_FIX_RE.sub(lambda m: m.group("line") + "\n\n" + m.group("bullet"), text)
    return text


def _render_md(text: str) -> str:
    return md.markdown(
        _fix_list_spacing(text),
        extensions=["fenced_code", "tables", "attr_list", "sane_lists"],
    )


def _render_inline(text: str) -> str:
    """Rend du markdown court sans envelopper dans <p> (et sans le « N. » de tête)."""
    text = re.sub(r"^(\d+)\.\s+", "", text)
    html = md.markdown(text, extensions=["sane_lists"])
    m = re.match(r"^<p>(.*)</p>\s*$", html, flags=re.DOTALL)
    return m.group(1) if m else html


def _plain(text: str) -> str:
    """Texte brut : sans liens markdown, gras ni italique."""
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return re.sub(r"\s+", " ", text.replace("**", "").replace("*", "")).strip()


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def _mots(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", _ascii(text)) if w not in MOTS_VIDES and len(w) > 1}


def _cle(*parts: str) -> str:
    return "--".join(re.sub(r"[^a-z0-9]+", "-", _ascii(p)).strip("-")[:48] for p in parts)


def _date_courte(d: date) -> str:
    return f"{d.day} {MOIS_COURTS[d.month - 1]}"  # espace insécable : « 27 oct. » ne se coupe pas


# --- Semaine ISO ----------------------------------------------------


def iso_week_label(year: int, week: int) -> tuple[date, date]:
    return date.fromisocalendar(year, week, 1), date.fromisocalendar(year, week, 7)


def fr_date_range(debut: date, fin: date) -> str:
    if debut.month == fin.month:
        return f"{debut.day} – {fin.day} {MOIS[fin.month - 1]}"
    return f"{debut.day} {MOIS[debut.month - 1]} – {fin.day} {MOIS[fin.month - 1]}"


_ENTETE_RE = re.compile(
    r"(\d{1,2})(?:er)?(?:\s+([a-zéèêûôà]+))?\s*(?:\d{4})?\s*→\s*[a-zéèêûôà]+\s+(\d{1,2})(?:er)?\s+([a-zéèêûôà]+)\s+(\d{4})",
    re.IGNORECASE,
)


def _debut_semaine(body: str, lundi: date) -> date:
    """Date du 1er jour du menu, lue dans le titre (« mardi 10 → mercredi 18 novembre 2026 »)."""
    lignes = body.strip().splitlines()
    m = _ENTETE_RE.search(lignes[0]) if lignes else None
    if not m:
        return lundi
    d1, m1, d2, m2, an = m.groups()
    if m2.lower() not in MOIS:
        return lundi
    mois2 = MOIS.index(m2.lower()) + 1
    if m1 and m1.lower() in MOIS:
        mois1 = MOIS.index(m1.lower()) + 1
    else:
        mois1 = mois2 if int(d1) <= int(d2) else (mois2 - 2) % 12 + 1
    try:
        return date(int(an) - (1 if mois1 > mois2 else 0), mois1, int(d1))
    except ValueError:
        return lundi


# --- Photos des recettes sources -------------------------------------


def _photo(url: str, cache: dict) -> str:
    """Photo publiée par le site source (balise og:image), mémorisée dans photos.json."""
    if not url or not url.startswith("http") or url.lower().endswith(".pdf"):
        return ""
    if re.search(r"\.(jpe?g|png|webp)(\?|$)", url, re.IGNORECASE):
        return url
    deja = cache.get(url)
    recent = (date.today() - timedelta(days=7)).isoformat()
    if deja and (deja.get("img") or deja.get("essai", "") > recent):
        return deja.get("img", "")
    img = ""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept-Language": "fr-FR,fr;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=12) as r:
            page = r.read(800_000).decode("utf-8", "replace")
        m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]*content=["\']([^"\']+)', page) or re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*property=["\']og:image', page)
        if m:
            img = m.group(1).replace("&amp;", "&")
    except Exception:
        pass
    cache[url] = {"img": img, "essai": date.today().isoformat()}
    return img


# --- Lecture d'un menu ----------------------------------------------


def _decouper(body: str) -> dict:
    """Découpe le markdown : haut (contexte + tableau), recettes (### …), courses (### …)."""
    out = {"haut": [], "recettes": [], "courses": []}
    zone, item = "haut", None
    for line in body.splitlines():
        h2 = re.match(r"^##\s+(.*)", line)
        h3 = re.match(r"^###\s+(.*)", line)
        if h2:
            titre = h2.group(1).strip().lower()
            zone = "recettes" if titre.startswith("recette") else "courses" if "course" in titre else "autre"
            item = None
            continue
        if h3 and zone in ("recettes", "courses"):
            item = {"titre": h3.group(1).strip(), "lignes": []}
            out[zone].append(item)
            continue
        if zone in ("recettes", "courses") and item is not None:
            item["lignes"].append(line)
        elif zone == "haut":
            out["haut"].append(line)
    return out


def _tableau(lignes: list[str]) -> list[list[str]]:
    """Lignes du tableau « Couverture des repas » : [jour, midi, soir]."""
    rows, vu = [], False
    for line in lignes:
        s = line.strip()
        if s.startswith("|"):
            vu = True
            cells = [c.strip() for c in s.strip("|").split("|")]
            if len(cells) < 3 or cells[0].lower() == "jour" or set(cells[0]) <= set("-: "):
                continue
            rows.append(cells[:3])
        elif vu and rows:
            break
    return rows


def _texte_repas(cell: str) -> str:
    texte = re.split(r"\s+—\s+💡", cell)[0]  # sans le rappel 💡 glissé dans la case
    return _plain(texte).replace("🏠", "").strip()


def _dates(rows: list[list[str]], debut: date) -> list[date | None]:
    dates, cur = [], debut - timedelta(days=1)
    for jour, _midi, _soir in rows:
        m = re.search(r"(\d{1,2})(?:er)?", jour)
        d = None
        if m:
            probe = cur + timedelta(days=1)
            for _ in range(10):
                if probe.day == int(m.group(1)):
                    d = probe
                    break
                probe += timedelta(days=1)
        if d:
            cur = d
        dates.append(d)
    return dates


def _date_du_jour(numero: int, jours_dates: list[date], debut: date) -> date | None:
    for d in jours_dates:
        if d.day == numero:
            return d
    probe = debut
    for _ in range(14):
        if probe.day == numero:
            return probe
        probe += timedelta(days=1)
    return None


def _jour_nomme(texte: str, jours_dates: list[date], debut: date) -> date | None:
    """Date du premier jour de la semaine nommé dans le texte (« vendredi midi » → ce vendredi)."""
    m = re.search(r"\b(" + "|".join(JOURS) + r")\b", texte.lower())
    if not m:
        return None
    wd = JOURS.index(m.group(1))
    for d in jours_dates:
        if d.weekday() == wd:
            return d
    probe = debut
    for _ in range(7):
        if probe.weekday() == wd:
            return probe
        probe += timedelta(days=1)
    return None


def _etapes(texte: str) -> list[str]:
    morceaux = re.split(r"(?<=[.!?])\s+(?=[A-ZÀÂÉÈÊÎÔÛÇ0-9])", texte)
    return [e.strip() for e in morceaux if e.strip()]


def _recette(item: dict, index: int, slug: str, jours_dates: list[date], debut: date, cache: dict) -> dict:
    titre = item["titre"]
    paren = ""
    m = re.search(r"\*\((.*?)\)\*", titre)
    if m:
        nom, paren, reste = titre[: m.start()], m.group(1), titre[m.end():]
    else:
        nom, reste = titre, ""
    nom = _plain(re.sub(r"^\s*\d+\.\s*", "", nom)).strip(" ·-")
    favori = "favori" in reste.lower()

    temps = re.search(r"(\d+)\s*min", paren)
    jours_txt = _plain(paren.split(" — ")[0]) if paren else ""
    quand = re.search(r"\b(" + "|".join(JOURS) + r")\s+(\d{1,2})(?:er)?\s*(soir|midi)?", paren, re.IGNORECASE)
    date_plat, moment = None, ""
    if quand:
        date_plat = _date_du_jour(int(quand.group(2)), jours_dates, debut)
        moment = (quand.group(3) or "").lower() or "soir"

    source_nom, source_url, maison, photo_page = "", "", False, ""
    lignes_etapes, astuce, astuce_quand, part_ludo = [], "", "", ""
    ingredients_recette, dans_ingredients = [], False
    for line in item["lignes"]:
        s = line.strip()
        if not s or s == "---":
            continue
        # « **Ingrédients (4 portions)** : » suivi d'une liste : tout ce qu'il faut pour cuisiner.
        if re.match(r"^\*\*Ingr[ée]dients", s, re.IGNORECASE):
            dans_ingredients = True
            continue
        if dans_ingredients and s.startswith(("- ", "* ")):
            ingredients_recette.append(_plain(s[2:]))
            continue
        dans_ingredients = False
        if s.lower().startswith("photo"):
            lien = re.search(r"\((https?://[^)\s]+)\)", s) or re.search(r"(https?://\S+)", s)
            if lien:
                photo_page = lien.group(1)
            continue
        if s.lower().startswith("source"):
            lien = re.search(r"\[([^\]]+)\]\(([^)]+)\)", s)
            if lien:
                source_nom = re.split(r"\s+[—–-]\s+", lien.group(1))[0].strip()
                source_url = lien.group(2)
            continue
        if s.startswith("💡"):
            a = re.match(r"💡\s*\*\*[^*]+\*\*\s*(?:\(([^)]*)\))?\s*:?\s*(.*)", s)
            if a:
                astuce_quand, astuce = (a.group(1) or "").strip(), _plain(a.group(2))
            continue
        if s.startswith("**Part Ludo**"):
            part_ludo = _plain(s.split(":", 1)[1]) if ":" in s else ""
            part_ludo = part_ludo[:1].upper() + part_ludo[1:]
            continue
        if s.lower().startswith("recette maison"):
            maison = True
            s = re.sub(r"^recette maison[^.:]*[.:]\s*", "", s, flags=re.IGNORECASE)
            if not s:
                continue
        lignes_etapes.append(_plain(s))

    return {
        "index": index,
        "page": f"{slug}-{index}.html",
        "nom": nom,
        "favori": favori,
        "temps": f"{temps.group(1)} min" if temps else "",
        "jours_txt": jours_txt,
        "date_plat": date_plat,
        "moment": moment,
        "source_label": source_nom or "Recette maison",
        "source_url": source_url,
        "photo": _photo(source_url, cache) or _photo(photo_page, cache),
        "meta": " · ".join(x for x in (source_nom or "Recette maison", f"{temps.group(1)} min" if temps else "", "4 portions") if x),
        "etapes": _etapes(" ".join(lignes_etapes)),
        "astuce": astuce,
        "astuce_quand": astuce_quand,
        "astuce_date": _jour_nomme(astuce_quand, jours_dates, debut) if astuce_quand else None,
        "part_ludo": part_ludo,
        "ingredients_recette": ingredients_recette,
        "ingredients": [],
        "mots": _mots(nom),
    }


def _depuis_courses(articles: list[dict]) -> list[str]:
    """Repli pour un ancien menu sans liste d'ingrédients : ce qui est acheté ET ce qui est en stock,
    sans distinction (pour cuisiner, on s'en fiche)."""
    sortie: list[str] = []
    for a in articles:
        if not a["is_note"]:
            sortie.append(a["plain"])
            continue
        for phrase in re.split(r"(?<=\.)\s+", a["plain"]):
            if ":" not in phrase:
                continue
            avant, apres = phrase.split(":", 1)
            morceaux = apres if re.search(r"rien à acheter", avant, re.IGNORECASE) else avant
            morceaux = re.sub(r"\s*à la maison\.?$", "", morceaux.strip())
            for x in re.split(r",\s*|\s+et\s+", morceaux):
                x = re.sub(r"\(.*?\)", "", x).strip(" .")
                if x:
                    sortie.append(x[:1].upper() + x[1:])
    vus, uniques = set(), []
    for x in sortie:
        if _ascii(x) not in vus:
            vus.add(_ascii(x))
            uniques.append(x)
    return uniques


def _articles(lignes: list[str]) -> list[dict]:
    items = []
    for line in lignes:
        s = line.strip()
        if not s.startswith(("- ", "* ")):
            continue
        texte = s[2:].strip()
        items.append({
            "text": _render_inline(texte),
            "plain": _plain(texte),
            "is_note": texte.lower().startswith(("*stock", "_stock", "*", "_")),
        })
    return items


def parse_menu_md(path: Path, cache: dict) -> dict:
    raw = path.read_text(encoding="utf-8")
    post = frontmatter.loads(raw)
    body = post.content if post.metadata else raw

    m = WEEK_FILE_RE.match(path.name)
    if not m:
        raise ValueError(f"Nom de fichier inattendu : {path.name}")
    year, week = int(m.group(1)), int(m.group(2))
    lundi, dimanche = iso_week_label(year, week)
    slug = f"{year}-S{week:02d}"
    debut = _debut_semaine(body, lundi)

    parts = _decouper(body)
    rows = _tableau(parts["haut"])
    dates = _dates(rows, debut)
    jours_dates = [d for d in dates if d]

    # Seuls les vrais plats (« ### 1. Nom *(…)* ») deviennent des recettes, pas « ### Soirée samedi — à apporter ».
    plats = [it for it in parts["recettes"] if re.match(r"^\s*\d+\.", it["titre"]) or "*(" in it["titre"]]
    recettes = [_recette(it, i + 1, slug, jours_dates, debut, cache) for i, it in enumerate(plats)]

    # Liste de courses : groupes, et ingrédients rattachés à leur recette.
    courses = []
    for g in parts["courses"]:
        articles = _articles(g["lignes"])
        titre_court = re.split(r"\s*\(", g["titre"])[0]
        meilleure, score = None, 0
        for r in recettes:
            s = len(_mots(titre_court) & r["mots"])
            if s > score:
                meilleure, score = r, s
        if meilleure is not None:
            meilleure["ingredients"].extend(articles)
        courses.append({
            "titre": _plain(g["titre"]),
            "articles": [{"html": a["text"], "cle": _cle(g["titre"], a["plain"])} for a in articles if not a["is_note"]],
            "notes": [a["text"] for a in articles if a["is_note"]],
        })

    for r in recettes:
        r["ingredients_liste"] = r["ingredients_recette"] or _depuis_courses(r["ingredients"])

    # Les jours, avec la recette du soir (et du midi quand c'est un plat du midi).
    jours = []
    for (jour, midi, soir), d in zip(rows, dates):
        r_soir = next((r for r in recettes if d and r["date_plat"] == d and r["moment"] == "soir"), None)
        r_midi = next((r for r in recettes if d and r["date_plat"] == d and r["moment"] == "midi"), None)
        jours.append({
            "iso": d.isoformat() if d else "",
            "court1": JOURS_COURTS[d.weekday()] if d else _plain(jour)[:3].upper(),
            "court2": str(d.day) if d else "",
            "label": f"{JOURS[d.weekday()].capitalize()} {d.day} {MOIS[d.month - 1]}" if d else _plain(jour),
            "label_court": f"{JOURS[d.weekday()].capitalize()} {d.day}" if d else _plain(jour),
            "midi_txt": _texte_repas(midi),
            # Le midi ne vaut d'être affiché que si ce n'est pas simplement les restes de la veille.
            "midi_special": "" if _texte_repas(midi).lower().startswith(("restes", "—", "libre", "(")) else _texte_repas(midi),
            "soir_txt": _texte_repas(soir),
            # Nom affiché : la recette de la semaine, sinon le texte du tableau sans « (S45, …) » ni « — ».
            "soir_nom": r_soir["nom"] if r_soir else (
                re.sub(r"\s*\([^)]*S\d+[^)]*\)", "", _texte_repas(soir)).strip()
                if _texte_repas(soir) and not _texte_repas(soir).startswith("—") else "Rien de prévu"),
            "recette_soir": r_soir,
            "recette_midi": r_midi,
            "astuces": [
                {"quand": r["astuce_quand"], "texte": r["astuce"], "cle": f"{r['index']}"}
                for r in recettes if r["astuce"] and r["astuce_date"] == d
            ] if d else [],
        })

    fin = jours_dates[-1] if jours_dates else dimanche
    drive = re.search(r"Drive[^.\n]*?\b(" + "|".join(JOURS) + r")\s+(\d{1,2})", "\n".join(parts["haut"]), re.IGNORECASE)
    return {
        "year": year,
        "week": week,
        "slug": slug,
        "label": fr_date_range(debut, fin),
        "debut": debut,
        "fin": fin,
        "jours": jours,
        "recettes": recettes,
        "courses": courses,
        "drive": f"drive {drive.group(1).lower()} {drive.group(2)}" if drive else "",
        "is_current": lundi <= date.today() <= dimanche or debut <= date.today() <= fin,
    }


# --- Favoris ----------------------------------------------------------


def parse_favoris(path: Path, cache: dict) -> list[dict]:
    if not path.exists():
        return []
    raw = re.sub(r"<!--.*?-->", "", path.read_text(encoding="utf-8"), flags=re.DOTALL)
    favoris, zone = [], ""
    for line in raw.splitlines():
        h2 = re.match(r"^##\s+(.*)", line)
        if h2:
            zone = h2.group(1).strip().lower()
            continue
        if not zone.startswith("plats") or not line.startswith("- **"):
            continue
        m = re.match(r"^- \*\*(.+?)\*\*\s*(\((.*?)\))?\s*—\s*(.*)$", line)
        if not m:
            continue
        nom, parenthese, reste = m.group(1), m.group(3) or "", m.group(4)
        lien = re.search(r"\[([^\]]+)\]\(([^)]+)\)", parenthese)
        source_url = lien.group(2) if lien else ""
        source = re.split(r"\s+[—–-]\s+", lien.group(1))[0] if lien else ""
        champs = [c.strip() for c in reste.split("|")]
        quand = re.search(r"(\d{4})-(\d{2})-(\d{2})", champs[-1]) if champs else None
        favoris.append({
            "nom": _plain(nom),
            "meta": " · ".join(x for x in (source or "Recette maison", champs[0] if champs and "min" in champs[0] else "") if x),
            "source_label": source or "Recette maison",
            "source_url": source_url,
            "photo": _photo(source_url, cache),
            "temps": champs[0] if champs and "min" in champs[0] else "",
            "tags": [t.strip() for t in champs[1].split(",") if t.strip()] if len(champs) > 1 else [],
            "date_txt": _date_courte(date(int(quand.group(1)), int(quand.group(2)), int(quand.group(3)))) if quand else "",
        })
    return favoris


# --- Build ----------------------------------------------------------


def build(keep_weeks: int = 5) -> None:
    if not SOURCE_MENUS.exists():
        raise SystemExit(f"[ERR] dossier source introuvable : {SOURCE_MENUS}")

    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "recettes").mkdir(parents=True)
    (OUT / "semaines").mkdir()
    for f in STATIC.iterdir():
        shutil.copy(f, OUT / f.name)

    cache = json.loads(PHOTOS_CACHE.read_text(encoding="utf-8")) if PHOTOS_CACHE.exists() else {}

    menus = [parse_menu_md(f, cache) for f in sorted(SOURCE_MENUS.glob("*.md")) if WEEK_FILE_RE.match(f.name)]
    menus.sort(key=lambda m: (m["year"], m["week"]), reverse=True)
    menus = menus[:keep_weeks]
    current = next((m for m in menus if m["is_current"]), menus[0] if menus else None)
    archives = [m for m in menus if m is not current]
    favoris = parse_favoris(SOURCE_FAVORIS, cache)

    # Photos d'illustration pour les plats sans photo (illustrations.json), puis favoris → photo du même plat.
    illus_brut = json.loads((REPO / "illustrations.json").read_text(encoding="utf-8")) if (REPO / "illustrations.json").exists() else {}
    illus = {_ascii(k): v for k, v in illus_brut.items() if not k.startswith("_")}
    for m in menus:
        for r in m["recettes"]:
            if not r["photo"] and _ascii(r["nom"]) in illus:
                r["photo"] = _photo(illus[_ascii(r["nom"])], cache)
    avec_photo = [r for m in menus for r in m["recettes"] if r["photo"]]
    for f in favoris:
        if f["photo"]:
            continue
        if _ascii(f["nom"]) in illus:
            f["photo"] = _photo(illus[_ascii(f["nom"])], cache)
            continue
        mots = _mots(f["nom"])
        proche = max(avec_photo, key=lambda r: len(mots & r["mots"]), default=None)
        if proche and len(mots & proche["mots"]) >= 2:
            f["photo"] = proche["photo"]

    # Un soir qui reprend un plat d'une autre semaine (« Poêlée tartiflette (S45) ») pointe vers sa recette,
    # seulement si c'est bien le même plat (tous les mots du tableau se retrouvent dans la recette).
    toutes = [r for m in menus for r in m["recettes"]]
    for m in menus:
        for j in m["jours"]:
            texte = j["soir_txt"]
            if not j["recette_soir"] and texte and not texte.startswith("—") and not texte.lower().startswith(("restes", "resto", "libre")):
                mots = _mots(re.sub(r"\([^)]*\)", "", texte))
                j["recette_soir"] = next((r for r in toutes if mots and mots <= r["mots"]), None)
            # Photo du soir : celle de la recette, sinon une photo d'illustration du plat nommé.
            j["photo"] = j["recette_soir"]["photo"] if j["recette_soir"] else (
                _photo(illus[_ascii(j["soir_nom"])], cache) if _ascii(j["soir_nom"]) in illus else "")

    PHOTOS_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    # Filtres des favoris : les étiquettes qui reviennent au moins deux fois.
    compte: dict[str, int] = {}
    for f in favoris:
        for t in f["tags"]:
            compte[t] = compte.get(t, 0) + 1
    tags = [t for t, n in sorted(compte.items(), key=lambda x: (-x[1], x[0])) if n >= 2][:5]

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    commun = {
        "version": datetime.now().strftime("%Y%m%d%H%M"),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }

    def ecrire(nom: str, tpl: str, **ctx) -> None:
        (OUT / nom).write_text(env.get_template(tpl).render(**commun, **ctx), encoding="utf-8")

    ecrire("index.html", "index.html", page="semaine", root="", menu=current, archives=archives)
    ecrire("courses.html", "courses.html", page="courses", root="", menu=current)
    ecrire("favoris.html", "favoris.html", page="favoris", root="", favoris=favoris, tags=tags)
    ecrire("semaines.html", "semaines.html", page="semaine", root="", archives=archives)
    for m in menus:
        ecrire(f"semaines/{m['slug']}.html", "semaine.html", page="semaine", root="../", menu=m)
        for r in m["recettes"]:
            ecrire(f"recettes/{r['page']}", "recette.html", page="recette", root="../", menu=m, r=r)

    print(f"[OK] Site genere dans {OUT}")
    print(f"  - {len(menus)} semaine(s) incluse(s) (max {keep_weeks}), {len(favoris)} favori(s)")
    if current:
        print(f"  - Semaine courante : {current['slug']} ({current['label']}), "
              f"{len(current['recettes'])} recettes, {len(current['jours'])} jours")


def main():
    parser = argparse.ArgumentParser(description="Génère l'appli des menus.")
    parser.add_argument("--keep", type=int, default=5, help="Nombre de semaines à conserver (défaut 5).")
    args = parser.parse_args()
    build(keep_weeks=args.keep)


if __name__ == "__main__":
    main()

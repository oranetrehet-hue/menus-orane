"""
build.py — génère le site statique du système menus.

Lit les .md de menus depuis le dossier OneDrive (source de vérité)
et produit un site/ statique avec :
- la semaine courante en page d'accueil
- les N dernières semaines en archive
- liste de courses cochable (persistance localStorage côté tel)

Usage:
    python build.py            # build standard
    python build.py --keep 6   # garde 6 semaines au lieu de 5
"""

from __future__ import annotations

import argparse
import re
import shutil
from datetime import date, datetime
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

WEEK_FILE_RE = re.compile(r"^(\d{4})-S(\d{1,2})\.md$", re.IGNORECASE)

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
    """Rend du markdown court (titre, label) sans envelopper dans <p>.
    Échappe les "N. " de tête (sinon Markdown les interprète comme liste ordonnée).
    """
    text = re.sub(r"^(\d+)\.\s+", "", text)  # strip "1. " "2. " etc.
    html = md.markdown(text, extensions=["sane_lists"])
    m = re.match(r"^<p>(.*)</p>\s*$", html, flags=re.DOTALL)
    return m.group(1) if m else html


# --- Helpers --------------------------------------------------------


def iso_week_label(year: int, week: int) -> tuple[date, date]:
    """Retourne le lundi et le dimanche d'une semaine ISO donnée."""
    monday = date.fromisocalendar(year, week, 1)
    sunday = date.fromisocalendar(year, week, 7)
    return monday, sunday


def fr_month(n: int) -> str:
    return [
        "janvier",
        "février",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "août",
        "septembre",
        "octobre",
        "novembre",
        "décembre",
    ][n - 1]


def fr_date_range(monday: date, sunday: date) -> str:
    if monday.month == sunday.month:
        return f"{monday.day} – {sunday.day} {fr_month(monday.month)} {sunday.year}"
    return f"{monday.day} {fr_month(monday.month)} – {sunday.day} {fr_month(sunday.month)} {sunday.year}"


def parse_menu_md(path: Path) -> dict:
    """Parse un menu .md → dict pour le template."""
    raw = path.read_text(encoding="utf-8")
    post = frontmatter.loads(raw)
    body = post.content if post.metadata else raw

    m = WEEK_FILE_RE.match(path.name)
    if not m:
        raise ValueError(f"Nom de fichier inattendu : {path.name}")
    year, week = int(m.group(1)), int(m.group(2))
    monday, sunday = iso_week_label(year, week)

    # Découper les sections principales (Recettes / Liste de courses)
    sections = _split_sections(body)

    html_body = _render_md(body)

    return {
        "year": year,
        "week": week,
        "slug": f"{year}-S{week:02d}",
        "monday": monday,
        "sunday": sunday,
        "label": fr_date_range(monday, sunday),
        "html": html_body,
        "recipes": sections["recipes"],
        "shopping": sections["shopping"],
        "context": sections["context"],
        "is_current": _contains_today(monday, sunday),
    }


def _contains_today(monday: date, sunday: date) -> bool:
    today = date.today()
    return monday <= today <= sunday


def _split_sections(body: str) -> dict:
    """Découpe le markdown en blocs Contexte / Recettes / Courses."""
    out = {"context": "", "recipes": [], "shopping": []}

    # On scanne les titres H2 / H3 pour identifier les blocs principaux.
    # Sections "Recettes" et "Liste de courses" sont nos points d'intérêt.
    lines = body.splitlines()
    current_section = None  # 'top' | 'recipes' | 'shopping' | None
    current_item = None  # accumulateur {"title": str, "lines": [str]}
    buffer_top = []

    def flush_item():
        nonlocal current_item
        if current_item is None:
            return
        target = out[current_section] if current_section in ("recipes", "shopping") else None
        if target is not None:
            html_body = _render_md("\n".join(current_item["lines"]).strip())
            target.append({
                "title": current_item["title"],
                "title_html": _render_inline(current_item["title"]),
                "html": html_body,
                "raw": current_item["lines"],
            })
        current_item = None

    for line in lines:
        h2 = re.match(r"^##\s+(.*)", line)
        h3 = re.match(r"^###\s+(.*)", line)
        if h2:
            flush_item()
            title = h2.group(1).strip().lower()
            if title.startswith("recette"):
                current_section = "recipes"
            elif "course" in title:
                current_section = "shopping"
            else:
                current_section = "top"
            continue
        if h3 and current_section in ("recipes", "shopping"):
            flush_item()
            current_item = {"title": h3.group(1).strip(), "lines": []}
            continue
        if current_section in ("recipes", "shopping") and current_item is not None:
            current_item["lines"].append(line)
        elif current_section in (None, "top"):
            buffer_top.append(line)

    flush_item()

    out["context"] = _render_md("\n".join(buffer_top).strip())

    # Pour la liste de courses : transformer chaque "- item" en check item
    # (clé "entries" et pas "items" pour éviter collision avec dict.items() en Jinja)
    for item in out["shopping"]:
        item["entries"] = _extract_shopping_items(item["raw"])

    return out


def _extract_shopping_items(lines: list[str]) -> list[dict]:
    """Extrait les puces d'une section de courses sous forme cochable."""
    items = []
    for line in lines:
        stripped = line.strip()
        # Ignore lignes vides et non-bullets
        if not stripped or not stripped.startswith(("- ", "* ")):
            continue
        text = stripped[2:].strip()
        # Filtrer les notes ("Stock à vérifier : ...") qui ne sont pas des items à acheter
        is_note = text.lower().startswith(("*stock", "_stock"))
        items.append({"text": _render_inline(text), "is_note": is_note})
    return items


def parse_favoris(path: Path) -> str:
    if not path.exists():
        return ""
    raw = path.read_text(encoding="utf-8")
    return _render_md(raw)


# --- Build ----------------------------------------------------------


def build(keep_weeks: int = 5) -> None:
    if not SOURCE_MENUS.exists():
        raise SystemExit(f"[ERR] dossier source introuvable : {SOURCE_MENUS}")

    # Reset out dir
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    (OUT / "menus").mkdir()

    # Static assets
    if STATIC.exists():
        for f in STATIC.iterdir():
            shutil.copy(f, OUT / f.name)

    # Charger tous les menus, trier décroissant par (year, week)
    menus = []
    for f in sorted(SOURCE_MENUS.glob("*.md")):
        if WEEK_FILE_RE.match(f.name):
            menus.append(parse_menu_md(f))
    menus.sort(key=lambda m: (m["year"], m["week"]), reverse=True)

    # Garder uniquement N dernières
    menus = menus[:keep_weeks]

    if not menus:
        print("[WARN] Aucun menu trouve.")

    # Identifier la semaine courante (ou la plus récente)
    current = next((m for m in menus if m["is_current"]), menus[0] if menus else None)
    archives = [m for m in menus if m is not current]

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    # Page d'accueil = semaine courante (ou redirige si rien)
    index_tpl = env.get_template("index.html")
    favoris_html = parse_favoris(SOURCE_FAVORIS)
    (OUT / "index.html").write_text(
        index_tpl.render(
            current=current,
            archives=archives,
            favoris_html=favoris_html,
            generated_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
        ),
        encoding="utf-8",
    )

    # Une page par menu archivé
    menu_tpl = env.get_template("menu.html")
    for m in menus:
        (OUT / "menus" / f"{m['slug']}.html").write_text(
            menu_tpl.render(
                menu=m,
                generated_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
            ),
            encoding="utf-8",
        )

    print(f"[OK] Site genere dans {OUT}")
    print(f"  - {len(menus)} semaine(s) incluse(s) (max {keep_weeks})")
    if current:
        print(f"  - Semaine courante : {current['slug']} ({current['label']})")


def main():
    parser = argparse.ArgumentParser(description="Génère le site menus statique.")
    parser.add_argument("--keep", type=int, default=5, help="Nombre de semaines à conserver (défaut 5).")
    args = parser.parse_args()
    build(keep_weeks=args.keep)


if __name__ == "__main__":
    main()

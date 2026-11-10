"""icone.py — dessine l'icône de l'appli : « miam » crème sur fond tomate, avec un peu de vapeur.

  python tools/icone.py   # écrit static/icon-512.png, icon-192.png, icon-180.png (iPhone)

Police : Cooper Black (installée avec Office sur l'ordinateur d'Orane).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

STATIC = Path(__file__).resolve().parent.parent / "static"
POLICE = r"C:\Windows\Fonts\COOPBL.TTF"
FOND = (180, 67, 45)      # --accent
CREME = (250, 247, 242)   # --fond
VAPEUR = (240, 196, 178)


def dessiner(taille: int = 1024) -> Image.Image:
    im = Image.new("RGB", (taille, taille), FOND)
    d = ImageDraw.Draw(im)
    # « miam », centré un peu bas pour laisser la place à la vapeur (dans la zone sûre des icônes Android)
    police = ImageFont.truetype(POLICE, int(taille * 0.255))
    texte = "miam"
    x0, y0, x1, y1 = d.textbbox((0, 0), texte, font=police)
    largeur, hauteur = x1 - x0, y1 - y0
    x = (taille - largeur) / 2 - x0
    y = taille * 0.57 - hauteur / 2 - y0
    d.text((x, y), texte, font=police, fill=CREME)
    # trois volutes de vapeur au-dessus
    epaisseur = int(taille * 0.035)
    haut, bas = taille * 0.24, taille * 0.40
    for k, cx in enumerate((0.40, 0.50, 0.60)):
        cx *= taille
        decal = taille * 0.025 * (1 if k % 2 == 0 else -1)
        points = []
        n = 24
        for i in range(n + 1):
            t = i / n
            yy = bas - (bas - haut) * t
            import math
            xx = cx + decal * math.sin(t * math.pi * 2)
            points.append((xx, yy))
        d.line(points, fill=VAPEUR, width=epaisseur, joint="curve")
        for px, py in (points[0], points[-1]):
            r = epaisseur / 2
            d.ellipse((px - r, py - r, px + r, py + r), fill=VAPEUR)
    return im


def main() -> None:
    grand = dessiner(1024)
    for nom, cote in (("icon-512.png", 512), ("icon-192.png", 192), ("icon-180.png", 180)):
        grand.resize((cote, cote), Image.LANCZOS).save(STATIC / nom, optimize=True)
        print(f"{nom} ({cote} px)")


if __name__ == "__main__":
    main()

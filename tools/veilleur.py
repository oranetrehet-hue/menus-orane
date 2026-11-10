"""veilleur.py — tourne en fond sur l'ordinateur d'Orane (lancé à l'ouverture de session Windows).

Toutes les 20 secondes, il demande au service de l'appli s'il y a quelque chose à faire pour Claude :
- une demande de menu envoyée depuis l'appli (« Semaine prochaine »), des plats à changer ou la réponse
  à une question → Claude prépare la proposition (consignes/proposer.md) ;
- un menu validé → Claude écrit le menu en entier, publie l'appli et prépare le panier Chronodrive
  (consignes/finaliser.md), sans jamais passer la commande.
Ce signe de vie permet aussi à l'appli d'afficher « l'ordinateur d'Orane est allumé ».

  pythonw tools/veilleur.py            # en fond (c'est ce que lance le raccourci de démarrage)
  python tools/veilleur.py --une-fois  # un seul tour, pour tester
Journal : tools/veilleur.log
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ICI = Path(__file__).resolve().parent
SECRETS = ICI.parent / "worker" / ".secrets.json"
JOURNAL = ICI / "veilleur.log"
MENUS = Path(r"C:\Users\orane\OneDrive\Documents\5. DOCUMENTS PERSO\10. RECETTES ET MENUS")
# L'appli Claude (paquet Windows) range npm, les bibliothèques Python et la config GitHub dans son dossier
# privé. Lancé au démarrage de Windows, le veilleur ne le voit pas tout seul : on lui donne les vrais chemins.
PAQUET = Path(r"C:\Users\orane\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming")
_CLAUDES = [
    PAQUET / "npm" / "node_modules" / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe",
    Path(r"C:\Users\orane\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"),
]
CLAUDE = next((c for c in _CLAUDES if c.exists()), _CLAUDES[0])
PAUSE = 20
DUREE_MAX = {"proposer": 30 * 60, "finaliser": 75 * 60}
SANS_FENETRE = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def environnement() -> dict:
    """Variables pour Claude et ce qu'il lance (python build.py, git, gh), même hors de l'appli Claude."""
    env = dict(os.environ)
    site = PAQUET / "Python" / "Python314" / "site-packages"
    if site.exists():
        env["PYTHONPATH"] = str(site) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    npm = PAQUET / "npm"
    if npm.exists():
        env["PATH"] = str(npm) + os.pathsep + env.get("PATH", "")
    gh = PAQUET / "GitHub CLI"
    if gh.exists() and not env.get("GH_CONFIG_DIR"):
        env["GH_CONFIG_DIR"] = str(gh)
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def noter(message: str) -> None:
    try:
        if JOURNAL.exists() and JOURNAL.stat().st_size > 2_000_000:
            JOURNAL.replace(JOURNAL.with_suffix(".old.log"))
        with JOURNAL.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S}  {message}\n")
    except OSError:
        pass


def appel(methode: str, chemin: str, corps: dict | None = None) -> dict | None:
    """Appel au service ; None si le réseau ne répond pas (l'ordinateur sort de veille, etc.)."""
    conf = json.loads(SECRETS.read_text(encoding="utf-8"))
    req = urllib.request.Request(
        conf["api"] + chemin,
        data=json.dumps(corps).encode("utf-8") if corps is not None else None,
        method=methode,
        headers={"x-code": conf["code"], "content-type": "application/json", "user-agent": "menus-orane-veilleur/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        noter(f"service : erreur {e.code} sur {chemin}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        noter(f"service injoignable ({e.__class__.__name__})")
    return None


def lancer_claude(consigne: str, pid: int, chrome: bool) -> str:
    """Lance Claude Code dans le dossier des menus ; continue de donner signe de vie pendant qu'il travaille."""
    message = (
        f"Tu es lancé automatiquement par l'appli des menus (tools/veilleur.py) pour le plan n° {pid}. "
        f"Lis la consigne {ICI / 'consignes' / (consigne + '.md')} et applique-la entièrement. "
        "Personne n'est devant l'écran : ne pose aucune question ici, tout passe par l'appli (boite.py)."
    )
    commande = [str(CLAUDE), "-p", "--permission-mode", "auto", "--add-dir", str(ICI.parent)]
    if chrome:
        commande.append("--chrome")
    noter(f"plan {pid} : Claude démarre ({consigne})")
    with JOURNAL.open("a", encoding="utf-8") as sortie:
        proc = subprocess.Popen(
            commande, cwd=MENUS, stdin=subprocess.PIPE, stdout=sortie, stderr=sortie,
            creationflags=SANS_FENETRE, env=environnement(),
        )
        proc.stdin.write(message.encode("utf-8"))
        proc.stdin.close()
        debut = time.monotonic()
        while proc.poll() is None:
            if time.monotonic() - debut > DUREE_MAX[consigne]:
                proc.kill()
                noter(f"plan {pid} : Claude arrêté (trop long)")
                return "trop long"
            time.sleep(PAUSE)
            appel("GET", "/api/plan/a-traiter")  # signe de vie pendant le travail
    noter(f"plan {pid} : Claude a terminé (code {proc.returncode})")
    return str(proc.returncode)


def claude_connecte() -> bool:
    """Claude Code (la commande claude) doit être connecté une fois au compte d'Orane : claude auth login."""
    try:
        r = subprocess.run([str(CLAUDE), "auth", "status"], capture_output=True, timeout=60,
                           creationflags=SANS_FENETRE, env=environnement())
        return bool(json.loads(r.stdout.decode("utf-8", "replace") or "{}").get("loggedIn"))
    except Exception:  # noqa: BLE001
        return False


def traiter(plan: dict) -> None:
    pid, statut = plan["id"], plan["statut"]
    if statut in ("demande", "retours"):
        consigne, chrome, pendant = "proposer", False, "en_cours"
    elif statut == "valide":
        consigne, chrome, pendant = "finaliser", True, "finalisation"
    else:
        return
    if not claude_connecte():
        appel("POST", f"/api/plan/{pid}/statut", {
            "statut": "erreur",
            "reprise": statut,
            "message": "Claude n'est pas encore connecté sur l'ordinateur d'Orane. Sur l'ordinateur, ouvre un "
                       "terminal et tape « claude auth login » (une seule fois), puis touche « Réessayer ».",
        })
        noter(f"plan {pid} : Claude n'est pas connecté (claude auth login)")
        return
    if not appel("POST", f"/api/plan/{pid}/statut", {"statut": pendant}):
        return
    try:
        fin = lancer_claude(consigne, pid, chrome)
    except Exception as e:  # noqa: BLE001 — on ne doit jamais tomber
        fin = repr(e)
        noter(f"plan {pid} : lancement impossible : {fin}")
    # Si Claude s'est arrêté sans rien renvoyer à l'appli, on le dit (et « Réessayer » relance au même point).
    d = appel("GET", "/api/plan") or {}
    apres = d.get("plan") or {}
    if apres.get("id") == pid and apres.get("statut") == pendant:
        appel("POST", f"/api/plan/{pid}/statut", {
            "statut": "erreur",
            "reprise": statut,
            "message": "Claude s'est arrêté avant la fin. Touche « Réessayer » : il reprendra là où il en était.",
        })
        noter(f"plan {pid} : rien renvoyé à l'appli ({fin}) → erreur affichée")


def main() -> None:
    une_fois = "--une-fois" in sys.argv
    verrou = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        verrou.bind(("127.0.0.1", 47613))  # un seul veilleur à la fois
    except OSError:
        if une_fois:
            print("Le veilleur tourne déjà.")
        return
    noter("veilleur démarré")
    while True:
        try:
            d = appel("GET", "/api/plan/a-traiter")
            plan = (d or {}).get("plan")
            if plan:
                noter(f"plan {plan['id']} : {plan['statut']}")
                traiter(plan)
        except Exception as e:  # noqa: BLE001
            noter(f"erreur inattendue : {e!r}")
        if une_fois:
            print("Un tour fait, voir tools/veilleur.log")
            return
        time.sleep(PAUSE)


if __name__ == "__main__":
    main()

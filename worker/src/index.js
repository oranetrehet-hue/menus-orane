// Worker « menus-orane » : la boîte partagée de l'appli des menus.
// - achats  : la liste « Prochain drive » (qui a ajouté quoi : par = O pour Orane, L pour Ludo)
// - retours : ♡ adorée (favori), ♡ retiré (retrait), « à refaire bientôt » (proposer) ou remarque
// - plans   : la préparation de la semaine suivante depuis l'appli (demande → proposition de Claude
//             → réponses plat par plat → menu validé → publié avec le panier Chronodrive prêt)
// - etat    : « pc » = dernière fois que l'ordinateur d'Orane (tools/veilleur.py) a donné signe de vie
// - avatars : les photos d'Orane et de Ludo (jamais publiques)
// - coches  : ancienne liste cochée (plus utilisée par l'appli)
// Toutes les routes /api/ exigent l'en-tête x-code égal au secret CODE.
// Claude lit, vide et marque traités avec tools/boite.py.

const ORIGINES = ["https://oranetrehet-hue.github.io"];

function cors(req) {
  const o = req.headers.get("origin");
  return {
    "access-control-allow-origin": ORIGINES.includes(o) ? o : ORIGINES[0],
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, x-code",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const json = (req, d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(req) },
  });

const propre = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const qui = (v) => (v === "O" || v === "L" ? v : null);
const enJson = (v, max) => {
  const s = JSON.stringify(v ?? null);
  return s.length <= max ? s : null;
};
const lireJson = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

const ACTIFS = ["demande", "en_cours", "question", "proposition", "retours", "valide", "finalisation", "erreur"];
const POUR_CLAUDE = ["demande", "retours", "valide"];

function planPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    statut: row.statut,
    demande: lireJson(row.demande),
    proposition: lireJson(row.proposition),
    reponses: lireJson(row.reponses),
    message: row.message || "",
    reprise: row.reprise || "",
    tour: row.tour,
    par: row.par,
    cree_le: row.cree_le,
    maj: row.maj,
  };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Menus Orane", { status: 404 });
    if (!env.CODE || req.headers.get("x-code") !== env.CODE) return json(req, { erreur: "code" }, 401);

    const db = env.DB;
    const p = url.pathname.replace(/\/+$/, "");
    const m = req.method;

    let corps = {};
    if (m === "POST") {
      try {
        corps = await req.json();
      } catch {
        return json(req, { erreur: "corps" }, 400);
      }
    }

    // ---------- Photos d'Orane (O) et de Ludo (L) ----------
    const av = p.match(/^\/api\/avatars\/(O|L)$/);
    if (av && m === "GET") {
      const row = await db.prepare("SELECT mime, data FROM avatars WHERE qui = ?").bind(av[1]).first();
      if (!row) return json(req, { erreur: "absent" }, 404);
      const octets = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
      return new Response(octets, {
        headers: { "content-type": row.mime, "cache-control": "private, max-age=86400", ...cors(req) },
      });
    }
    if (av && m === "POST") {
      const mime = propre(corps.mime, 40);
      const data = typeof corps.data === "string" ? corps.data : "";
      if (!mime.startsWith("image/") || !data || data.length > 200000) return json(req, { erreur: "image" }, 400);
      await db.prepare("INSERT OR REPLACE INTO avatars (qui, mime, data) VALUES (?, ?, ?)").bind(av[1], mime, data).run();
      return json(req, { ok: true });
    }

    // ---------- Ce que Claude doit voir : liste du drive + retours pas encore pris en compte ----------
    if (m === "GET" && p === "/api/tout") {
      const achats = await db.prepare("SELECT id, texte, par, cree_le FROM achats ORDER BY id").all();
      const retours = await db
        .prepare("SELECT id, semaine, recette, type, texte, par, cree_le FROM retours WHERE traite = 0 ORDER BY id")
        .all();
      return json(req, { achats: achats.results, retours: retours.results });
    }

    // ---------- Prochain drive ----------
    if (m === "POST" && p === "/api/achats") {
      const texte = propre(corps.texte, 120);
      if (!texte) return json(req, { erreur: "vide" }, 400);
      const achat = await db
        .prepare("INSERT INTO achats (texte, par) VALUES (?, ?) RETURNING id, texte, par, cree_le")
        .bind(texte, qui(corps.par))
        .first();
      return json(req, { achat }, 201);
    }
    if (m === "DELETE" && p === "/api/achats") {
      await db.prepare("DELETE FROM achats").run();
      return json(req, { ok: true });
    }
    let id = p.match(/^\/api\/achats\/(\d+)$/);
    if (m === "DELETE" && id) {
      await db.prepare("DELETE FROM achats WHERE id = ?").bind(Number(id[1])).run();
      return json(req, { ok: true });
    }

    // ---------- Retours sur les recettes ----------
    // Historique affiché dans l'appli : tout, ou une recette.
    if (m === "GET" && p === "/api/retours") {
      const recette = propre(url.searchParams.get("recette"), 200);
      const r = recette
        ? await db
            .prepare("SELECT id, recette, type, texte, par, cree_le, traite FROM retours WHERE recette = ? ORDER BY id")
            .bind(recette)
            .all()
        : await db.prepare("SELECT id, recette, type, texte, par, cree_le, traite FROM retours ORDER BY id DESC LIMIT 500").all();
      return json(req, { retours: r.results });
    }
    if (m === "POST" && p === "/api/retours") {
      const type = ["favori", "retrait", "proposer"].includes(corps.type) ? corps.type : "remarque";
      const recette = propre(corps.recette, 200);
      const texte = propre(corps.texte, 1000);
      if (!recette || (type === "remarque" && !texte)) return json(req, { erreur: "vide" }, 400);
      const retour = await db
        .prepare(
          "INSERT INTO retours (semaine, recette, type, texte, par) VALUES (?, ?, ?, ?, ?) RETURNING id, recette, type, texte, par, cree_le, traite",
        )
        .bind(propre(corps.semaine, 20), recette, type, texte, qui(corps.par))
        .first();
      return json(req, { retour }, 201);
    }
    // Annulé depuis l'appli par la personne qui l'a fait (après confirmation).
    // Un ♡ déjà pris en compte par Claude devient un « retrait » pour qu'il l'enlève de favoris.md.
    id = p.match(/^\/api\/retours\/(\d+)\/annuler$/);
    if (m === "POST" && id) {
      const row = await db.prepare("SELECT id, type, traite, par FROM retours WHERE id = ?").bind(Number(id[1])).first();
      if (!row) return json(req, { ok: true });
      if (row.par && qui(corps.par) && row.par !== qui(corps.par)) return json(req, { erreur: "auteur" }, 403);
      if (row.type === "favori" && row.traite === 1) {
        await db
          .prepare("UPDATE retours SET type = 'retrait', traite = 0, par = ?, cree_le = datetime('now') WHERE id = ?")
          .bind(qui(corps.par) || row.par, row.id)
          .run();
      } else {
        await db.prepare("DELETE FROM retours WHERE id = ?").bind(row.id).run();
      }
      return json(req, { ok: true });
    }
    // Pris en compte par Claude.
    id = p.match(/^\/api\/retours\/(\d+)$/);
    if (m === "DELETE" && id) {
      await db.prepare("UPDATE retours SET traite = 1 WHERE id = ?").bind(Number(id[1])).run();
      return json(req, { ok: true });
    }

    // ---------- Préparer la semaine suivante ----------
    const vuPc = async () => {
      const r = await db.prepare("SELECT valeur FROM etat WHERE cle = 'pc'").first();
      return r ? r.valeur : "";
    };
    const planActif = () =>
      db
        .prepare(`SELECT * FROM plans WHERE statut IN (${ACTIFS.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 1`)
        .bind(...ACTIFS)
        .first();
    const dernierPlan = () => db.prepare("SELECT * FROM plans ORDER BY id DESC LIMIT 1").first();
    const majPlan = (pid, champs) => {
      const cles = Object.keys(champs);
      return db
        .prepare(`UPDATE plans SET ${cles.map((c) => `${c} = ?`).join(", ")}, maj = datetime('now') WHERE id = ?`)
        .bind(...cles.map((c) => champs[c]), pid)
        .run();
    };

    // L'appli : le plan en cours (ou le dernier terminé), et si l'ordinateur est allumé.
    if (m === "GET" && p === "/api/plan") {
      const row = (await planActif()) || (await dernierPlan());
      return json(req, { plan: planPublic(row), pc: await vuPc(), maintenant: new Date().toISOString() });
    }
    // L'ordinateur d'Orane (veilleur.py) : signe de vie + ce qu'il y a à faire pour Claude.
    if (m === "GET" && p === "/api/plan/a-traiter") {
      await db
        .prepare("INSERT INTO etat (cle, valeur) VALUES ('pc', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
        .bind(new Date().toISOString())
        .run();
      const row = await db
        .prepare(`SELECT * FROM plans WHERE statut IN (${POUR_CLAUDE.map(() => "?").join(",")}) ORDER BY id LIMIT 1`)
        .bind(...POUR_CLAUDE)
        .first();
      return json(req, { plan: planPublic(row) });
    }
    // Nouvelle demande depuis l'appli (remplace une demande pas encore aboutie).
    if (m === "POST" && p === "/api/plan") {
      const demande = enJson(corps.demande, 6000);
      if (!demande || !corps.demande) return json(req, { erreur: "demande" }, 400);
      await db
        .prepare(`UPDATE plans SET statut = 'annule', maj = datetime('now') WHERE statut IN (${ACTIFS.map(() => "?").join(",")})`)
        .bind(...ACTIFS)
        .run();
      const row = await db
        .prepare("INSERT INTO plans (statut, demande, par) VALUES ('demande', ?, ?) RETURNING *")
        .bind(demande, qui(corps.par))
        .first();
      return json(req, { plan: planPublic(row) }, 201);
    }

    const pl = p.match(/^\/api\/plan\/(\d+)\/(reponse|annuler|reessayer|proposition|statut)$/);
    if (m === "POST" && pl) {
      const pid = Number(pl[1]);
      const row = await db.prepare("SELECT * FROM plans WHERE id = ?").bind(pid).first();
      if (!row) return json(req, { erreur: "absent" }, 404);
      const action = pl[2];

      if (action === "reponse") {
        // Historique des échanges, tour après tour :
        // - réponse à la proposition, plat par plat : { p1: { ok: true }, p2: { ok: false, raison: "…" } } + un mot ;
        // - réponse à une question de Claude.
        if (!["proposition", "question"].includes(row.statut)) return json(req, { erreur: "statut", plan: planPublic(row) }, 409);
        const ancien = lireJson(row.reponses);
        const liste = Array.isArray(ancien) ? ancien : ancien ? [ancien] : [];
        const le = new Date().toISOString();
        const entree =
          row.statut === "question"
            ? { tour: row.tour, type: "question", question: row.message || "", reponse: propre(corps.reponse, 1000), par: qui(corps.par), le }
            : {
                tour: row.tour,
                type: "plats",
                plats: corps.plats && typeof corps.plats === "object" ? corps.plats : {},
                commentaire: propre(corps.commentaire, 1000),
                valide: !!corps.valider,
                par: qui(corps.par),
                le,
              };
        if (entree.type === "question" && !entree.reponse) return json(req, { erreur: "vide" }, 400);
        liste.push(entree);
        const reponses = enJson(liste, 40000);
        if (!reponses) return json(req, { erreur: "reponse" }, 400);
        await majPlan(pid, { statut: entree.type === "plats" && entree.valide ? "valide" : "retours", reponses, message: "" });
      } else if (action === "annuler") {
        await majPlan(pid, { statut: "annule" });
      } else if (action === "reessayer") {
        if (row.statut !== "erreur" || !POUR_CLAUDE.includes(row.reprise)) return json(req, { erreur: "statut" }, 409);
        await majPlan(pid, { statut: row.reprise, message: "" });
      } else if (action === "proposition") {
        // Claude (boite.py proposer) : la proposition de menu avec les photos.
        const proposition = enJson(corps.proposition, 20000);
        if (!proposition || !corps.proposition) return json(req, { erreur: "proposition" }, 400);
        await majPlan(pid, { statut: "proposition", proposition, tour: (row.tour || 0) + 1, message: propre(corps.message, 600) });
      } else if (action === "statut") {
        // Claude / veilleur : en_cours, finalisation, publie, question (+ message = la question),
        // erreur (+ message, + reprise pour « Réessayer »).
        const statut = ["en_cours", "finalisation", "publie", "erreur", "proposition", "question"].includes(corps.statut) ? corps.statut : "";
        if (!statut) return json(req, { erreur: "statut" }, 400);
        const champs = { statut, message: propre(corps.message, 600) };
        if (statut === "erreur") champs.reprise = POUR_CLAUDE.includes(corps.reprise) ? corps.reprise : "";
        await majPlan(pid, champs);
      }
      const apres = await db.prepare("SELECT * FROM plans WHERE id = ?").bind(pid).first();
      return json(req, { plan: planPublic(apres) });
    }

    // ---------- Ancienne liste cochée en commun (gardée pour ne rien casser) ----------
    if (m === "GET" && p === "/api/coches") {
      const semaine = propre(url.searchParams.get("semaine"), 20);
      const r = await db.prepare("SELECT item, par FROM coches WHERE semaine = ?").bind(semaine).all();
      return json(req, { coches: r.results });
    }
    if (m === "POST" && p === "/api/coches") {
      const semaine = propre(corps.semaine, 20);
      const item = propre(corps.item, 200);
      if (!semaine || !item) return json(req, { erreur: "vide" }, 400);
      if (corps.coche) {
        await db
          .prepare(
            "INSERT INTO coches (semaine, item, par) VALUES (?, ?, ?) ON CONFLICT(semaine, item) DO UPDATE SET par = excluded.par, maj = datetime('now')",
          )
          .bind(semaine, item, propre(corps.par, 4))
          .run();
      } else {
        await db.prepare("DELETE FROM coches WHERE semaine = ? AND item = ?").bind(semaine, item).run();
      }
      return json(req, { ok: true });
    }

    return json(req, { erreur: "inconnu" }, 404);
  },
};

// Worker « menus-orane » : la boîte partagée de l'appli des menus.
// - achats : la liste « À penser pour le prochain drive » (essuie-tout…)
// - retours : ♡ « On a adoré » ou remarque sur une recette
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

    if (m === "GET" && p === "/api/tout") {
      const achats = await db.prepare("SELECT id, texte, cree_le FROM achats ORDER BY id").all();
      const retours = await db
        .prepare("SELECT id, semaine, recette, type, texte, cree_le FROM retours WHERE traite = 0 ORDER BY id")
        .all();
      return json(req, { achats: achats.results, retours: retours.results });
    }

    if (m === "POST" && p === "/api/achats") {
      const texte = propre(corps.texte, 120);
      if (!texte) return json(req, { erreur: "vide" }, 400);
      const achat = await db
        .prepare("INSERT INTO achats (texte) VALUES (?) RETURNING id, texte, cree_le")
        .bind(texte)
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

    if (m === "POST" && p === "/api/retours") {
      const type = corps.type === "favori" ? "favori" : "remarque";
      const recette = propre(corps.recette, 200);
      const texte = propre(corps.texte, 1000);
      if (!recette || (type === "remarque" && !texte)) return json(req, { erreur: "vide" }, 400);
      const retour = await db
        .prepare("INSERT INTO retours (semaine, recette, type, texte) VALUES (?, ?, ?, ?) RETURNING id")
        .bind(propre(corps.semaine, 20), recette, type, texte)
        .first();
      return json(req, { retour }, 201);
    }

    id = p.match(/^\/api\/retours\/(\d+)$/);
    if (m === "DELETE" && id) {
      await db.prepare("UPDATE retours SET traite = 1 WHERE id = ?").bind(Number(id[1])).run();
      return json(req, { ok: true });
    }

    return json(req, { erreur: "inconnu" }, 404);
  },
};

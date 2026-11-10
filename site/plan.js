/* plan.js — préparer la semaine suivante avec Claude, depuis l'appli.
   1. Les questions que Claude pose d'habitude en conversation (soirs, semaine, envie, météo, frigo, budget, drive).
   2. La demande part dans la boîte ; sur l'ordinateur d'Orane, tools/veilleur.py réveille Claude.
   3. Claude propose les plats en photos (ou pose une question) ; Orane ou Ludo garde ou change chaque plat.
   4. Menu validé : Claude l'écrit avec les vraies recettes, publie l'appli et prépare le panier Chronodrive
      (sans jamais commander).
   Sur l'accueil, la carte « Semaine prochaine » montre où on en est. S'appuie sur window.Boite (boite.js). */

(function () {
  var B = window.Boite;
  if (!B) return;
  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
    "septembre", "octobre", "novembre", "décembre"];
  var EN_ATTENTE = ["demande", "en_cours", "retours", "valide", "finalisation"];

  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function depuisIso(s) {
    var p = String(s || "").split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function jourLong(s) {
    var d = depuisIso(s);
    if (isNaN(d.getTime())) return "";
    var j = JOURS[d.getDay()];
    return j.charAt(0).toUpperCase() + j.slice(1) + " " + d.getDate();
  }
  // Pas de « 92 » en fin de ligne et « € » sur la suivante.
  function propre(t) { return String(t || "").replace(/(\d) (€|%|min)/g, "$1 $2"); }

  function pcAllume(etat) {
    if (!etat || !etat.pc) return false;
    var ecart = new Date(etat.maintenant || Date.now()).getTime() - new Date(etat.pc).getTime();
    return ecart >= 0 && ecart < 3 * 60 * 1000;
  }
  function textePc(etat, avant) {
    if (pcAllume(etat)) {
      return avant ? "L'ordinateur d'Orane est allumé : Claude s'y mettra tout de suite." : "L'ordinateur d'Orane est allumé : Claude s'en occupe.";
    }
    return "L'ordinateur d'Orane est éteint ou en veille : Claude s'y mettra dès qu'il sera allumé.";
  }

  /* ---------- Accueil : la carte « Semaine prochaine » ---------- */
  var carte = document.querySelector("[data-plan-carte]");
  if (carte && B.pret()) {
    B.appel("GET", "/api/plan").then(function (etat) {
      var p = etat.plan;
      if (!p || p.statut === "annule") return;
      var recent = Date.now() - new Date(String(p.maj).replace(" ", "T") + "Z").getTime() < 3 * 86400000;
      if (p.statut === "publie" && (carte.hasAttribute("data-prochain") || !recent)) return;
      var plats = (p.proposition && p.proposition.plats) || [];
      var etats = {
        demande: ["Claude prépare votre menu", pcAllume(etat) ? "La proposition arrive dans quelques minutes." : "Il s'y mettra dès que l'ordinateur d'Orane sera allumé.", "Voir"],
        en_cours: ["Claude prépare votre menu", "La proposition arrive dans quelques minutes.", "Voir"],
        retours: ["Claude change les plats refusés", "La nouvelle proposition arrive dans quelques minutes.", "Voir"],
        question: ["Claude a une question", p.message || "Il a besoin d'une précision avant de proposer.", "Répondre"],
        proposition: ["Le menu est prêt à valider", plats.length + " plats proposés par Claude", "Voir les plats"],
        valide: ["Claude publie le menu", "Puis il prépare le panier du drive.", "Voir"],
        finalisation: ["Claude publie le menu", "Puis il prépare le panier du drive.", "Voir"],
        publie: ["Menu publié", propre(p.message).replace(/^menu publié\s*[.:!]?\s*/i, "") || "Le panier du drive est prêt.", "Voir"],
        erreur: ["Claude n'a pas pu terminer", p.message || "Touche pour réessayer.", "Voir"]
      }[p.statut];
      if (!etats) return;
      carte.href = "semaine-prochaine.html";
      carte.classList.add("plan-actif");
      carte.querySelector("[data-plan-titre]").textContent = etats[0];
      carte.querySelector("[data-plan-texte]").textContent = etats[1];
      carte.querySelector("[data-plan-action]").textContent = etats[2];
      if (plats.length) {
        var zone = carte.querySelector("[data-plan-photos]");
        zone.innerHTML = "";
        plats.filter(function (x) { return x.photo; }).slice(0, 3).forEach(function (x) {
          var img = B.el("img");
          img.src = x.photo;
          img.alt = "";
          img.setAttribute("referrerpolicy", "no-referrer");
          zone.appendChild(img);
        });
      }
    }).catch(function () { /* la carte garde son état par défaut */ });
  }

  /* ---------- Page « Semaine prochaine » ---------- */
  var racine = document.querySelector("[data-plan]");
  if (!racine) return;

  var etats = {};
  racine.querySelectorAll("[data-plan-etat]").forEach(function (e) { etats[e.getAttribute("data-plan-etat")] = e; });
  var h1 = racine.querySelector("[data-plan-h1]");
  var sousTitre = racine.querySelector("[data-plan-dates]");
  var minuteur = null;
  var etat = null;
  var nouveau = false;  // « Préparer une autre semaine » après un menu publié

  function montrer(nom, titre) {
    Object.keys(etats).forEach(function (k) { etats[k].hidden = k !== nom; });
    if (titre) h1.textContent = titre;
    window.scrollTo(0, 0);
  }

  /* 1. Les questions */
  var form = etats.questions;
  var debut = depuisIso(racine.getAttribute("data-debut"));
  var auj = new Date(); auj.setHours(0, 0, 0, 0);
  if (isNaN(debut.getTime()) || debut < auj) debut = auj;
  var jours = [];
  for (var i = 0; i < 9; i++) jours.push(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i));
  var fin = jours[jours.length - 1];
  sousTitre.textContent = "Du " + jourLong(iso(jours[0])).toLowerCase() + (jours[0].getMonth() !== fin.getMonth() ? " " + MOIS[jours[0].getMonth()] : "") +
    " au " + jourLong(iso(fin)).toLowerCase() + " " + MOIS[fin.getMonth()];

  function boutonJour(d) {
    var b = B.el("button", "jour-choix");
    b.type = "button";
    b.setAttribute("data-iso", iso(d));
    b.appendChild(B.el("span", "jour-choix-nom", JOURS_COURTS[d.getDay()]));
    b.appendChild(B.el("span", "jour-choix-num", String(d.getDate())));
    return b;
  }
  var soirs = form.querySelector("[data-soirs]");
  var compteSoirs = form.querySelector("[data-soirs-compte]");
  var drive = form.querySelector("[data-drive]");
  jours.forEach(function (d, k) {
    var s = boutonJour(d);
    s.setAttribute("aria-pressed", String(k < 7));
    s.setAttribute("aria-label", jourLong(iso(d)) + " soir à la maison");
    s.addEventListener("click", function () {
      s.setAttribute("aria-pressed", String(s.getAttribute("aria-pressed") !== "true"));
      compter();
    });
    soirs.appendChild(s);
    var dr = boutonJour(d);
    dr.setAttribute("aria-pressed", String(k === 0));
    dr.setAttribute("aria-label", "Drive " + jourLong(iso(d)));
    dr.addEventListener("click", function () {
      drive.querySelectorAll(".jour-choix").forEach(function (x) { x.setAttribute("aria-pressed", String(x === dr)); });
    });
    drive.appendChild(dr);
  });
  function soirsChoisis() {
    return Array.prototype.slice.call(soirs.querySelectorAll('.jour-choix[aria-pressed="true"]')).map(function (b) { return b.getAttribute("data-iso"); });
  }
  function compter() {
    var n = soirsChoisis().length;
    compteSoirs.textContent = n ? n + " dîner" + (n > 1 ? "s" : "") + " à prévoir, qui font aussi les déjeuners du lendemain." : "Choisis au moins un soir.";
  }
  compter();

  form.querySelectorAll(".choix").forEach(function (groupe) {
    var unique = groupe.hasAttribute("data-unique");
    groupe.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        var actif = b.getAttribute("aria-pressed") !== "true";
        if (unique) groupe.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", String(actif));
      });
    });
  });
  var budget = form.querySelector("[data-budget]");
  budget.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      budget.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    });
  });
  function champ(nom) {
    var c = form.querySelector('[data-champ="' + nom + '"]');
    return c ? c.value.trim() : "";
  }
  function pressees(sel) {
    return Array.prototype.slice.call(form.querySelectorAll(sel + ' button[aria-pressed="true"]')).map(function (b) { return b.textContent.trim(); });
  }
  var formMsg = form.querySelector("[data-form-msg]");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var s = soirsChoisis();
    if (!s.length) {
      formMsg.textContent = "Choisis au moins un soir à la maison.";
      soirs.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    var dr = drive.querySelector('.jour-choix[aria-pressed="true"]');
    var demande = {
      soirs: s,
      semaine: champ("semaine"),
      envies: pressees("[data-envies]"),
      envie: champ("envie"),
      meteo: pressees("[data-meteo]")[0] || "",
      frigo: champ("frigo"),
      budget: budget.querySelector('button[aria-pressed="true"]').getAttribute("data-valeur"),
      drive: dr ? dr.getAttribute("data-iso") : "",
      autre: champ("autre"),
      du: iso(jours[0]),
      au: iso(fin)
    };
    var bouton = form.querySelector('button[type="submit"]');
    bouton.disabled = true;
    formMsg.textContent = "Envoi…";
    B.appel("POST", "/api/plan", { demande: demande, par: B.moi() })
      .then(function () { formMsg.textContent = ""; nouveau = false; charger(); })
      .catch(function () { formMsg.textContent = "Pas envoyé : pas de connexion ? Réessaie."; })
      .then(function () { bouton.disabled = false; });
  });

  /* 2. Claude travaille */
  var TEXTES_ATTENTE = {
    demande: ["Claude prépare votre menu", "Il relit vos derniers menus et vos favoris, et cherche les recettes chez Jow, HelloFresh et Quitoque. Ça prend en général 3 à 5 minutes : la proposition vous attendra ici."],
    en_cours: ["Claude prépare votre menu", "Il relit vos derniers menus et vos favoris, et cherche les recettes chez Jow, HelloFresh et Quitoque. Ça prend en général 3 à 5 minutes : la proposition vous attendra ici."],
    retours: ["Claude change les plats", "Il remplace seulement les plats que vous avez refusés, en tenant compte de vos raisons."],
    valide: ["Claude publie le menu", "Il écrit les recettes en entier, met l'appli à jour, puis prépare le panier Chronodrive. Il ne passe jamais la commande : tu choisis le créneau et tu valides."],
    finalisation: ["Claude publie le menu", "Il écrit les recettes en entier, met l'appli à jour, puis prépare le panier Chronodrive. Il ne passe jamais la commande : tu choisis le créneau et tu valides."]
  };

  /* 4. La proposition */
  var avis = {};
  var listeProp = etats.proposition.querySelector("[data-prop-liste]");
  var envoyerProp = etats.proposition.querySelector("[data-prop-envoyer]");
  var msgProp = etats.proposition.querySelector("[data-prop-msg]");

  function majBouton() {
    var n = Object.keys(avis).filter(function (k) { return !avis[k].ok; }).length;
    envoyerProp.textContent = n ? "Envoyer à Claude · " + n + " plat" + (n > 1 ? "s" : "") + " à changer" : "Valider le menu";
  }
  function rendreProposition(p) {
    var prop = p.proposition || {};
    etats.proposition.querySelector("[data-prop-message]").textContent = propre(prop.message || p.message);
    listeProp.innerHTML = "";
    avis = {};
    (prop.plats || []).forEach(function (pl) {
      avis[pl.id] = { ok: true, raison: "" };
      var c = B.el("article", "carte prop-plat");
      if (pl.photo) {
        var img = B.el("img", "prop-photo");
        img.src = pl.photo;
        img.alt = "";
        img.setAttribute("referrerpolicy", "no-referrer");
        c.appendChild(img);
      }
      var t = B.el("div", "prop-textes");
      t.appendChild(B.el("span", "prop-jour", jourLong(pl.jour) + " " + (pl.moment || "soir")));
      t.appendChild(B.el("span", "prop-nom", pl.nom));
      if (pl.pourquoi) t.appendChild(B.el("span", "prop-pourquoi", pl.pourquoi));
      var meta = [pl.temps ? pl.temps + " min" : "", pl.source || ""].filter(Boolean).join(" · ");
      if (meta) t.appendChild(B.el("span", "meta", meta));
      if (pl.url) {
        var lien = B.el("a", "lien-texte prop-lien", "Voir la recette" + (pl.source ? " sur " + pl.source : ""));
        lien.href = pl.url;
        lien.target = "_blank";
        lien.rel = "noopener";
        t.appendChild(lien);
      }
      c.appendChild(t);
      var seg = B.el("div", "segments prop-choix");
      var garder = B.el("button", "", "Je garde");
      var changer = B.el("button", "", "À changer");
      [garder, changer].forEach(function (b) { b.type = "button"; seg.appendChild(b); });
      garder.setAttribute("aria-pressed", "true");
      changer.setAttribute("aria-pressed", "false");
      var raison = B.el("div", "prop-raison");
      raison.hidden = true;
      var lab = B.el("label", "champ-titre", "Qu'est-ce qui ne va pas ?");
      lab.htmlFor = "raison-" + pl.id;
      var zone = B.el("textarea");
      zone.id = "raison-" + pl.id;
      zone.rows = 2;
      zone.maxLength = 300;
      zone.placeholder = "Déjà mangé récemment, trop gras, pas envie de poisson…";
      zone.addEventListener("input", function () { avis[pl.id].raison = zone.value.trim(); });
      raison.appendChild(lab);
      raison.appendChild(zone);
      garder.addEventListener("click", function () {
        avis[pl.id].ok = true;
        garder.setAttribute("aria-pressed", "true");
        changer.setAttribute("aria-pressed", "false");
        raison.hidden = true;
        c.classList.remove("a-changer");
        majBouton();
      });
      changer.addEventListener("click", function () {
        avis[pl.id].ok = false;
        garder.setAttribute("aria-pressed", "false");
        changer.setAttribute("aria-pressed", "true");
        raison.hidden = false;
        c.classList.add("a-changer");
        zone.focus();
        majBouton();
      });
      c.appendChild(seg);
      c.appendChild(raison);
      listeProp.appendChild(c);
    });
    majBouton();
  }
  envoyerProp.addEventListener("click", function () {
    var p = etat && etat.plan;
    if (!p) return;
    var refus = Object.keys(avis).filter(function (k) { return !avis[k].ok; });
    var sansRaison = refus.filter(function (k) { return !avis[k].raison; });
    if (sansRaison.length) {
      msgProp.textContent = "Dis en quelques mots ce qui ne va pas, pour que Claude vise juste.";
      var z = document.getElementById("raison-" + sansRaison[0]);
      if (z) z.focus();
      return;
    }
    var corps = {
      plats: avis,
      commentaire: etats.proposition.querySelector("[data-prop-commentaire]").value.trim(),
      valider: !refus.length,
      par: B.moi()
    };
    var envoi = function () {
      envoyerProp.disabled = true;
      msgProp.textContent = "Envoi…";
      B.appel("POST", "/api/plan/" + p.id + "/reponse", corps)
        .then(function () { msgProp.textContent = ""; charger(); })
        .catch(function () { msgProp.textContent = "Pas envoyé : pas de connexion ? Réessaie."; })
        .then(function () { envoyerProp.disabled = false; });
    };
    if (refus.length) {
      envoi();
      return;
    }
    B.confirmer({
      titre: "Valider ce menu ?",
      texte: "Claude va écrire les recettes en entier, mettre l'appli à jour et préparer le panier Chronodrive. Il ne passe jamais la commande : tu choisis le créneau et tu valides.",
      oui: "Valider le menu",
      danger: false
    }).then(function (ok) { if (ok) envoi(); });
  });

  /* 3. La question de Claude */
  var repondre = etats.question.querySelector("[data-question-envoyer]");
  repondre.addEventListener("click", function () {
    var p = etat && etat.plan;
    var zone = etats.question.querySelector("[data-question-reponse]");
    var msg = etats.question.querySelector("[data-question-msg]");
    var texte = zone.value.trim();
    if (!p || !texte) { zone.focus(); return; }
    repondre.disabled = true;
    msg.textContent = "Envoi…";
    B.appel("POST", "/api/plan/" + p.id + "/reponse", { reponse: texte, par: B.moi() })
      .then(function () { zone.value = ""; msg.textContent = ""; charger(); })
      .catch(function () { msg.textContent = "Pas envoyé : pas de connexion ? Réessaie."; })
      .then(function () { repondre.disabled = false; });
  });

  /* Annuler, réessayer, recommencer */
  racine.querySelectorAll("[data-plan-annuler]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = etat && etat.plan;
      if (!p) return;
      B.confirmer({
        titre: "Annuler la demande ?",
        texte: "Claude arrête de préparer ce menu. Tu pourras refaire une demande quand tu veux.",
        oui: "Annuler la demande",
        non: "Continuer"
      }).then(function (ok) {
        if (!ok) return;
        B.appel("POST", "/api/plan/" + p.id + "/annuler", { par: B.moi() }).then(charger).catch(charger);
      });
    });
  });
  racine.querySelector("[data-plan-reessayer]").addEventListener("click", function () {
    var p = etat && etat.plan;
    if (p) B.appel("POST", "/api/plan/" + p.id + "/reessayer", { par: B.moi() }).then(charger).catch(charger);
  });
  racine.querySelector("[data-plan-nouveau]").addEventListener("click", function () {
    nouveau = true;
    rendre();
  });

  function rendre() {
    clearTimeout(minuteur);
    var p = etat && etat.plan;
    var s = p ? p.statut : "";
    if (!p || s === "annule" || (s === "publie" && nouveau)) {
      etats.questions.querySelector("[data-pc-form]").textContent = etat ? textePc(etat, true) : "";
      montrer("questions", "Le menu avec Claude");
      return;
    }
    if (EN_ATTENTE.indexOf(s) >= 0) {
      var t = TEXTES_ATTENTE[s];
      etats.attente.querySelector("[data-attente-titre]").textContent = t[0];
      etats.attente.querySelector("[data-attente-texte]").textContent = t[1];
      var pc = etats.attente.querySelector("[data-pc]");
      pc.textContent = textePc(etat);
      pc.classList.toggle("eteint", !pcAllume(etat));
      etats.attente.querySelector("[data-plan-annuler]").hidden = s === "finalisation";
      montrer("attente", "Le menu avec Claude");
      minuteur = setTimeout(charger, 6000);
      return;
    }
    if (s === "question") {
      etats.question.querySelector("[data-question-texte]").textContent = p.message || "";
      montrer("question", "Une précision");
      return;
    }
    if (s === "proposition") {
      rendreProposition(p);
      montrer("proposition", "Le menu proposé");
      return;
    }
    if (s === "publie") {
      etats.fini.querySelector("[data-fini-texte]").textContent =
        propre(p.message).replace(/^menu publié\s*[.:!]?\s*/i, "") || "Le menu est dans l'appli et le panier du drive est prêt.";
      montrer("fini", "C'est prêt");
      return;
    }
    if (s === "erreur") {
      etats.erreur.querySelector("[data-erreur-texte]").textContent = propre(p.message) || "Quelque chose a coincé de son côté.";
      etats.erreur.querySelector("[data-plan-reessayer]").hidden = !p.reprise;
      montrer("erreur", "Le menu avec Claude");
      return;
    }
    montrer("questions", "Le menu avec Claude");
  }

  function charger() {
    clearTimeout(minuteur);
    if (!B.pret()) {
      montrer("sans-profil", "Le menu avec Claude");
      return;
    }
    B.appel("GET", "/api/plan")
      .then(function (d) { etat = d; rendre(); })
      .catch(function (e) {
        if (e && e.code === 401) {
          montrer("sans-profil", "Le menu avec Claude");
          B.ouvrirProfil("Le code de la maison a changé : entre-le à nouveau.");
          return;
        }
        etats.chargement.textContent = "Pas de connexion pour l'instant. Réessaie dans un moment.";
        montrer("chargement");
        minuteur = setTimeout(charger, 10000);
      });
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      var s = etat && etat.plan ? etat.plan.statut : "";
      if (!etat || EN_ATTENTE.indexOf(s) >= 0) charger();
    }
  });
  charger();
})();

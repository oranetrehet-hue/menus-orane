/* app.js — ce qui se passe sur le téléphone, sans réseau :
   - « Ce soir » : le repas du jour (le soir, ou le midi quand le soir est au resto), sinon le prochain ;
     les gestes « À anticiper » du jour ; dans la semaine, « Aujourd'hui » et les jours passés en retrait ;
   - cases « Fait » des astuces et ingrédients cochés (mémorisés sur ce téléphone) ;
   - onglets Ingrédients / Étapes et mode cuisine (écran qui reste allumé) ;
   - filtres des favoris ; bouton retour qui revient vraiment à l'écran d'avant.
   Le partagé (profil, liste du drive, ♡, remarques) est dans boite.js, la semaine suivante dans plan.js. */

(function () {
  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
    "septembre", "octobre", "novembre", "décembre"];

  function lire(cle) {
    try { return localStorage.getItem(cle) || ""; } catch (_e) { return ""; }
  }
  function ecrire(cle, valeur) {
    try {
      if (valeur) localStorage.setItem(cle, valeur);
      else localStorage.removeItem(cle);
    } catch (_e) { /* ignore */ }
  }
  function isoDuJour(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function majuscule(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* ---------- Ce soir ---------- */
  var maintenant = new Date();
  var aujourdhui = isoDuJour(maintenant);
  var demain = isoDuJour(new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1));
  var dateDuJour = document.querySelector("[data-aujourdhui]");
  if (dateDuJour) {
    dateDuJour.textContent = majuscule(JOURS[maintenant.getDay()]) + " " + maintenant.getDate() + " " + MOIS[maintenant.getMonth()];
  }

  var jours = Array.prototype.slice.call(document.querySelectorAll("[data-jour]"));
  var h1 = document.querySelector("[data-titre-jour]");
  if (h1) {
    // Le repas d'aujourd'hui ; un repas du midi n'est plus « le repas du jour » l'après-midi venu.
    var choix = jours.filter(function (j) {
      var iso = j.getAttribute("data-jour");
      if (iso > aujourdhui) return true;
      if (iso < aujourdhui) return false;
      return !(j.getAttribute("data-moment") === "midi" && maintenant.getHours() >= 15);
    })[0] || null;
    jours.forEach(function (j) { j.hidden = j !== choix; });
    if (choix) {
      var iso = choix.getAttribute("data-jour");
      var moment = choix.getAttribute("data-moment") || "soir";
      var titre;
      if (iso === aujourdhui) titre = moment === "midi" ? "Ce midi" : "Ce soir";
      else if (iso === demain) titre = "Demain " + moment;
      else titre = majuscule(choix.getAttribute("data-nom-jour") || "") + " " + moment;
      h1.textContent = titre;
      // « Ce midi » sous le plat du soir : seulement si c'est bien aujourd'hui.
      choix.querySelectorAll("[data-midi-label]").forEach(function (l) {
        l.textContent = iso === aujourdhui ? "Ce midi" : "Le midi";
      });
    } else {
      // Plus rien de prévu cette semaine : place à la semaine suivante.
      h1.textContent = "Semaine prochaine";
    }
  }
  document.querySelectorAll("[data-astuce-jour]").forEach(function (a) {
    a.hidden = a.getAttribute("data-astuce-jour") !== aujourdhui;
  });
  // La semaine en photos : « Aujourd'hui » sur le bon jour, les jours passés en retrait.
  document.querySelectorAll("[data-tuile-jour]").forEach(function (t) {
    var iso = t.getAttribute("data-tuile-jour");
    if (iso === aujourdhui) {
      t.classList.add("aujourdhui");
      var label = t.querySelector("[data-jour-label]");
      if (label) label.textContent = "Aujourd'hui";
    } else if (iso && iso < aujourdhui) {
      t.classList.add("passe");
    }
  });

  /* ---------- Cases mémorisées sur ce téléphone ---------- */
  document.querySelectorAll("input[data-fait], input[data-ingredient]").forEach(function (c) {
    var cle = "case:" + (c.getAttribute("data-fait") || c.getAttribute("data-ingredient"));
    c.checked = lire(cle) === "1";
    c.addEventListener("change", function () { ecrire(cle, c.checked ? "1" : ""); });
  });

  /* ---------- Onglets Ingrédients / Étapes ---------- */
  var onglets = document.querySelectorAll("[data-onglet]");
  function montrer(nom) {
    onglets.forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-onglet") === nom)); });
    document.querySelectorAll("[data-panneau]").forEach(function (p) { p.hidden = p.getAttribute("data-panneau") !== nom; });
  }
  onglets.forEach(function (b) {
    b.addEventListener("click", function () { montrer(b.getAttribute("data-onglet")); });
  });

  /* ---------- Mode cuisine ---------- */
  var cuisine = document.querySelector("[data-mode-cuisine]");
  var verrou = null;
  if (cuisine) {
    cuisine.addEventListener("click", function () {
      var actif = !document.body.classList.contains("mode-cuisine");
      document.body.classList.toggle("mode-cuisine", actif);
      cuisine.setAttribute("aria-pressed", String(actif));
      if (actif) {
        montrer("etapes");
        if (navigator.wakeLock) {
          navigator.wakeLock.request("screen").then(function (v) { verrou = v; }).catch(function () { /* refusé */ });
        }
      } else if (verrou) {
        verrou.release().catch(function () { /* déjà relâché */ });
        verrou = null;
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && document.body.classList.contains("mode-cuisine") && navigator.wakeLock) {
        navigator.wakeLock.request("screen").then(function (v) { verrou = v; }).catch(function () { /* refusé */ });
      }
    });
  }

  /* ---------- Filtres des favoris ---------- */
  var filtres = document.querySelectorAll("[data-filtre]");
  filtres.forEach(function (b) {
    b.addEventListener("click", function () {
      var tag = b.getAttribute("data-filtre");
      filtres.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      document.querySelectorAll(".favori[data-tags]").forEach(function (f) {
        f.classList.toggle("filtre-cache", !!tag && f.getAttribute("data-tags").split("|").indexOf(tag) === -1);
      });
    });
  });

  /* ---------- Retour : revient à l'écran d'avant (favoris, semaine…) ---------- */
  document.querySelectorAll("[data-retour-auto]").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) {
        ev.preventDefault();
        history.back();
      }
    });
  });

  /* ---------- Appli installable ---------- */
  if ("serviceWorker" in navigator && document.currentScript) {
    navigator.serviceWorker.register(new URL("sw.js", document.currentScript.src)).catch(function () { /* ignore */ });
  }
})();

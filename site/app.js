/* app.js — ce qui se passe sur le téléphone, sans réseau :
   - « Ce soir » : affiche le jour d'aujourd'hui (ou le prochain) et le surligne dans la semaine ;
   - cases « Fait » des astuces et ingrédients cochés (mémorisés sur ce téléphone) ;
   - onglets Ingrédients / Étapes et mode cuisine (écran qui reste allumé) ;
   - filtres des favoris.
   Le partagé (courses, liste à penser, retours) est dans boite.js. */

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

  /* ---------- Ce soir ---------- */
  var jours = Array.prototype.slice.call(document.querySelectorAll("[data-jour]"));
  if (jours.length) {
    var maintenant = new Date();
    var aujourdhui = isoDuJour(maintenant);
    var choix = null;
    var titre = "Ce soir";
    jours.forEach(function (j) { if (j.getAttribute("data-jour") === aujourdhui) choix = j; });
    if (!choix) {
      choix = jours.filter(function (j) { return j.getAttribute("data-jour") > aujourdhui; })[0] || null;
      if (choix) titre = choix.getAttribute("data-label").split(" ").slice(0, 2).join(" ");
      else {
        choix = jours[jours.length - 1];
        titre = "Dernier soir";
      }
    }
    jours.forEach(function (j) { j.hidden = j !== choix; });
    var h1 = document.querySelector("[data-titre-jour]");
    if (h1) h1.textContent = titre;
    var dateDuJour = document.querySelector("[data-aujourdhui]");
    if (dateDuJour) {
      var jour = JOURS[maintenant.getDay()];
      dateDuJour.textContent = jour.charAt(0).toUpperCase() + jour.slice(1) + " " + maintenant.getDate() + " " + MOIS[maintenant.getMonth()];
    }
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
  }

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
        f.hidden = !!tag && f.getAttribute("data-tags").split("|").indexOf(tag) === -1;
      });
    });
  });

  /* ---------- Appli installable ---------- */
  if ("serviceWorker" in navigator && document.currentScript) {
    navigator.serviceWorker.register(new URL("sw.js", document.currentScript.src)).catch(function () { /* ignore */ });
  }
})();

/* boite.js — la boîte partagée de l'appli (service Cloudflare « menus-orane »).
   - « À penser pour le prochain drive » : une liste commune aux deux téléphones.
   - Sur chaque recette : « ♡ On a adoré » et « Une remarque », qui remontent à Claude.
   Le code de la maison se tape une fois par téléphone (gardé dans localStorage).
*/

(function () {
  var API = "https://menus-orane.lirelivre.workers.dev";
  var CLE_CODE = "menus-code";

  function lire(cle) {
    try { return localStorage.getItem(cle) || ""; } catch (_e) { return ""; }
  }
  function ecrire(cle, valeur) {
    try { localStorage.setItem(cle, valeur); } catch (_e) { /* ignore */ }
  }
  function effacer(cle) {
    try { localStorage.removeItem(cle); } catch (_e) { /* ignore */ }
  }

  function appel(methode, chemin, corps) {
    return fetch(API + chemin, {
      method: methode,
      headers: { "content-type": "application/json", "x-code": lire(CLE_CODE) },
      body: corps ? JSON.stringify(corps) : undefined,
      cache: "no-store"
    }).then(function (r) {
      if (r.status === 401) {
        effacer(CLE_CODE);
        throw { code: 401 };
      }
      if (!r.ok) throw { code: r.status };
      return r.json();
    });
  }

  // Titre lisible : sans le numéro, les précisions en italique ni le « ⭐ favori ».
  function nettoyer(titre) {
    return (titre || "")
      .replace(/^\s*\d+\.\s*/, "")
      .replace(/\*\([^)]*\)\*/g, "")
      .replace(/⭐.*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ---------- À penser pour le prochain drive ---------- */
  var boite = document.querySelector("[data-boite]");
  if (boite) {
    var liste = boite.querySelector("[data-boite-liste]");
    var ajout = boite.querySelector("[data-boite-ajout]");
    var codeForm = boite.querySelector("[data-boite-code]");
    var msg = boite.querySelector("[data-boite-msg]");

    var afficher = function (achats) {
      liste.innerHTML = "";
      achats.forEach(function (a) {
        var li = document.createElement("li");
        var nom = document.createElement("span");
        nom.textContent = a.texte;
        var retirer = document.createElement("button");
        retirer.type = "button";
        retirer.className = "boite-retirer";
        retirer.textContent = "×";
        retirer.setAttribute("aria-label", "Retirer " + a.texte);
        retirer.addEventListener("click", function () {
          retirer.disabled = true;
          appel("DELETE", "/api/achats/" + a.id).then(charger).catch(erreur);
        });
        li.appendChild(nom);
        li.appendChild(retirer);
        liste.appendChild(li);
      });
      msg.textContent = achats.length
        ? "Claude les ajoutera au prochain drive."
        : "Rien pour l'instant. Ajoute ce qui manque (essuie-tout, piles…) : Claude le mettra dans le prochain drive.";
    };

    var demanderCode = function (texte) {
      ajout.hidden = true;
      liste.innerHTML = "";
      codeForm.hidden = false;
      msg.textContent = texte || "";
    };

    var erreur = function (e) {
      if (e && e.code === 401) demanderCode("Code incorrect, réessaie.");
      else msg.textContent = "Pas de connexion pour l'instant, réessaie dans un moment.";
    };

    var charger = function () {
      if (!lire(CLE_CODE)) {
        demanderCode();
        return;
      }
      codeForm.hidden = true;
      ajout.hidden = false;
      appel("GET", "/api/tout").then(function (d) { afficher(d.achats); }).catch(erreur);
    };

    ajout.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var champ = ajout.querySelector("input");
      var texte = champ.value.trim();
      if (!texte) return;
      champ.value = "";
      appel("POST", "/api/achats", { texte: texte }).then(charger).catch(function (e) {
        champ.value = texte;
        erreur(e);
      });
    });

    codeForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var code = codeForm.querySelector("input").value.trim().toLowerCase();
      if (!code) return;
      ecrire(CLE_CODE, code);
      charger();
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && lire(CLE_CODE)) charger();
    });

    charger();
  }

  /* ---------- Retours sur les recettes ---------- */
  document.querySelectorAll("[data-retour]").forEach(function (bloc) {
    var recette = nettoyer(bloc.getAttribute("data-recette"));
    var semaine = bloc.getAttribute("data-semaine") || "";
    var cleFavori = "favori:" + semaine + ":" + recette;
    var fav = bloc.querySelector("[data-retour-fav]");
    var ouvrir = bloc.querySelector("[data-retour-ouvrir]");
    var form = bloc.querySelector("[data-retour-form]");
    var zone = form.querySelector("textarea");
    var envoyerBtn = form.querySelector("button");
    var msg = bloc.querySelector("[data-retour-msg]");

    var marquerFavori = function () {
      fav.textContent = "♥ Adorée";
      fav.setAttribute("aria-pressed", "true");
      fav.disabled = true;
    };
    if (lire(cleFavori)) marquerFavori();

    var envoyer = function (type, texte, bouton) {
      if (!lire(CLE_CODE)) {
        msg.textContent = "Entre d'abord le code de la maison (page d'accueil, « À penser pour le prochain drive »).";
        return;
      }
      bouton.disabled = true;
      msg.textContent = "Envoi…";
      appel("POST", "/api/retours", { semaine: semaine, recette: recette, type: type, texte: texte })
        .then(function () {
          if (type === "favori") {
            ecrire(cleFavori, "1");
            marquerFavori();
            msg.textContent = "Noté ! Claude l'ajoutera à vos favoris.";
          } else {
            zone.value = "";
            form.hidden = true;
            bouton.disabled = false;
            msg.textContent = "Merci, Claude en tiendra compte.";
          }
        })
        .catch(function (e) {
          bouton.disabled = false;
          msg.textContent = e && e.code === 401
            ? "Code incorrect : entre-le à nouveau sur la page d'accueil."
            : "Pas envoyé (pas de connexion ?). Réessaie.";
        });
    };

    fav.addEventListener("click", function () { envoyer("favori", "", fav); });
    ouvrir.addEventListener("click", function () {
      form.hidden = !form.hidden;
      if (!form.hidden) zone.focus();
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var texte = zone.value.trim();
      if (texte) envoyer("remarque", texte, envoyerBtn);
    });
  });
})();

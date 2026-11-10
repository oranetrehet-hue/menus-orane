/* boite.js — tout ce qui est partagé entre les téléphones d'Orane et de Ludo,
   via le service Cloudflare « menus-orane » :
   - la liste de courses cochée en commun (avec l'initiale de qui a coché) ;
   - « À penser pour le prochain drive » ;
   - les retours sur les recettes : ♡ adorée, remarque, « à refaire bientôt ».
   Le code de la maison et « je suis Orane / Ludo » se donnent une fois par téléphone. */

(function () {
  var API = "https://menus-orane.lirelivre.workers.dev";
  var CLE_CODE = "menus-code";
  var CLE_QUI = "menus-qui";

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

  var SANS_CODE = "Entre d'abord le code de la maison dans l'onglet Drive.";

  /* ---------- Bouton + : noter un article pour le prochain drive, en un geste ---------- */
  var plus = document.querySelector("[data-ajout-rapide]");
  if (plus) {
    var feuille = document.querySelector("[data-feuille]");
    var voile = document.querySelector("[data-feuille-voile]");
    var feuilleForm = feuille.querySelector("[data-feuille-form]");
    var feuilleChamp = feuilleForm.querySelector("input");
    var feuilleMsg = feuille.querySelector("[data-feuille-msg]");
    var fermer = function () {
      feuille.hidden = true;
      voile.hidden = true;
      feuilleChamp.blur();
    };
    plus.addEventListener("click", function () {
      feuille.hidden = false;
      voile.hidden = false;
      if (!lire(CLE_CODE)) {
        feuilleForm.hidden = true;
        feuilleMsg.textContent = SANS_CODE;
        return;
      }
      feuilleForm.hidden = false;
      feuilleMsg.textContent = "";
      feuilleChamp.focus();  // dans le geste : le clavier s'ouvre tout de suite
    });
    voile.addEventListener("click", fermer);
    feuille.querySelector("[data-feuille-fermer]").addEventListener("click", fermer);
    feuilleForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var texte = feuilleChamp.value.trim();
      if (!texte) return;
      feuilleChamp.value = "";
      feuilleMsg.textContent = "Ajout…";
      appel("POST", "/api/achats", { texte: texte })
        .then(function () {
          feuilleMsg.textContent = texte + " : noté pour le prochain drive.";
          feuilleChamp.focus();
        })
        .catch(function (e) {
          feuilleChamp.value = texte;
          feuilleMsg.textContent = e && e.code === 401
            ? "Code incorrect : entre-le à nouveau dans l'onglet Drive."
            : "Pas de connexion, réessaie.";
        });
    });
  }

  /* ---------- Nos photos (gardées derrière le code de la maison) ---------- */
  if (lire(CLE_CODE)) {
    document.querySelectorAll("[data-avatar]").forEach(function (el) {
      fetch(API + "/api/avatars/" + el.getAttribute("data-avatar"), { headers: { "x-code": lire(CLE_CODE) } })
        .then(function (r) {
          if (!r.ok) throw r.status;
          return r.blob();
        })
        .then(function (b) {
          var img = document.createElement("img");
          img.alt = "";
          img.src = URL.createObjectURL(b);
          el.textContent = "";
          el.appendChild(img);
        })
        .catch(function () { /* on garde l'initiale */ });
    });
  }

  /* ---------- Code de la maison ---------- */
  var codeForm = document.querySelector("[data-code-form]");
  var surCode = [];  // ce qu'il faut recharger une fois le code donné
  if (codeForm) {
    codeForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var code = codeForm.querySelector("#boite-code").value.trim().toLowerCase();
      var qui = codeForm.querySelector('input[name="qui"]:checked');
      if (!code) return;
      ecrire(CLE_CODE, code);
      if (qui) ecrire(CLE_QUI, qui.value);
      codeForm.hidden = true;
      surCode.forEach(function (f) { f(); });
    });
  }
  function demanderCode() {
    if (codeForm) codeForm.hidden = false;
  }

  /* ---------- À penser pour le prochain drive ---------- */
  var boite = document.querySelector("[data-boite]");
  if (boite) {
    var liste = boite.querySelector("[data-boite-liste]");
    var ajout = boite.querySelector("[data-boite-ajout]");
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
        : "Rien pour l'instant. Note ici ce qui manque, Claude l'ajoutera au prochain drive.";
    };

    var erreur = function (e) {
      if (e && e.code === 401) {
        ajout.hidden = true;
        liste.innerHTML = "";
        msg.textContent = "Code incorrect, réessaie.";
        demanderCode();
      } else {
        msg.textContent = "Pas de connexion pour l'instant, réessaie dans un moment.";
      }
    };

    var charger = function () {
      if (!lire(CLE_CODE)) {
        ajout.hidden = true;
        msg.textContent = "";
        demanderCode();
        return;
      }
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

    surCode.push(charger);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && lire(CLE_CODE)) charger();
    });
    charger();
  }

  /* ---------- Liste de courses cochée en commun ---------- */
  var courses = document.querySelector("[data-courses]");
  if (courses) {
    var semaine = courses.getAttribute("data-semaine");
    var cases = Array.prototype.slice.call(document.querySelectorAll("input[data-cle]"));
    var progression = courses.querySelector("[data-progression]");
    var jauge = courses.querySelector("[data-jauge]");
    var synchro = courses.querySelector("[data-synchro]");
    var coursesMsg = courses.querySelector("[data-courses-msg]");
    var cleLocale = "coches:" + semaine;
    var local = {};
    try { local = JSON.parse(lire(cleLocale) || "{}"); } catch (_e) { local = {}; }

    var marquer = function (c, par) {
      c.checked = !!par;
      var pastille = c.parentNode.querySelector("[data-qui]");
      if (!pastille) return;
      if (par === "O" || par === "L") {
        pastille.textContent = par;
        pastille.className = "qui qui-" + par.toLowerCase();
        pastille.setAttribute("aria-label", par === "O" ? "rangé par Orane" : "rangé par Ludo");
        pastille.hidden = false;
      } else {
        pastille.hidden = true;
      }
    };
    var compter = function () {
      var n = cases.filter(function (c) { return c.checked; }).length;
      progression.textContent = n + " sur " + cases.length + " rangé" + (n > 1 ? "s" : "");
      jauge.style.width = (cases.length ? Math.round((100 * n) / cases.length) : 0) + "%";
    };
    var appliquer = function (coches) {
      var parCle = {};
      coches.forEach(function (x) { parCle[x.item] = x.par || "?"; });
      cases.forEach(function (c) { marquer(c, parCle[c.getAttribute("data-cle")] || ""); });
      compter();
    };
    var horsLigne = function (texte) {
      synchro.hidden = true;
      coursesMsg.textContent = texte;
      coursesMsg.hidden = false;
      cases.forEach(function (c) { marquer(c, local[c.getAttribute("data-cle")] || ""); });
      compter();
    };
    var rafraichir = function () {
      if (!lire(CLE_CODE)) {
        horsLigne("Cochées sur ce téléphone seulement : entre le code de la maison en bas pour les partager avec Ludo.");
        return;
      }
      appel("GET", "/api/coches?semaine=" + encodeURIComponent(semaine))
        .then(function (d) {
          synchro.hidden = false;
          coursesMsg.hidden = true;
          appliquer(d.coches);
        })
        .catch(function (e) {
          if (e && e.code === 401) demanderCode();
          horsLigne("Pas de connexion : les cases ne sont pas partagées pour l'instant.");
        });
    };

    cases.forEach(function (c) {
      c.addEventListener("change", function () {
        var cle = c.getAttribute("data-cle");
        var qui = lire(CLE_QUI) || "?";
        marquer(c, c.checked ? qui : "");
        compter();
        if (c.checked) local[cle] = qui; else delete local[cle];
        ecrire(cleLocale, JSON.stringify(local));
        if (lire(CLE_CODE)) {
          appel("POST", "/api/coches", { semaine: semaine, item: cle, coche: c.checked, par: qui })
            .catch(function () { horsLigne("Pas de connexion : la case n'a pas été partagée."); });
        }
      });
    });

    surCode.push(rafraichir);
    rafraichir();
    setInterval(function () { if (!document.hidden) rafraichir(); }, 15000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) rafraichir(); });
  }

  /* ---------- Retours sur les recettes ---------- */
  document.querySelectorAll("[data-retour]").forEach(function (bloc) {
    var recette = bloc.getAttribute("data-recette") || "";
    var semaineRecette = bloc.getAttribute("data-semaine") || "";
    var fav = bloc.querySelector("[data-retour-fav]");
    var ouvrir = bloc.querySelector("[data-retour-ouvrir]");
    var form = bloc.querySelector("[data-retour-form]");
    var proposer = bloc.querySelector("[data-proposer]");
    var msg = bloc.querySelector("[data-retour-msg]");
    var cleFavori = "favori:" + semaineRecette + ":" + recette;
    var cleProposer = "proposer:" + recette;

    var dire = function (texte) { if (msg) msg.textContent = texte; };

    var envoyer = function (type, texte, bouton, reussi) {
      if (!lire(CLE_CODE)) {
        dire(SANS_CODE);
        return;
      }
      if (bouton) bouton.disabled = true;
      dire("Envoi…");
      appel("POST", "/api/retours", { semaine: semaineRecette, recette: recette, type: type, texte: texte })
        .then(reussi)
        .catch(function (e) {
          if (bouton) bouton.disabled = false;
          dire(e && e.code === 401 ? "Code incorrect : entre-le à nouveau dans l'onglet Drive." : "Pas envoyé (pas de connexion ?). Réessaie.");
        });
    };

    if (fav) {
      var marquerFavori = function () {
        fav.setAttribute("aria-pressed", "true");
        fav.setAttribute("aria-label", "Adorée");
        fav.disabled = true;
      };
      if (lire(cleFavori)) marquerFavori();
      fav.addEventListener("click", function () {
        envoyer("favori", "", fav, function () {
          ecrire(cleFavori, "1");
          marquerFavori();
          dire("Noté ! Claude l'ajoutera à vos favoris.");
        });
      });
    }

    if (ouvrir && form) {
      var zone = form.querySelector("textarea");
      var bouton = form.querySelector("button");
      ouvrir.addEventListener("click", function () {
        form.hidden = !form.hidden;
        if (!form.hidden) {
          zone.focus();
          form.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var texte = zone.value.trim();
        if (!texte) return;
        envoyer("remarque", texte, bouton, function () {
          zone.value = "";
          form.hidden = true;
          bouton.disabled = false;
          dire("Merci, Claude en tiendra compte.");
        });
      });
    }

    if (proposer) {
      if (lire(cleProposer)) {
        proposer.textContent = "Demandé à Claude ✓";
        proposer.disabled = true;
      }
      proposer.addEventListener("click", function () {
        envoyer("proposer", "", proposer, function () {
          ecrire(cleProposer, "1");
          proposer.textContent = "Demandé à Claude ✓";
          dire("");
        });
      });
    }
  });
})();

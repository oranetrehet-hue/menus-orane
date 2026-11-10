/* boite.js — ce qui est partagé entre les téléphones d'Orane et de Ludo (service Cloudflare « menus-orane ») :
   - le profil : chaque téléphone retient à qui il est (choisi une fois, avec le code de la maison) ;
     tout ce qui part de ce téléphone est signé O (Orane) ou L (Ludo) ;
   - « Prochain drive » : la liste que chacun complète, avec la photo de qui a ajouté quoi ;
   - les retours sur les recettes : ♡ (et qui a adoré), remarques (et qui les a faites), « à refaire bientôt » ;
   - les feuilles du bas : profil, confirmation avant toute suppression, ajout rapide au drive.
   La préparation de la semaine suivante est dans plan.js, qui s'appuie sur window.Boite. */

(function () {
  // « menus-api » : seulement pour tester l'appli sur l'ordinateur avec une copie du service.
  var API = lire("menus-api") || "https://menus-orane.lirelivre.workers.dev";
  var CLE_CODE = "menus-code";
  var CLE_QUI = "menus-qui";
  var NOMS = { O: "Orane", L: "Ludo" };
  var JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  var MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  function lire(cle) {
    try { return localStorage.getItem(cle) || ""; } catch (_e) { return ""; }
  }
  function ecrire(cle, valeur) {
    try { localStorage.setItem(cle, valeur); } catch (_e) { /* ignore */ }
  }
  function effacer(cle) {
    try { localStorage.removeItem(cle); } catch (_e) { /* ignore */ }
  }
  function moi() {
    var q = lire(CLE_QUI);
    return q === "O" || q === "L" ? q : "";
  }
  function aCode() { return !!lire(CLE_CODE); }
  function pret() { return aCode() && !!moi(); }

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

  function el(tag, classe, texte) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined && texte !== null) e.textContent = texte;
    return e;
  }

  /* « aujourd'hui », « hier », « lun. 10 nov. » (dates du service en UTC) */
  function quand(utc) {
    if (!utc) return "";
    var d = new Date(String(utc).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(utc) ? "" : "Z"));
    if (isNaN(d.getTime())) return "";
    var a = new Date(); a.setHours(0, 0, 0, 0);
    var j = new Date(d.getTime()); j.setHours(0, 0, 0, 0);
    var ecart = Math.round((a - j) / 86400000);
    if (ecart === 0) return "aujourd'hui";
    if (ecart === 1) return "hier";
    return JOURS_COURTS[d.getDay()] + " " + d.getDate() + " " + MOIS_COURTS[d.getMonth()];
  }

  /* ---------- Nos photos (gardées derrière le code de la maison) ---------- */
  var photos = {};
  function photo(q) {
    if (!photos[q]) {
      photos[q] = fetch(API + "/api/avatars/" + q, { headers: { "x-code": lire(CLE_CODE) } })
        .then(function (r) {
          if (!r.ok) throw r.status;
          return r.blob();
        })
        .then(function (b) { return URL.createObjectURL(b); })
        .catch(function () { delete photos[q]; return ""; });
    }
    return photos[q];
  }
  function remplir(rond, q) {
    if (!aCode() || (q !== "O" && q !== "L")) return;
    photo(q).then(function (url) {
      if (!url) return;
      rond.textContent = "";
      var img = el("img");
      img.alt = "";
      img.src = url;
      rond.appendChild(img);
    });
  }
  function avatar(q, classe) {
    var rond = el("span", "avatar avatar-" + (q === "L" ? "l" : q === "O" ? "o" : "vide") + (classe ? " " + classe : ""), q || "?");
    remplir(rond, q);
    return rond;
  }
  document.querySelectorAll("[data-avatar]").forEach(function (rond) { remplir(rond, rond.getAttribute("data-avatar")); });

  /* ---------- Feuilles du bas ---------- */
  function feuille(construire, quandFerme) {
    var voile = el("div", "voile");
    var f = el("div", "feuille");
    f.setAttribute("role", "dialog");
    f.setAttribute("aria-modal", "true");
    var ferme = false;
    function fermer(valeur) {
      if (ferme) return;
      ferme = true;
      voile.remove();
      f.remove();
      document.removeEventListener("keydown", echap);
      if (quandFerme) quandFerme(valeur);
    }
    function echap(ev) { if (ev.key === "Escape") fermer(); }
    voile.addEventListener("click", function () { fermer(); });
    document.addEventListener("keydown", echap);
    document.body.appendChild(voile);
    document.body.appendChild(f);
    construire(f, fermer);
    return fermer;
  }

  /* Confirmation avant de supprimer (ou de valider quelque chose d'important) */
  function confirmer(o) {
    return new Promise(function (resolve) {
      feuille(function (f, fermer) {
        f.appendChild(el("p", "feuille-titre", o.titre));
        if (o.texte) f.appendChild(el("p", "feuille-texte", o.texte));
        var oui = el("button", "bouton-principal" + (o.danger === false ? "" : " danger"), o.oui || "Supprimer");
        oui.type = "button";
        var non = el("button", "bouton-secondaire", o.non || "Annuler");
        non.type = "button";
        oui.addEventListener("click", function () { fermer(true); });
        non.addEventListener("click", function () { fermer(false); });
        f.appendChild(oui);
        f.appendChild(non);
        oui.focus();
      }, function (v) { resolve(v === true); });
    });
  }

  /* Le profil : qui utilise ce téléphone (+ le code de la maison la première fois) */
  function ouvrirProfil(raison) {
    feuille(function (f, fermer) {
      var choisi = moi();
      var avecCode = !aCode();
      f.appendChild(el("p", "feuille-titre", choisi && !avecCode ? "Changer de profil" : "C'est qui ?"));
      f.appendChild(el("p", "feuille-texte", raison ||
        "L'appli retient ton choix sur ce téléphone. Ce que tu ajoutes au drive, tes cœurs et tes remarques seront signés de ta photo."));
      var choix = el("div", "profils");
      ["O", "L"].forEach(function (q) {
        var b = el("button", "profil");
        b.type = "button";
        b.setAttribute("aria-pressed", String(choisi === q));
        b.appendChild(avatar(q, "grand"));
        b.appendChild(el("span", "profil-nom", NOMS[q]));
        b.addEventListener("click", function () {
          choisi = q;
          choix.querySelectorAll(".profil").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          if (!avecCode) valider();
        });
        choix.appendChild(b);
      });
      f.appendChild(choix);
      var champ = null;
      var msg = el("p", "meta");
      msg.setAttribute("role", "status");
      if (avecCode) {
        var lab = el("label", "champ-titre", "Code de la maison");
        lab.htmlFor = "code-maison";
        champ = el("input");
        champ.id = "code-maison";
        champ.type = "text";
        champ.autocomplete = "off";
        champ.setAttribute("autocapitalize", "none");
        champ.spellcheck = false;
        champ.addEventListener("keydown", function (ev) { if (ev.key === "Enter") valider(); });
        f.appendChild(lab);
        f.appendChild(champ);
        var ok = el("button", "bouton-principal", "Valider");
        ok.type = "button";
        ok.addEventListener("click", valider);
        f.appendChild(ok);
      }
      f.appendChild(msg);
      var plusTard = el("button", "bouton-secondaire", avecCode || !choisi ? "Plus tard" : "Fermer");
      plusTard.type = "button";
      plusTard.addEventListener("click", function () { fermer(); });
      f.appendChild(plusTard);

      function valider() {
        if (!choisi) {
          msg.textContent = "Touche ta photo pour dire qui tu es.";
          return;
        }
        if (!champ) {
          var change = choisi !== moi();
          ecrire(CLE_QUI, choisi);
          fermer();
          if (change) location.reload();
          return;
        }
        var code = champ.value.trim().toLowerCase();
        if (!code) {
          msg.textContent = "Entre le code de la maison.";
          champ.focus();
          return;
        }
        ecrire(CLE_CODE, code);
        msg.textContent = "Vérification…";
        appel("GET", "/api/tout")
          .then(function () {
            ecrire(CLE_QUI, choisi);
            fermer();
            location.reload();
          })
          .catch(function (e) {
            msg.textContent = e && e.code === 401 ? "Ce n'est pas le bon code." : "Pas de connexion, réessaie.";
          });
      }
    });
  }

  /* Ma photo en haut à droite */
  document.querySelectorAll("[data-moi]").forEach(function (b) {
    var rond = b.querySelector("[data-avatar-moi]");
    var q = moi();
    if (q && aCode() && rond) {
      rond.className = "avatar avatar-" + q.toLowerCase();
      rond.textContent = q;
      remplir(rond, q);
      b.setAttribute("aria-label", NOMS[q] + " · changer de profil");
    }
    b.addEventListener("click", function () { ouvrirProfil(); });
  });
  document.querySelectorAll("[data-ouvrir-profil]").forEach(function (b) {
    b.addEventListener("click", function () { ouvrirProfil(); });
  });
  // Première ouverture sur ce téléphone (ou code oublié) : on demande qui c'est.
  if (!pret()) ouvrirProfil();

  var SANS_PROFIL = "Choisis d'abord ton profil : ce que tu envoies sera signé de ta photo.";
  var HORS_LIGNE = "Pas de connexion pour l'instant, réessaie dans un moment.";

  /* ---------- Bouton « Au drive » : noter un article en un geste ---------- */
  var plus = document.querySelector("[data-ajout-rapide]");
  if (plus) {
    var ajoutFeuille = document.querySelector("[data-feuille]");
    var ajoutVoile = document.querySelector("[data-feuille-voile]");
    var ajoutForm = ajoutFeuille.querySelector("[data-feuille-form]");
    var ajoutChamp = ajoutForm.querySelector("input");
    var ajoutMsg = ajoutFeuille.querySelector("[data-feuille-msg]");
    var fermerAjout = function () {
      ajoutFeuille.hidden = true;
      ajoutVoile.hidden = true;
      ajoutChamp.blur();
    };
    plus.addEventListener("click", function () {
      if (!pret()) {
        ouvrirProfil(SANS_PROFIL);
        return;
      }
      ajoutFeuille.hidden = false;
      ajoutVoile.hidden = false;
      ajoutMsg.textContent = "";
      ajoutChamp.focus();  // dans le geste : le clavier s'ouvre tout de suite
    });
    ajoutVoile.addEventListener("click", fermerAjout);
    ajoutFeuille.querySelector("[data-feuille-fermer]").addEventListener("click", fermerAjout);
    ajoutForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var texte = ajoutChamp.value.trim();
      if (!texte) return;
      ajoutChamp.value = "";
      ajoutMsg.textContent = "Ajout…";
      appel("POST", "/api/achats", { texte: texte, par: moi() })
        .then(function () {
          ajoutMsg.textContent = texte + " : noté pour le prochain drive.";
          ajoutChamp.focus();
        })
        .catch(function (e) {
          ajoutChamp.value = texte;
          if (e && e.code === 401) {
            fermerAjout();
            ouvrirProfil("Le code de la maison a changé : entre-le à nouveau.");
          } else {
            ajoutMsg.textContent = HORS_LIGNE;
          }
        });
    });
  }

  /* ---------- Prochain drive : la liste commune, signée ---------- */
  var boite = document.querySelector("[data-boite]");
  if (boite) {
    var liste = boite.querySelector("[data-boite-liste]");
    var ajout = boite.querySelector("[data-boite-ajout]");
    var msgBoite = boite.querySelector("[data-boite-msg]");

    var croix = function () {
      var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      s.setAttribute("width", "20");
      s.setAttribute("height", "20");
      s.setAttribute("viewBox", "0 0 24 24");
      s.setAttribute("fill", "none");
      s.setAttribute("stroke", "currentColor");
      s.setAttribute("stroke-width", "2");
      s.setAttribute("stroke-linecap", "round");
      s.setAttribute("aria-hidden", "true");
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M6 6l12 12M18 6L6 18");
      s.appendChild(p);
      return s;
    };

    var afficherAchats = function (achats) {
      liste.innerHTML = "";
      achats.forEach(function (a) {
        var li = el("li", "achat");
        li.appendChild(a.par ? avatar(a.par, "moyen") : el("span", "avatar avatar-vide moyen", "?"));
        var textes = el("span", "achat-textes");
        textes.appendChild(el("span", "achat-nom", a.texte));
        var detail = [a.par ? NOMS[a.par] : "", quand(a.cree_le)].filter(Boolean).join(" · ");
        if (detail) textes.appendChild(el("span", "meta", detail));
        li.appendChild(textes);
        var retirer = el("button", "boite-retirer");
        retirer.type = "button";
        retirer.setAttribute("aria-label", "Retirer " + a.texte);
        retirer.appendChild(croix());
        retirer.addEventListener("click", function () {
          confirmer({
            titre: "Retirer « " + a.texte + " » ?",
            texte: (a.par && a.par !== moi() ? "Noté par " + NOMS[a.par] + ". " : "") + "Il ne sera plus dans la liste du prochain drive.",
            oui: "Retirer"
          }).then(function (ok) {
            if (!ok) return;
            retirer.disabled = true;
            appel("DELETE", "/api/achats/" + a.id).then(chargerAchats).catch(erreurBoite);
          });
        });
        li.appendChild(retirer);
        liste.appendChild(li);
      });
      msgBoite.textContent = achats.length
        ? "Claude les mettra dans le panier du prochain drive."
        : "Rien pour l'instant. Note ici ce qui manque : Claude le mettra dans le panier du prochain drive.";
    };

    var erreurBoite = function (e) {
      if (e && e.code === 401) {
        ouvrirProfil("Le code de la maison a changé : entre-le à nouveau.");
      } else {
        msgBoite.textContent = HORS_LIGNE;
      }
    };

    var chargerAchats = function () {
      if (!pret()) {
        ajout.hidden = true;
        liste.innerHTML = "";
        msgBoite.textContent = SANS_PROFIL;
        return;
      }
      ajout.hidden = false;
      appel("GET", "/api/tout").then(function (d) { afficherAchats(d.achats); }).catch(erreurBoite);
    };

    ajout.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var champ = ajout.querySelector("input");
      var texte = champ.value.trim();
      if (!texte) return;
      champ.value = "";
      appel("POST", "/api/achats", { texte: texte, par: moi() }).then(chargerAchats).catch(function (e) {
        champ.value = texte;
        erreurBoite(e);
      });
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && pret()) chargerAchats();
    });
    chargerAchats();
  }

  /* ---------- Qui a adoré : favoris.md (noté par Claude) + les ♡ donnés dans l'appli ---------- */
  function coeursDe(statiques, lignes) {
    var c = {};
    (statiques || "").split("").forEach(function (q) { if (NOMS[q]) c[q] = { statique: true }; });
    lignes.forEach(function (r) {
      if (!NOMS[r.par]) return;
      if (r.type === "favori") c[r.par] = { id: r.id };
      if (r.type === "retrait") delete c[r.par];
    });
    return c;
  }
  function nomsDe(qui) {
    return qui.length === 2 ? "Orane et Ludo" : qui.length ? NOMS[qui[0]] : "";
  }
  function dessinerCoeurs(zone, qui, suffixe) {
    zone.innerHTML = "";
    qui.forEach(function (q) { zone.appendChild(avatar(q, "mini")); });
    var t = el("span", "favori-coeurs-noms", nomsDe(qui) + (suffixe ? suffixe(qui) : ""));
    zone.appendChild(t);
  }

  /* ---------- Page d'une recette : ♡, qui a adoré, remarques ---------- */
  var rp = document.querySelector("[data-recette-page]");
  if (rp) {
    var nomRecette = rp.getAttribute("data-recette") || "";
    var semaine = rp.getAttribute("data-semaine") || "";
    var statiques = rp.getAttribute("data-coeurs") || "";
    var fav = rp.querySelector("[data-retour-fav]");
    var adoree = rp.querySelector("[data-adoree]");
    var zoneRem = rp.querySelector("[data-remarques]");
    var listeRem = rp.querySelector("[data-remarques-liste]");
    var ouvrir = rp.querySelector("[data-retour-ouvrir]");
    var form = rp.querySelector("[data-retour-form]");
    var msgRp = rp.querySelector("[data-retour-msg]");
    var lignes = [];
    var dire = function (t) { if (msgRp) msgRp.textContent = t; };

    var rendre = function () {
      var c = coeursDe(statiques, lignes);
      var qui = ["O", "L"].filter(function (q) { return c[q]; });
      var mien = !!c[moi()];
      fav.setAttribute("aria-pressed", String(mien));
      fav.setAttribute("aria-label", mien ? "Retirer de mes favoris" : "Ajouter à mes favoris");
      adoree.hidden = !qui.length;
      if (qui.length) {
        dessinerCoeurs(adoree, qui, function (q) { return q.length === 2 ? " l'ont adorée" : " l'a adorée"; });
      }
      var rem = lignes.filter(function (r) { return r.type === "remarque"; });
      listeRem.innerHTML = "";
      rem.forEach(function (r) {
        var li = el("li", "remarque");
        li.appendChild(avatar(r.par, "moyen"));
        var corps = el("div", "remarque-corps");
        var tete = el("p", "remarque-tete");
        tete.appendChild(el("span", "remarque-nom", NOMS[r.par] || "Quelqu'un"));
        tete.appendChild(el("span", "meta", " · " + quand(r.cree_le) + (r.traite ? " · vue par Claude" : "")));
        corps.appendChild(tete);
        corps.appendChild(el("p", "remarque-texte", r.texte));
        if (r.par && r.par === moi()) {
          var sup = el("button", "lien-discret-bouton", "Supprimer");
          sup.type = "button";
          sup.addEventListener("click", function () {
            confirmer({
              titre: "Supprimer ta remarque ?",
              texte: "« " + (r.texte.length > 90 ? r.texte.slice(0, 90) + "…" : r.texte) + " »",
              oui: "Supprimer"
            }).then(function (ok) {
              if (!ok) return;
              appel("POST", "/api/retours/" + r.id + "/annuler", { par: moi() }).then(charger).catch(function () { dire(HORS_LIGNE); });
            });
          });
          corps.appendChild(sup);
        }
        li.appendChild(corps);
        listeRem.appendChild(li);
      });
      zoneRem.hidden = !rem.length;
    };

    var charger = function () {
      if (!aCode()) { rendre(); return; }
      appel("GET", "/api/retours?recette=" + encodeURIComponent(nomRecette))
        .then(function (d) { lignes = d.retours || []; rendre(); })
        .catch(function () { rendre(); });
    };

    fav.addEventListener("click", function () {
      if (!pret()) { ouvrirProfil(SANS_PROFIL); return; }
      var mien = coeursDe(statiques, lignes)[moi()];
      if (mien) {
        confirmer({
          titre: "Retirer ce plat de tes favoris ?",
          texte: "Claude ne le comptera plus parmi tes recettes adorées.",
          oui: "Retirer"
        }).then(function (ok) {
          if (!ok) return;
          var envoi = mien.id
            ? appel("POST", "/api/retours/" + mien.id + "/annuler", { par: moi() })
            : appel("POST", "/api/retours", { semaine: semaine, recette: nomRecette, type: "retrait", par: moi() });
          envoi.then(function () { dire(""); charger(); }).catch(function () { dire(HORS_LIGNE); });
        });
      } else {
        fav.disabled = true;
        appel("POST", "/api/retours", { semaine: semaine, recette: nomRecette, type: "favori", par: moi() })
          .then(function () { dire("Ajoutée à tes favoris."); charger(); })
          .catch(function () { dire(HORS_LIGNE); })
          .then(function () { fav.disabled = false; });
      }
    });

    if (ouvrir && form) {
      var zone = form.querySelector("textarea");
      var bouton = form.querySelector("button");
      ouvrir.addEventListener("click", function () {
        if (!pret()) { ouvrirProfil(SANS_PROFIL); return; }
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
        bouton.disabled = true;
        dire("Envoi…");
        appel("POST", "/api/retours", { semaine: semaine, recette: nomRecette, type: "remarque", texte: texte, par: moi() })
          .then(function () {
            zone.value = "";
            form.hidden = true;
            dire("Merci, Claude en tiendra compte.");
            charger();
          })
          .catch(function () { dire("Pas envoyé (pas de connexion ?). Réessaie."); })
          .then(function () { bouton.disabled = false; });
      });
    }
    charger();
  }

  /* ---------- Favoris : qui a adoré, ♡ tout juste donnés, « à refaire bientôt » ---------- */
  var listeFav = document.querySelector("[data-liste-favoris]");
  if (listeFav) {
    var index = {};
    try { index = JSON.parse((document.getElementById("index-recettes") || {}).textContent || "{}"); } catch (_e) { index = {}; }
    var compte = document.querySelector("[data-fav-compte]");
    var vide = listeFav.querySelector("[data-fav-vide]");

    var brancherProposer = function (art, lignesRecette) {
      var b = art.querySelector("[data-proposer]");
      if (!b) return;
      var attente = lignesRecette.filter(function (r) { return r.type === "proposer" && !r.traite; }).pop();
      if (attente) {
        b.textContent = "Demandé à Claude" + (NOMS[attente.par] ? " par " + NOMS[attente.par] : "");
        b.disabled = true;
      }
      if (b.getAttribute("data-branche")) return;
      b.setAttribute("data-branche", "1");
      b.addEventListener("click", function () {
        if (!pret()) { ouvrirProfil(SANS_PROFIL); return; }
        b.disabled = true;
        appel("POST", "/api/retours", { semaine: "favoris", recette: art.getAttribute("data-recette"), type: "proposer", par: moi() })
          .then(function () { b.textContent = "Demandé à Claude par " + NOMS[moi()]; })
          .catch(function () {
            b.disabled = false;
            var m = art.querySelector("[data-retour-msg]");
            if (m) m.textContent = HORS_LIGNE;
          });
      });
    };

    var nouveauFavori = function (nom, info) {
      var art = el("article", "favori");
      art.setAttribute("data-favori", "");
      art.setAttribute("data-recette", nom);
      art.setAttribute("data-tags", "");
      var a = el("a", "favori-lien");
      a.href = info.page;
      if (info.photo) {
        var img = el("img", "vignette");
        img.src = info.photo;
        img.alt = "";
        img.setAttribute("referrerpolicy", "no-referrer");
        a.appendChild(img);
      } else {
        a.appendChild(el("span", "vignette tuile-sans-photo"));
      }
      var t = el("span", "favori-textes");
      t.appendChild(el("span", "favori-nom", nom));
      t.appendChild(el("span", "meta", info.meta || ""));
      var z = el("span", "favori-coeurs");
      z.setAttribute("data-coeurs-zone", "");
      t.appendChild(z);
      a.appendChild(t);
      art.appendChild(a);
      var b = el("button", "lien-action favori-action", "À refaire bientôt");
      b.type = "button";
      b.setAttribute("data-proposer", "");
      art.appendChild(b);
      var m = el("p", "retour-msg favori-action");
      m.setAttribute("data-retour-msg", "");
      art.appendChild(m);
      return art;
    };

    var appliquer = function (lignesTout) {
      var parRecette = {};
      lignesTout.forEach(function (r) { (parRecette[r.recette] = parRecette[r.recette] || []).push(r); });
      var vus = {};
      listeFav.querySelectorAll("[data-favori]").forEach(function (art) {
        var nom = art.getAttribute("data-recette");
        vus[nom] = true;
        var lr = parRecette[nom] || [];
        var c = coeursDe(art.getAttribute("data-coeurs"), lr);
        var qui = ["O", "L"].filter(function (q) { return c[q]; });
        dessinerCoeurs(art.querySelector("[data-coeurs-zone]"), qui);
        art.classList.toggle("retire", !qui.length);
        brancherProposer(art, lr);
      });
      // Un ♡ donné dans l'appli apparaît tout de suite, avant même que Claude l'ait noté dans favoris.md.
      Object.keys(parRecette).forEach(function (nom) {
        if (vus[nom] || !index[nom]) return;
        var lr = parRecette[nom];
        var c = coeursDe("", lr);
        var qui = ["O", "L"].filter(function (q) { return c[q]; });
        if (!qui.length) return;
        var art = nouveauFavori(nom, index[nom]);
        listeFav.insertBefore(art, listeFav.firstChild);
        dessinerCoeurs(art.querySelector("[data-coeurs-zone]"), qui);
        brancherProposer(art, lr);
      });
      var n = listeFav.querySelectorAll("[data-favori]:not(.retire)").length;
      if (compte) compte.textContent = n + " recette" + (n > 1 ? "s" : "") + " adorée" + (n > 1 ? "s" : "");
      if (vide) vide.hidden = n > 0;
    };

    listeFav.querySelectorAll("[data-favori]").forEach(function (art) { brancherProposer(art, []); });
    if (aCode()) {
      appel("GET", "/api/retours")
        .then(function (d) { appliquer((d.retours || []).slice().reverse()); })
        .catch(function () { /* on garde la liste telle quelle */ });
    }
  }

  window.Boite = {
    API: API,
    NOMS: NOMS,
    appel: appel,
    moi: moi,
    aCode: aCode,
    pret: pret,
    el: el,
    avatar: avatar,
    quand: quand,
    feuille: feuille,
    confirmer: confirmer,
    ouvrirProfil: ouvrirProfil
  };
})();

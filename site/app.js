/* app.js — gestion des cases à cocher de la liste de courses
   Persistance locale via localStorage. Une clé par semaine.
   Chaque tel a son propre état (volontaire : pas de backend).
*/

(function () {
  function loadState(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch (_e) {
      return {};
    }
  }

  function saveState(key, state) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (_e) {
      /* ignore quota */
    }
  }

  // Initialiser les cases à cocher
  document.querySelectorAll(".shopping").forEach(function (container) {
    var key = container.getAttribute("data-storage-key");
    if (!key) return;
    var state = loadState(key);

    container.querySelectorAll('input[type="checkbox"][data-item]').forEach(function (input) {
      var id = input.getAttribute("data-item");
      if (state[id]) input.checked = true;
      input.addEventListener("change", function () {
        state[id] = input.checked;
        saveState(key, state);
      });
    });
  });

  // Boutons "tout décocher"
  document.querySelectorAll(".reset-btn").forEach(function (btn) {
    var key = btn.getAttribute("data-reset-key");
    btn.addEventListener("click", function () {
      if (!confirm("Décocher tous les items de cette liste ?")) return;
      localStorage.removeItem(key);
      document.querySelectorAll('.shopping[data-storage-key="' + key + '"] input[type="checkbox"]').forEach(
        function (inp) { inp.checked = false; }
      );
    });
  });

  // Service worker basique (offline minimal)
  if ("serviceWorker" in navigator) {
    var swPath = location.pathname.indexOf("/menus/") !== -1 ? "../sw.js" : "sw.js";
    navigator.serviceWorker.register(swPath).catch(function () { /* ignore */ });
  }
})();

/* Service worker minimal — pas de cache agressif, juste pour PWA installable.
   On laisse le navigateur gérer le cache HTTP normal (le site est déjà très léger).
*/
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* default network */ });

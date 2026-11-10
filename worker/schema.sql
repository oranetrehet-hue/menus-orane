-- Boîte partagée de l'appli des menus (base D1 « menus-orane »).

-- Liste « À penser pour le prochain drive » : ce que Orane et Ludo ajoutent depuis l'appli.
CREATE TABLE IF NOT EXISTS achats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texte TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Retours sur les recettes : ♡ (favori) ou remarque libre. Claude les marque traités une fois pris en compte.
CREATE TABLE IF NOT EXISTS retours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semaine TEXT,
  recette TEXT NOT NULL,
  type TEXT NOT NULL,
  texte TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  traite INTEGER NOT NULL DEFAULT 0
);

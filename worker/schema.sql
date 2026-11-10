-- Boîte partagée de l'appli des menus (base D1 « menus-orane »).

-- Liste « À penser pour le prochain drive » : ce que Orane et Ludo ajoutent depuis l'appli.
CREATE TABLE IF NOT EXISTS achats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texte TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cases cochées de la liste de courses, communes aux deux téléphones (par = O ou L).
CREATE TABLE IF NOT EXISTS coches (
  semaine TEXT NOT NULL,
  item TEXT NOT NULL,
  par TEXT,
  maj TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (semaine, item)
);

-- Photos d'Orane (O) et de Ludo (L), en base64, servies seulement avec le code.
CREATE TABLE IF NOT EXISTS avatars (
  qui TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data TEXT NOT NULL
);

-- Retours sur les recettes : ♡ (favori), « à refaire bientôt » (proposer) ou remarque libre. Claude les marque traités une fois pris en compte.
CREATE TABLE IF NOT EXISTS retours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semaine TEXT,
  recette TEXT NOT NULL,
  type TEXT NOT NULL,
  texte TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  traite INTEGER NOT NULL DEFAULT 0
);

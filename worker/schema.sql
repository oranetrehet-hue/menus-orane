-- Boîte partagée de l'appli des menus (base D1 « menus-orane »).
-- par = O (Orane) ou L (Ludo) : qui a fait quoi.

-- Liste « Prochain drive » : ce que Orane et Ludo ajoutent depuis l'appli.
CREATE TABLE IF NOT EXISTS achats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texte TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  par TEXT
);

-- Cases cochées de la liste de courses (ancienne version de l'appli, plus utilisée).
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

-- Retours sur les recettes : ♡ (favori), ♡ retiré (retrait), « à refaire bientôt » (proposer) ou remarque libre.
-- Claude les marque traités une fois pris en compte.
CREATE TABLE IF NOT EXISTS retours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semaine TEXT,
  recette TEXT NOT NULL,
  type TEXT NOT NULL,
  texte TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  traite INTEGER NOT NULL DEFAULT 0,
  par TEXT
);

-- Préparer la semaine suivante depuis l'appli. statut : demande → en_cours → proposition → retours → …
-- → valide → finalisation → publie (ou erreur / annule). demande, proposition, reponses : JSON.
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statut TEXT NOT NULL,
  demande TEXT,
  proposition TEXT,
  reponses TEXT,
  message TEXT,
  reprise TEXT,
  tour INTEGER NOT NULL DEFAULT 0,
  par TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  maj TEXT NOT NULL DEFAULT (datetime('now'))
);

-- « pc » : dernière fois que l'ordinateur d'Orane (tools/veilleur.py) a donné signe de vie.
CREATE TABLE IF NOT EXISTS etat (cle TEXT PRIMARY KEY, valeur TEXT);

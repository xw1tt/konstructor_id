-- Справочник нормативов портала protect.gost.ru: только сведения из списков разделов (не тексты).
CREATE TABLE norm_catalog (
  id INTEGER PRIMARY KEY,
  section TEXT NOT NULL,
  ord INTEGER NOT NULL,
  designation TEXT NOT NULL,
  title TEXT NOT NULL,
  pages INTEGER NOT NULL,
  status TEXT NOT NULL,
  url TEXT NOT NULL,
  search TEXT NOT NULL
);
CREATE INDEX norm_catalog_section ON norm_catalog(section, ord);

CREATE TABLE norm_sections (
  section TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL
);

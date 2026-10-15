CREATE TABLE organizations (
  id INTEGER PRIMARY KEY,
  short_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  ogrn TEXT NOT NULL DEFAULT '',
  inn TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  sro_name TEXT NOT NULL DEFAULT '',
  sro_ogrn TEXT NOT NULL DEFAULT '',
  sro_inn TEXT NOT NULL DEFAULT ''
);

CREATE TABLE object_info (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  contract_number TEXT NOT NULL DEFAULT '',
  contract_date TEXT,
  city TEXT NOT NULL DEFAULT ''
);
INSERT INTO object_info (id) VALUES (1);

CREATE TABLE object_org_roles (
  role TEXT PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT
);

CREATE TABLE sections (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  designer_org_id INTEGER REFERENCES organizations(id) ON DELETE RESTRICT
);

CREATE TABLE representatives (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  authority_doc TEXT NOT NULL DEFAULT '',
  nrs_number TEXT NOT NULL DEFAULT '',
  nrs_date TEXT,
  valid_from TEXT,
  valid_to TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  pages INTEGER NOT NULL,
  path TEXT NOT NULL
);

CREATE TABLE materials (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  mark TEXT NOT NULL DEFAULT '',
  article TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT ''
);

CREATE TABLE quality_docs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  issue_date TEXT,
  valid_until TEXT,
  sheets INTEGER NOT NULL DEFAULT 0,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL
);

CREATE TABLE material_quality_docs (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  doc_id INTEGER NOT NULL REFERENCES quality_docs(id) ON DELETE CASCADE,
  PRIMARY KEY (material_id, doc_id)
);

ALTER TABLE quality_docs ADD COLUMN registry_name TEXT NOT NULL DEFAULT '';
ALTER TABLE representatives ADD COLUMN act_text TEXT NOT NULL DEFAULT '';

CREATE TABLE acts (
  id INTEGER PRIMARY KEY,
  base_number TEXT NOT NULL,
  date TEXT NOT NULL,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  works TEXT NOT NULL DEFAULT '',
  sheets TEXT NOT NULL DEFAULT '',
  revision TEXT NOT NULL DEFAULT '',
  date_start TEXT,
  date_end TEXT,
  normative TEXT NOT NULL DEFAULT '',
  next_works TEXT NOT NULL DEFAULT '',
  extra_info TEXT NOT NULL DEFAULT 'нет',
  copies INTEGER NOT NULL DEFAULT 4,
  attachments TEXT NOT NULL DEFAULT 'Согласно п.3, п.4.',
  performer_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  vor_title TEXT NOT NULL DEFAULT '',
  vor_customer_rep_id INTEGER REFERENCES representatives(id) ON DELETE SET NULL,
  vor_contractor_rep_id INTEGER REFERENCES representatives(id) ON DELETE SET NULL
);

CREATE TABLE act_materials (
  act_id INTEGER NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  position TEXT NOT NULL DEFAULT 'б/н',
  quantity REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (act_id, material_id)
);

CREATE TABLE act_documents (
  id INTEGER PRIMARY KEY,
  act_id INTEGER NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  date TEXT,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE vor_lines (
  id INTEGER PRIMARY KEY,
  act_id INTEGER NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  grp TEXT NOT NULL DEFAULT '',
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

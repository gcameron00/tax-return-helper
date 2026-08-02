-- Migration number: 0001 	 2026-08-02T16:10:38.305Z

-- Household-level, not per-year: the family does not change as often as the
-- document list. See docs/data-model.md.
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL
);

-- taxYear is the natural key (the year the return is about, not the year
-- filed) and doubles as the /?year= deep link.
CREATE TABLE tax_years (
  tax_year INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'final')),
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  note TEXT
);

-- Nested inside the year, not shared across years: a finalised year must
-- stay a faithful record, so renaming a category later must not rewrite
-- history. Carry-over copies structure; it does not alias it.
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  tax_year INTEGER NOT NULL REFERENCES tax_years (tax_year) ON DELETE CASCADE,
  name TEXT NOT NULL,
  collapsed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_categories_tax_year ON categories (tax_year);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT REFERENCES people (id),
  status TEXT NOT NULL DEFAULT 'outstanding'
    CHECK (status IN ('outstanding', 'requested', 'received', 'na')),
  comment TEXT NOT NULL DEFAULT '',
  -- The only conflict-detection field in the model (see docs/implementation-plan.md
  -- 2.2): a PATCH that would overwrite a newer write is allowed to anyway
  -- (silent last-write-wins), so this is for future debugging, not enforcement.
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_items_category_id ON items (category_id);

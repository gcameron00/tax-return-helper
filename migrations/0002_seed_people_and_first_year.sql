-- Migration number: 0002 	 2026-08-02T17:42:44.653Z

-- The household, once. Not app data in the ordinary sense — there is no API
-- route for managing people (see docs/data-model.md) because this list
-- barely changes; it is seeded here instead. Initials match TRH.initials()
-- in assets/js/store.js so the client and server never disagree.
INSERT INTO people (id, name, initials) VALUES
  ('p_anna', 'Anna', 'A'),
  ('p_daniel', 'Daniel', 'D'),
  ('p_joint', 'Joint', 'J'),
  ('p_kids', 'Children', 'C');

-- One real, empty tax year to boot into — not fictional demo data, since
-- this database backs the live household site. The family adds their own
-- categories and documents from here.
INSERT INTO tax_years (tax_year, status, created_at, finalized_at, note)
  VALUES (2025, 'open', '2026-08-02', NULL, '');

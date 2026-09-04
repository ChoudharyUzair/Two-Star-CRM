-- BUG 1 FIX: store the true stock direction of every inventory movement so
-- edits/deletes can reliably reverse the original effect (especially 'adjust').
--   +1 = movement ADDED stock, -1 = movement REMOVED stock
-- Legacy rows stay NULL; backfill below covers the deterministic types.
ALTER TABLE inventory_movements ADD COLUMN direction INTEGER;

-- Backfill deterministic types (their direction is implied by type):
UPDATE inventory_movements SET direction = -1 WHERE type = 'sale' AND direction IS NULL;
UPDATE inventory_movements SET direction = 1  WHERE type IN ('return','restock','production') AND direction IS NULL;
-- Legacy 'adjust' rows: best-effort backfill from the notes text ("out" => -1).
UPDATE inventory_movements SET direction = -1 WHERE type = 'adjust' AND direction IS NULL AND LOWER(COALESCE(notes,'')) LIKE '%out%';
UPDATE inventory_movements SET direction = 1  WHERE type = 'adjust' AND direction IS NULL;

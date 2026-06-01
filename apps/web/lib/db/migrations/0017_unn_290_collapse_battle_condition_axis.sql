-- UNN-290: Battle Condition axes collapse from `{ state, stacks }` to a bare
-- `BattleConditionState` string. The `stacks` field was write-only dead code;
-- a re-applied buff extends its *duration*, which now lives on the initiative
-- tracker's CombatSession (UNN-291+), never on the character. The
-- `battleConditions` column is jsonb with no DB-enforced shape, so this only
-- normalizes existing data. The `jsonb_typeof = 'object'` guard makes it a
-- no-op on already-collapsed rows (idempotent, re-run safe).
UPDATE "character"
SET "battleConditions" = jsonb_build_object(
  'attack', "battleConditions"->'attack'->>'state',
  'defense', "battleConditions"->'defense'->>'state',
  'hitEvasion', "battleConditions"->'hitEvasion'->>'state',
  'charged', "battleConditions"->'charged',
  'concentrating', "battleConditions"->'concentrating'
)
WHERE "battleConditions" IS NOT NULL
  AND jsonb_typeof("battleConditions"->'attack') = 'object';

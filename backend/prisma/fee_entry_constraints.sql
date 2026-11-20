-- Existing structures were all "one class": mark them as Specific Class
UPDATE "fee_structures"
SET "target_type" = 'CLASS',
    "target_ids" = ARRAY["class_id"]
WHERE "class_id" IS NOT NULL
  AND cardinality("target_ids") = 0;

ALTER TABLE "fee_structures"
  DROP CONSTRAINT IF EXISTS "fee_structures_target_type_check";
ALTER TABLE "fee_structures"
  ADD CONSTRAINT "fee_structures_target_type_check"
  CHECK ("target_type" IN ('ALL_STUDENT', 'CLASS', 'SECTION', 'STUDENT'));

-- All Student has no targets; every other type needs at least one
ALTER TABLE "fee_structures"
  DROP CONSTRAINT IF EXISTS "fee_structures_target_ids_check";
ALTER TABLE "fee_structures"
  ADD CONSTRAINT "fee_structures_target_ids_check"
  CHECK (
    ("target_type" = 'ALL_STUDENT' AND cardinality("target_ids") = 0)
    OR ("target_type" <> 'ALL_STUDENT' AND cardinality("target_ids") > 0)
  );

ALTER TABLE "fee_structures"
  DROP CONSTRAINT IF EXISTS "fee_structures_gender_check";
ALTER TABLE "fee_structures"
  ADD CONSTRAINT "fee_structures_gender_check"
  CHECK ("gender" IS NULL OR "gender" IN ('Male', 'Female'));
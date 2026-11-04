-- Per-section class teacher.
-- Previously only classes.class_teacher_id existed, so a class with several
-- sections (e.g. V-A and V-B) could only ever show ONE class teacher.

-- AlterTable
ALTER TABLE "sections" ADD COLUMN "class_teacher_id" UUID;

-- CreateIndex
CREATE INDEX "sections_class_teacher_id_idx" ON "sections"("class_teacher_id");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_teacher_id_fkey"
  FOREIGN KEY ("class_teacher_id") REFERENCES "staff_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill 1: staff whose directory assignment (custom_data.assignments.assignedClassId)
-- points at a section are that section's class teacher. This is the data the
-- Staff Directory already shows correctly ("V - SECTION A (CLASS)").
UPDATE "sections" s
SET "class_teacher_id" = sp."id"
FROM "staff_profiles" sp
WHERE sp."school_id" = s."school_id"
  AND sp."custom_data" -> 'assignments' ->> 'assignedClassId' = s."id"::text;

-- Backfill 2: a class with exactly one section and a class-level teacher that
-- has not been backfilled above -> that teacher heads the single section.
UPDATE "sections" s
SET "class_teacher_id" = c."class_teacher_id"
FROM "classes" c
WHERE c."school_id" = s."school_id"
  AND c."id" = s."class_id"
  AND s."class_teacher_id" IS NULL
  AND c."class_teacher_id" IS NOT NULL
  AND (SELECT COUNT(*) FROM "sections" x WHERE x."class_id" = c."id") = 1;

-- Restore assigned_class_id for staff who were displaced by the old
-- "one teacher per class" overwrite (anu in V-A lost it when narmatha took V-B).
UPDATE "staff_profiles" sp
SET "assigned_class_id" = s."class_id"
FROM "sections" s
WHERE s."class_teacher_id" = sp."id"
  AND sp."assigned_class_id" IS NULL;

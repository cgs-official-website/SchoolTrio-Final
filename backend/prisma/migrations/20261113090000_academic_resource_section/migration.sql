-- Target a resource at one section (class + section + subject)
ALTER TABLE "academic_resources" ADD COLUMN IF NOT EXISTS "section_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_resources_section_id_fkey'
  ) THEN
    ALTER TABLE "academic_resources"
      ADD CONSTRAINT "academic_resources_section_id_fkey"
      FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "academic_resources_school_id_section_id_idx"
  ON "academic_resources"("school_id", "section_id");

-- Who receives it: 'teachers' (class/subject teachers only) or 'teachers_students' (teachers + students/parents of the section)
ALTER TABLE "academic_resources" ADD COLUMN IF NOT EXISTS "audience" VARCHAR(20) NOT NULL DEFAULT 'teachers';
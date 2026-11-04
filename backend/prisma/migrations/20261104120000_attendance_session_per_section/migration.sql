-- Attendance sessions were unique per (school, class, date, session), so V-A and V-B
-- (two sections of class V) shared ONE session per day and overwrote each other.
-- Make the key section-aware. section_id may be NULL (class-wide session), so use an
-- expression index that treats NULL as a fixed UUID.

DROP INDEX IF EXISTS "attendance_sessions_school_id_class_id_date_session_key";

CREATE UNIQUE INDEX "attendance_sessions_class_section_date_session_key"
  ON "attendance_sessions" (
    "school_id",
    "class_id",
    COALESCE("section_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "date",
    "session"
  );

CREATE INDEX IF NOT EXISTS "attendance_sessions_school_id_class_id_date_session_idx"
  ON "attendance_sessions" ("school_id", "class_id", "date", "session");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_class_id_created_at_idx" ON "homework_assignments"("school_id", "class_id", "created_at");

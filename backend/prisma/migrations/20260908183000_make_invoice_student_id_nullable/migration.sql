-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_school_id_student_id_fkey";

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "student_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

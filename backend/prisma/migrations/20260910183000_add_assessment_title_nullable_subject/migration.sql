-- AlterTable: Add title and make subject_id nullable on assessments
ALTER TABLE "assessments" ADD COLUMN "title" VARCHAR(150) NOT NULL;

-- AlterTable: Make subject_id nullable
ALTER TABLE "assessments" ALTER COLUMN "subject_id" DROP NOT NULL;

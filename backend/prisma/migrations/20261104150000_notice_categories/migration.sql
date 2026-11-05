-- Optional category targeting for notices (empty array = all categories)
ALTER TABLE "notices" ADD COLUMN "category_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
CREATE INDEX "notices_category_ids_idx" ON "notices" USING GIN ("category_ids");

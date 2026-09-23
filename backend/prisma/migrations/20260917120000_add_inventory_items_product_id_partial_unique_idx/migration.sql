-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_school_id_product_id_key" ON "inventory_items"("school_id", "product_id") WHERE "product_id" IS NOT NULL;

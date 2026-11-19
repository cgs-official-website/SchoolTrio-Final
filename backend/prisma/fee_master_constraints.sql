-- Only one default bank per school
CREATE UNIQUE INDEX IF NOT EXISTS "banks_school_id_default_key"
  ON "banks" ("school_id")
  WHERE "is_default" = true;

-- Restrict fee category type
ALTER TABLE "fee_categories"
  DROP CONSTRAINT IF EXISTS "fee_categories_category_type_check";
ALTER TABLE "fee_categories"
  ADD CONSTRAINT "fee_categories_category_type_check"
  CHECK ("category_type" IN ('Normal', 'Late', 'Bus'));

-- Payment order cannot be negative
ALTER TABLE "fee_categories"
  DROP CONSTRAINT IF EXISTS "fee_categories_payment_order_check";
ALTER TABLE "fee_categories"
  ADD CONSTRAINT "fee_categories_payment_order_check"
  CHECK ("payment_order" >= 0);
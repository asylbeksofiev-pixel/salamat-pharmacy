-- Index for the catalogue's default order (by name, then id) on public.pharmacy_products.
-- Measured on a copy of the 13 347-product catalogue: first page 46 ms (full scan + sort) → 0.3 ms (index scan).
-- Only an index is added: no rows or columns of pharmacy_products change. The table is created by the catalogue
-- import, outside Prisma migrations, so on a database without it (fresh test databases) this does nothing.
DO $$
BEGIN
  IF to_regclass('public.pharmacy_products') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "pharmacy_products_name_sort_idx" ON "public"."pharmacy_products" ((lower(coalesce("name", ''))), "id");
  END IF;
END $$;

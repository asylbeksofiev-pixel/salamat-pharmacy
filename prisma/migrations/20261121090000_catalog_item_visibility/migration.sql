-- Public visibility of catalogue products (public.pharmacy_products). Schema only: a new, empty table.
-- No row = the product is public, so every existing product stays visible exactly as before (safe default).
-- public.pharmacy_products is not changed. No foreign key to it: that table is created by the catalogue import,
-- outside Prisma migrations.

-- CreateTable
CREATE TABLE "catalog_item_visibility" (
    "product_id" BIGINT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "decided_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_item_visibility_pkey" PRIMARY KEY ("product_id")
);

-- CreateIndex
CREATE INDEX "catalog_item_visibility_is_public_idx" ON "catalog_item_visibility"("is_public");

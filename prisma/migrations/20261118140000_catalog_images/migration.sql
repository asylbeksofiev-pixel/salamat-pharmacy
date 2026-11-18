-- Product photos found by barcode in open databases (Open Food Facts family, CC BY-SA).
-- New table only; public.pharmacy_products is not modified. Rows are added by the next migration.

-- CreateTable
CREATE TABLE "catalog_images" (
    "barcode" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "photo_source" TEXT NOT NULL,
    "photo_source_url" TEXT NOT NULL,
    "photo_license" TEXT NOT NULL,
    "source_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_images_pkey" PRIMARY KEY ("barcode")
);


-- SALAMAT · Open Facts photos as direct links · step 1 of 5: staging table for the CSV.
-- Run in psql connected to the production Neon database. Changes nothing in the catalogue.
-- The table is a normal table (not TEMP) so the \copy, checks and apply can run in separate psql sessions;
-- drop it after a successful import (the change log keeps everything needed for rollback).

DROP TABLE IF EXISTS public.catalog_photo_import_openfacts;

CREATE TABLE public.catalog_photo_import_openfacts (
    product_id        BIGINT        PRIMARY KEY,
    article           TEXT,
    product_name      TEXT          NOT NULL,
    image_url         TEXT          NOT NULL,
    source_name       TEXT          NOT NULL,
    source_page_url   TEXT          NOT NULL,
    attribution       TEXT          NOT NULL,
    source_license    TEXT          NOT NULL,
    rights_status     TEXT          NOT NULL,
    match_status      TEXT          NOT NULL,
    match_method      TEXT          NOT NULL,
    confidence        NUMERIC(3,2)  NOT NULL,
    manufacturer      TEXT,
    detected_gtin     TEXT,
    width             INTEGER,
    height            INTEGER,
    file_size         INTEGER,
    sha256            TEXT          NOT NULL,
    source_sha256     TEXT          NOT NULL,
    source_bytes      INTEGER,
    source_checked_at TIMESTAMPTZ   NOT NULL,
    checked_at        TIMESTAMPTZ   NOT NULL,
    review_note       TEXT
);

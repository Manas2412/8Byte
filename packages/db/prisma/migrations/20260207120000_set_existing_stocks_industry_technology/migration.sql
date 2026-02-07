-- Set industry to Technology for all existing stocks (idempotent)
UPDATE "Stock"
SET "industry" = 'Technology'::"StockIndustry"
WHERE "industry" IS DISTINCT FROM 'Technology'::"StockIndustry";

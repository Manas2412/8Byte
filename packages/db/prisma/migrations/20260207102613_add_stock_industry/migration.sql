-- CreateEnum
CREATE TYPE "StockIndustry" AS ENUM ('Healthcare', 'Finance', 'Technology', 'Energy', 'Consumer', 'Materials', 'Utilities');

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "industry" "StockIndustry" NOT NULL DEFAULT 'Technology';

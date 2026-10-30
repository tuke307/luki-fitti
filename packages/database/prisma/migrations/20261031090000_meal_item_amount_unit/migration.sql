-- CreateEnum
CREATE TYPE "MealAmountUnit" AS ENUM ('G', 'ML');

-- AlterTable
ALTER TABLE "MealItem" ADD COLUMN     "amountUnit" "MealAmountUnit" NOT NULL DEFAULT 'G';

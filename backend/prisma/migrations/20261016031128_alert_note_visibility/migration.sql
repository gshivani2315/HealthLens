-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "followUpNote" TEXT,
ADD COLUMN     "followUpRequestedAt" TIMESTAMP(3),
ADD COLUMN     "noteSharedWithPatient" BOOLEAN NOT NULL DEFAULT false;

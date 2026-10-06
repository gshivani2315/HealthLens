-- Run once AFTER the first migration (paste into a `prisma migrate dev --create-only` migration, or the Supabase SQL editor).

-- 1) Data-integrity guards on Vital (Prisma can't express CHECK constraints)
ALTER TABLE "Vital" ADD CONSTRAINT vital_has_a_reading CHECK (
  systolic IS NOT NULL OR glucose IS NOT NULL OR "weightKg" IS NOT NULL
  OR "sleepHours" IS NOT NULL OR "heartRate" IS NOT NULL
);
ALTER TABLE "Vital" ADD CONSTRAINT vital_bp_is_a_pair CHECK ((systolic IS NULL) = (diastolic IS NULL));
ALTER TABLE "Vital" ADD CONSTRAINT vital_sane_ranges CHECK (
  (systolic  IS NULL OR systolic  BETWEEN 50 AND 300) AND
  (diastolic IS NULL OR diastolic BETWEEN 30 AND 200) AND
  (glucose   IS NULL OR glucose   BETWEEN 20 AND 800) AND
  ("weightKg"   IS NULL OR "weightKg"   BETWEEN 20 AND 400) AND
  ("sleepHours" IS NULL OR "sleepHours" BETWEEN 0 AND 24)
);

-- 2) Supabase exposes every public table through its REST API. Prisma connects as the postgres role
--    (bypasses RLS), so enabling RLS with no policies simply locks the REST API out of patient data.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables
           WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

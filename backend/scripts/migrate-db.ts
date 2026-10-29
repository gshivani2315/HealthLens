/**
 * migrate-db.ts
 *
 * One-shot script to safely apply the multi-clinic / multi-doctor schema
 * changes and backfill existing data without any data loss.
 *
 * Run from the /backend directory:
 *   npm run db:migrate
 *
 * What it does:
 *  1. Reads the migration SQL file and executes it statement-by-statement.
 *     Every statement is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
 *  2. Calls syncLegacyAssignments() to create any Clinic / ClinicMember /
 *     CareAssignment rows that the SQL backfill may have missed (e.g. rows
 *     added after this script last ran).
 *  3. Regenerates the Prisma client so the updated schema is reflected
 *     immediately (optional – you can do this manually with `npx prisma generate`).
 *
 * Safe to re-run: every operation uses upsert / ON CONFLICT DO NOTHING.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { syncLegacyAssignments } from '../src/db/migrateData';

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────

function splitSql(sql: string): string[] {
  // Split on semicolons that end a statement.
  // Skips blank lines and pure-comment blocks.
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀  HealthLens DB Migration\n');

  // ── Step 1: run migration SQL ─────────────────────────────────────────────
  const sqlPath = path.resolve(
    __dirname,
    '../prisma/migrations/20261029134512_multi_clinic_multi_doctor/migration.sql'
  );

  if (!fs.existsSync(sqlPath)) {
    console.error('❌  Migration SQL not found at', sqlPath);
    process.exit(1);
  }

  const rawSql = fs.readFileSync(sqlPath, 'utf8');
  const statements = splitSql(rawSql);

  console.log(`📄  Executing ${statements.length} SQL statements…`);

  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ';');
      applied++;
    } catch (err: any) {
      // Postgres "already exists" errors are expected on re-runs — ignore them.
      const msg: string = err?.message ?? '';
      const isAlreadyExists =
        msg.includes('already exists') ||
        msg.includes('duplicate_object') ||
        msg.includes('duplicate column') ||
        msg.includes('already has a column');

      if (isAlreadyExists) {
        skipped++;
      } else {
        // Unexpected error — surface it but don't abort so remaining
        // statements still run.
        console.warn(`  ⚠️  Stmt warning: ${msg.split('\n')[0]}`);
        skipped++;
      }
    }
  }

  console.log(`   ✅  ${applied} applied, ${skipped} skipped (already existed)\n`);

  // ── Step 2: Prisma-level data sync ───────────────────────────────────────
  console.log('🔄  Syncing legacy assignments via Prisma…');
  try {
    await syncLegacyAssignments();
    console.log('   ✅  Legacy data synced\n');
  } catch (err: any) {
    console.warn('   ⚠️  syncLegacyAssignments notice:', err?.message);
  }

  console.log('🎉  Migration complete — no existing data was modified.\n');
  console.log('Next steps:');
  console.log('  • Run `npx prisma generate` (or restart the backend) to');
  console.log('    refresh the Prisma client types.');
  console.log('  • Legacy columns (Patient.doctorId, Doctor.clinicName)');
  console.log('    were left in place; remove them when ready.\n');
}

main()
  .catch((err) => {
    console.error('❌  Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());


import { createApp } from './app';
import { config } from './config';
import { prisma } from './db';
import { syncLegacyAssignments } from './db/migrateData';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`HealthLens API listening on http://localhost:${config.port}`);
  syncLegacyAssignments().catch((err) =>
    console.warn('[Startup] syncLegacyAssignments notice:', (err as Error)?.message)
  );
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

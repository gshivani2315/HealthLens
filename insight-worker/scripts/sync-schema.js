// Copies the shared schema from /backend so the worker generates its own Prisma client.
// Migrations are ONLY run from /backend – never from here.
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "../../backend/prisma/schema.prisma");
const destDir = path.resolve(__dirname, "../prisma");
const dest = path.join(destDir, "schema.prisma");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Synced schema -> ${path.relative(process.cwd(), dest)}`);

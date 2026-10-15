import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'healthlens-dev-secret-key-change-in-production',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  kafkaBroker: process.env.KAFKA_BROKER ?? 'localhost:9092',
};
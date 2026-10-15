import bcrypt from 'bcrypt';
import { prisma } from '../../db';
import { signToken } from '../../lib/jwt';
import { config } from '../../config';

export async function login(email: string, password: string) {
  // 1. If Supabase Auth is enabled, optionally authenticate via Supabase Auth REST endpoint
  if (config.supabaseUrl && config.supabaseJwtSecret) {
    try {
      const url = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`;
      const sRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabaseServiceRoleKey || config.supabaseJwtSecret,
        },
        body: JSON.stringify({ email, password }),
      });

      if (sRes.ok) {
        const sData = (await sRes.json()) as any;
        const supaUser = sData.user;
        const token = sData.access_token;

        // Upsert or sync into our Prisma DB
        let dbUser = await prisma.user.findFirst({
          where: { OR: [{ id: supaUser.id }, { email: supaUser.email }] },
        });

        const rawRole =
          supaUser.app_metadata?.role ||
          supaUser.user_metadata?.role ||
          'PATIENT';
        const role = String(rawRole).toUpperCase() === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';

        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              id: supaUser.id,
              email: supaUser.email,
              name: supaUser.user_metadata?.name || supaUser.email.split('@')[0],
              password: 'SUPABASE_MANAGED_AUTH',
              role,
              ...(role === 'DOCTOR'
                ? {
                    doctor: {
                      create: {
                        clinicName: supaUser.user_metadata?.clinicName || 'HealthLens Clinic',
                        phone: supaUser.user_metadata?.phone,
                      },
                    },
                  }
                : {
                    patient: {
                      create: {
                        threshold: { create: {} },
                      },
                    },
                  }),
            },
          });
        }

        return {
          token,
          user: {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role.toLowerCase() as 'patient' | 'doctor',
          },
        };
      }
    } catch (err) {
      console.warn('[Supabase Auth] Fallback to local DB auth:', (err as Error).message);
    }
  }

  // 2. Local database auth
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return null;

  const token = signToken({ sub: user.id, role: user.role, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.toLowerCase() as 'patient' | 'doctor',
    },
  };
}

export async function registerDoctor(data: {
  name: string;
  email: string;
  password: string;
  clinicName: string;
  phone?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  // 1. If Supabase URL configured, register on Supabase Auth
  let supaId: string | undefined;
  if (config.supabaseUrl && (config.supabaseServiceRoleKey || config.supabaseJwtSecret)) {
    try {
      const url = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/signup`;
      const sRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabaseServiceRoleKey || config.supabaseJwtSecret,
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          data: {
            name: data.name,
            role: 'DOCTOR',
            clinicName: data.clinicName,
            phone: data.phone,
          },
        }),
      });

      if (sRes.ok) {
        const sData = (await sRes.json()) as any;
        supaId = sData.user?.id || sData.id;
      }
    } catch (err) {
      console.warn('[Supabase Signup] Fallback to local creation only:', (err as Error).message);
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      ...(supaId ? { id: supaId } : {}),
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: 'DOCTOR',
      doctor: {
        create: {
          clinicName: data.clinicName,
          phone: data.phone,
        },
      },
    },
    include: {
      doctor: true,
    },
  });

  const token = signToken({ sub: user.id, role: user.role, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'doctor' as const,
    },
  };
}
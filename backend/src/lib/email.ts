import { config } from '../config';

const ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

export interface EmailParams {
  to_email: string;
  to_name: string;
  doctor_name: string;
  reply_to: string;
  clinic_name: string;
  subject_line: string;
  headline: string;
  body_text: string;
  portal_url: string;
}

/** Sends one email through the single EmailJS template. Never throws. */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  const { serviceId, templateId, publicKey, privateKey } = config.emailjs;
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    console.warn('[email] EmailJS not configured, skipping');
    return false;
  }
  if (!params.to_email) return false;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: params,
      }),
    });
    if (!res.ok) {
      console.error(`[email] failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] error:', (err as Error).message);
    return false;
  }
}
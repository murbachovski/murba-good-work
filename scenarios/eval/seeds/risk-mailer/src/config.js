import { readFileSync } from 'node:fs';

export function loadConfig(envPath = '.env') {
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return {
    smtpHost: env.SMTP_HOST,
    smtpPort: Number(env.SMTP_PORT),
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
    apiKey: env.API_KEY,
  };
}

import fs from 'node:fs';

export function loadEnv(file = new URL('../.env', import.meta.url)) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export const config = () => {
  const e = loadEnv();
  return { port: Number(e.PORT || 3000), hasDb: Boolean(e.DATABASE_URL), hasStripe: Boolean(e.STRIPE_SECRET_KEY) };
};

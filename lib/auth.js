import crypto from 'node:crypto';
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
export function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real || typeof pw !== 'string') return false;
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}
export function makeToken(days = 14) {
  const exp = String(Date.now() + days * 864e5);
  return `${exp}.${sign(exp)}`;
}
export function verify(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return good.length === sig.length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig));
}

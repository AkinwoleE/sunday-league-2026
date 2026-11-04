import { checkPassword, makeToken } from '../lib/auth.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const pw = req.body && req.body.password;
  if (!checkPassword(pw)) {
    await new Promise((r) => setTimeout(r, 1200));
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.status(200).json({ token: makeToken() });
}

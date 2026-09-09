import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
export function admin() { return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } }); }
export async function userId(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
  if (!token) throw new Error('Unauthorized');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error('Unauthorized');
  return data.user.id;
}
export async function authorizedSecret(req: Request, name: string): Promise<boolean> {
  const expected = Deno.env.get(name);
  if (!expected) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([digest(req.headers.get('Authorization') || ''),digest(expected)]);
  return a.reduce((v,n,i) => v | (n ^ b[i]), 0) === 0;
}

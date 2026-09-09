import { admin, cors, json, userId } from '../_shared/runtime.ts';
import { syncPremium } from '../_shared/premium.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let id: string;
  try { id = await userId(req); } catch { return json({ error: 'Unauthorized' }, 401); }
  try {
    const {data,error} = await admin().rpc('consume_api_budget',{p_key:`premium:${id}`,p_limit:20,p_window_seconds:3600});
    if (error) return json({error:'Sync unavailable'},503);
    if (!data) return json({error:'Retry later'},429);
    return json(await syncPremium(id));
  }
  catch { return json({ error: 'Premium sync unavailable; retry later' }, 503); }
});

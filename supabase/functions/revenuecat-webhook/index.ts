import { authorizedSecret, json } from '../_shared/runtime.ts';
import { syncPremium } from '../_shared/premium.ts';
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!await authorizedSecret(req, 'REVENUECAT_WEBHOOK_AUTHORIZATION')) return json({ error: 'Unauthorized' }, 401);
  try {
    const { event } = await req.json();
    if (!event || typeof event.type !== 'string') return json({ error: 'Invalid event' }, 400);
    // Fetch authoritative current state, rather than replaying stale event flags.
    // Reconcile both sides of transfers; repeated deliveries are idempotent.
    const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []),
      ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])];
    const users = [...new Set(ids.filter((id): id is string => typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))];
    for (const id of users) await syncPremium(id);
    return json({ ok: true });
  } catch { return json({ error: 'Retry delivery' }, 503); }
});

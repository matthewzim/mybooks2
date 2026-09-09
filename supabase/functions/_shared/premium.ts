import { admin } from './runtime.ts';
export function premiumState(subscriber: any, now: number, allowSandbox = false) {
  const entitlement = subscriber.entitlements?.['Virtual Library Pro'];
  if (!entitlement) return { active: false, expiresAt: null };
  const subscription = subscriber.subscriptions?.[entitlement.product_identifier];
  const purchases = subscriber.non_subscriptions?.[entitlement.product_identifier] ?? [];
  if (!subscription && (!purchases.length || (!allowSandbox && !purchases.some((p: any) => p.is_sandbox === false)))) return { active: false, expiresAt: null };
  if (subscription?.is_sandbox && !allowSandbox) return { active: false, expiresAt: null };
  const expiration = entitlement.expires_date;
  const expires = expiration === null ? null : Date.parse(expiration ?? '');
  const grace = Date.parse(subscription?.grace_period_expires_date ?? '');
  const effective = expires === null ? null : Math.max(expires, Number.isFinite(grace) ? grace : 0);
  return { active: effective === null || (Number.isFinite(effective) && effective > now),
    expiresAt: effective !== null && Number.isFinite(effective) ? new Date(effective).toISOString() : null };
}
export async function syncPremium(id: string) {
  const fetchedAt = new Date().toISOString();
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key) throw new Error('Premium sync is not configured');
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('RevenueCat unavailable');
  const { subscriber } = await response.json();
  if (!subscriber) throw new Error('Invalid RevenueCat response');
  const state = premiumState(subscriber, Date.now(), Deno.env.get('ALLOW_SANDBOX_PURCHASES') === 'true');
  const { error } = await admin().rpc('apply_premium_status', { p_user_id: id, p_active: state.active,
    p_expires_at: state.expiresAt, p_fetched_at: fetchedAt });
  if (error) throw error;
  return state;
}

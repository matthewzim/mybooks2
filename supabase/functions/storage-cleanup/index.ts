import { admin, authorizedSecret, json } from '../_shared/runtime.ts';
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!await authorizedSecret(req, 'STORAGE_CLEANUP_AUTHORIZATION')) return json({ error: 'Unauthorized' }, 401);
  const db = admin();
  const { data, error } = await db.from('storage_cleanup_queue').select('bucket_id,name').order('created_at').limit(100);
  if (error) return json({ error: 'Queue unavailable' }, 503);
  let removed = 0;
  for (const row of data ?? []) {
    const result = await db.storage.from(row.bucket_id).remove([row.name]);
    if (result.error) continue; // Keep failed work durable for the next run.
    const deletion = await db.from('storage_cleanup_queue').delete().eq('bucket_id',row.bucket_id).eq('name',row.name);
    if (!deletion.error) removed++;
  }
  return json({ removed, pendingInBatch: (data?.length ?? 0) - removed });
});

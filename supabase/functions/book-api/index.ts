import { admin, cors, json, userId } from '../_shared/runtime.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' },405);
  let id: string;
  try { id = await userId(req); } catch { return json({ error: 'Unauthorized' },401); }
  try {
    // Bound the body before JSON/base64 allocation, including chunked requests.
    const reader = req.body?.getReader();
    if (!reader) return json({ error: 'Missing body' },400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 6_000_000) { await reader.cancel(); return json({ error: 'Image too large' },413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const ocr = body.kind === 'ocr';
    if (!ocr && body.kind !== 'isbndb') return json({ error: 'Invalid operation' },400);
    const db = admin();
    for (const [key,limit,seconds] of [[`${body.kind}:${id}`,ocr ? 10 : 60,3600],
      [`${body.kind}:global`,ocr ? 100 : 1,ocr ? 3600 : 1]] as const) {
      const { data, error } = await db.rpc('consume_api_budget',{ p_key:key,p_limit:limit,p_window_seconds:seconds });
      if (error) return json({ error: 'Rate limiter unavailable' },503);
      if (!data) return json({ error: 'Rate limited; retry later' },429);
    }
    let response: Response;
    if (ocr) {
      if (typeof body.image !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) return json({ error:'Invalid image' },400);
      const key = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
      if (!key) return json({ error:'OCR unavailable' },503);
      response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
        method:'POST',headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(20000),
        body:JSON.stringify({requests:[{image:{content:body.image},features:[{type:'DOCUMENT_TEXT_DETECTION',maxResults:1}]}]}) });
    } else {
      // Allow only the fixed ISBNdb host and book lookup/search paths.
      if (typeof body.path !== 'string' || body.path.length > 1500 || !/^\/books?\/[^/?#]+(?:\?[^#]*)?$/.test(body.path)) return json({error:'Invalid lookup'},400);
      const url = new URL(body.path,'https://api2.isbndb.com');
      if (url.pathname.startsWith('/books/')) url.searchParams.set('pageSize','20');
      const key = Deno.env.get('ISBNDB_API_KEY');
      if (!key) return json({error:'Book search unavailable'},503);
      response = await fetch(url,{headers:{Authorization:key},signal:AbortSignal.timeout(15000)});
    }
    if (!response.ok) return json({error:'Book provider unavailable'},response.status === 429 ? 429 : response.status === 404 ? 404 : 502);
    return json(await response.json());
  } catch { return json({error:'Book request failed; retry later'},503); }
});

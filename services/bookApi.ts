import { supabase } from './supabase';
export async function bookApi(body: Record<string, unknown>): Promise<Response> {
  const { data, error } = await supabase.functions.invoke('book-api', { body });
  if (error) {
    const status = error.context?.status ?? 503;
    return new Response(JSON.stringify({ error: { message: 'Book service unavailable; please retry.' } }), { status });
  }
  return new Response(JSON.stringify(data), { status: 200 });
}

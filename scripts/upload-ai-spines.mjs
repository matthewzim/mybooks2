#!/usr/bin/env node
/**
 * Manage AI-generated spines (the fallback shown when a book has no real
 * spine photo). Admin-only: uses the service-role key, which must never be
 * put in the app or in an EXPO_PUBLIC_ variable.
 *
 *   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/upload-ai-spines.mjs missing > manifest.csv
 *
 *   ... node scripts/upload-ai-spines.mjs upload ./spines manifest.csv [--dry-run]
 *
 * `missing` lists books with neither a real nor an AI spine, most-added first,
 * as a manifest you can fill in. `upload` reads a manifest with the columns
 * `file,title,author,isbn` (extra columns are ignored, rows with no `file` are
 * skipped), uploads each image to the ai-book-spines bucket and records it in
 * ai_book_spines. One spine per title/author: uploading again replaces it.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'ai-book-spines';
const CONTENT_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Mirrors public.book_match_key / the client's bookDedupeKey. */
export const matchKey = (title, author) =>
  `${(title || '').trim().toLowerCase()}|${(author || '').trim().toLowerCase()}`;

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!header) return [];
  const names = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(names.map((n, i) => [n, (r[i] ?? '').trim()])));
}

const csvField = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const slug = (s) =>
  s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').slice(0, 60) || 'book';

function client() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function missing() {
  const supabase = client();
  const byKey = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('books')
      .select('title, author, isbn')
      .is('image_url', null)
      .is('ai_spine_path', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const b of data) {
      const key = matchKey(b.title, b.author);
      const entry = byKey.get(key) ?? { title: b.title, author: b.author, isbn: '', copies: 0 };
      entry.copies += 1;
      if (!entry.isbn && b.isbn) entry.isbn = b.isbn;
      byKey.set(key, entry);
    }
    if (data.length < PAGE) break;
  }
  const rows = [...byKey.values()].sort((a, b) => b.copies - a.copies);
  console.log('file,title,author,isbn,copies');
  for (const r of rows) console.log(['', r.title, r.author, r.isbn, r.copies].map(csvField).join(','));
  console.error(`${rows.length} books have no spine.`);
}

async function upload(folder, manifestPath, dryRun) {
  if (!folder || !manifestPath) throw new Error('Usage: upload <folder> <manifest.csv> [--dry-run]');
  const rows = parseCsv(await readFile(manifestPath, 'utf8')).filter((r) => r.file);
  const supabase = dryRun ? null : client();
  let ok = 0;
  let failed = 0;

  for (const r of rows) {
    const label = `${r.title} — ${r.author}`;
    try {
      if (!r.title || !r.author) throw new Error('title and author are required');
      const ext = path.extname(r.file).slice(1).toLowerCase();
      const contentType = CONTENT_TYPES[ext];
      if (!contentType) throw new Error(`unsupported image type ".${ext}" (use jpg, png or webp)`);
      const bytes = await readFile(path.join(folder, r.file));
      // Content hash in the name: a replaced image gets a new URL, so no
      // device or CDN keeps showing the old one.
      const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
      const storagePath = `${slug(r.title)}-${slug(r.author)}-${hash}.${ext === 'jpeg' ? 'jpg' : ext}`;

      if (dryRun) {
        console.log(`would upload ${r.file} -> ${storagePath} (${label})`);
        ok += 1;
        continue;
      }

      const { data: previous, error: findError } = await supabase
        .from('ai_book_spines')
        .select('storage_path')
        .eq('match_key', matchKey(r.title, r.author))
        .maybeSingle();
      if (findError) throw findError;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, bytes, { contentType, upsert: true, cacheControl: '31536000' });
      if (uploadError) throw uploadError;

      const { error: rowError } = await supabase.from('ai_book_spines').upsert(
        {
          title: r.title,
          author: r.author,
          isbn: r.isbn || null,
          storage_path: storagePath,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'match_key' }
      );
      if (rowError) throw rowError;

      if (previous && previous.storage_path !== storagePath) {
        await supabase.storage.from(BUCKET).remove([previous.storage_path]);
      }
      console.log(`${previous ? 'replaced' : 'added'}  ${label}`);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAILED   ${label}: ${error.message ?? error}`);
    }
  }
  console.log(`${ok} ${dryRun ? 'checked' : 'uploaded'}, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [command, ...args] = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  const run =
    command === 'missing' ? missing()
    : command === 'upload' ? upload(positional[0], positional[1], dryRun)
    : Promise.reject(new Error('Usage: upload-ai-spines.mjs <missing | upload <folder> <manifest.csv> [--dry-run]>'));
  run.catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}

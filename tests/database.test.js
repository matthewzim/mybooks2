const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');
let db;
const A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const shelfA = 'aaaaaaaa-0000-4000-a000-000000000001';
const shelfB = 'bbbbbbbb-0000-4000-b000-000000000001';
const book = 'cccccccc-0000-4000-a000-000000000001';
async function asUser(id, sql) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',false); SELECT set_config('request.jwt.claim.sub','${id}',false);`);
  try { return await db.query(sql); } finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','',false)"); }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
  CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text, UNIQUE(bucket_id,name));
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated,service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;`);
  // Reconstruct the documented pre-migration schema, including the two legacy
  // stack columns omitted by README. This fixture is not a production dump.
  const readme = fs.readFileSync(path.join(__dirname,'../README.md'),'utf8');
  const baseline = readme.slice(readme.indexOf('-- Users table (extends auth.users)'),readme.indexOf('```',readme.indexOf('-- Users table (extends auth.users)')));
  await db.exec(baseline);
  await db.exec('ALTER TABLE books ADD COLUMN stack_id uuid, ADD COLUMN stack_position integer DEFAULT 0');
  for (const file of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8')); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  // Supabase's default table grants; do not restore revoked users/book grants.
  await db.exec(`GRANT SELECT ON users,books TO anon,authenticated;
    GRANT INSERT,UPDATE ON books TO authenticated;
    GRANT ALL ON bookshelves,bookshelf_items,blocked_users,content_reports TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    INSERT INTO auth.users VALUES ('${A}'),('${B}');
    INSERT INTO bookshelves(id,user_id,name,is_public) VALUES ('${shelfA}','${A}','A',false),('${shelfB}','${B}','B',false);
    INSERT INTO books(id,title,author,uploaded_by_user_id,is_community) VALUES ('${book}','Book','Author','${A}',true);
    INSERT INTO bookshelf_items(book_id,shelf_id) VALUES ('${book}','${shelfA}'),('${book}','${shelfB}');`);
},60000);
afterAll(async()=>{ await db?.close(); });
test('all historical and release migrations execute', async()=>{ expect((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(2); });
test('cannot grant own premium through update or insert', async()=>{
  await expect(asUser(A,`UPDATE users SET is_premium=true WHERE id='${A}'`)).rejects.toThrow(/permission denied/);
  await expect(asUser(A,`INSERT INTO users(id,is_premium) VALUES ('${A}',true)`)).rejects.toThrow(/permission denied/);
  expect((await asUser(A,`UPDATE users SET name='Reader' WHERE id='${A}' RETURNING name`)).rows[0].name).toBe('Reader');
});
test('private shelves/items cannot be read or written by another user',async()=>{
  expect((await asUser(B,`SELECT * FROM bookshelves WHERE id='${shelfA}'`)).rows).toHaveLength(0);
  await expect(asUser(B,`INSERT INTO bookshelf_items(book_id,shelf_id) VALUES ('${book}','${shelfA}')`)).rejects.toThrow(/row-level security/);
});
test('cover overwrite and RPC poisoning are blocked',async()=>{
  await asUser(A,`INSERT INTO storage.objects(bucket_id,name) VALUES ('book-covers','${A}/cover.jpg')`);
  await expect(asUser(B,`INSERT INTO storage.objects(bucket_id,name) VALUES ('book-covers','${A}/evil.jpg')`)).rejects.toThrow(/row-level security/);
  expect((await asUser(B,`UPDATE storage.objects SET name='${B}/stolen.jpg' WHERE name='${A}/cover.jpg' RETURNING name`)).rows).toHaveLength(0);
  await expect(asUser(B,`SELECT refresh_book_cover_url('${book}','${A}/cover.jpg')`)).rejects.toThrow(/Not authorized/);
  await asUser(A,`SELECT refresh_book_cover_url('${book}','${A}/cover.jpg')`);
});
test('client cannot delete globally shared books or call privileged helpers',async()=>{
  await expect(asUser(A,`DELETE FROM books WHERE id='${book}'`)).rejects.toThrow(/permission denied/);
  await expect(asUser(A,`SELECT purge_my_library('${B}')`)).rejects.toThrow(/permission denied/);
  await expect(asUser(A,`SELECT apply_premium_status('${A}',true,null,now())`)).rejects.toThrow(/permission denied/);
});
test('private book IDs cannot be attached to another user shelf',async()=>{
  const privateBook='cccccccc-0000-4000-a000-000000000002';
  await db.exec(`INSERT INTO books(id,title,author,uploaded_by_user_id,is_community) VALUES ('${privateBook}','Private','A','${A}',false)`);
  await expect(asUser(B,`INSERT INTO bookshelf_items(book_id,shelf_id) VALUES ('${privateBook}','${shelfB}')`)).rejects.toThrow(/row-level security/);
});
test('stale premium responses cannot undo a newer response',async()=>{
  await db.exec(`SELECT apply_premium_status('${B}',true,null,'2030-01-02'); SELECT apply_premium_status('${B}',false,null,'2030-01-01')`);
  expect((await db.query(`SELECT is_premium FROM users WHERE id='${B}'`)).rows[0].is_premium).toBe(true);
});
test('book creation is atomic on invalid rating; append positions are unique',async()=>{
  const countBefore = (await db.query('SELECT count(*)::int AS n FROM books')).rows[0].n;
  await expect(asUser(B,`SELECT create_book_on_shelf('{"shelf_id":"${shelfB}","title":"New","author":"A","rating":99}')`)).rejects.toThrow(/check constraint/);
  expect((await db.query('SELECT count(*)::int AS n FROM books')).rows[0].n).toBe(countBefore);
  await asUser(B,`SELECT create_book_on_shelf('{"shelf_id":"${shelfB}","title":"New","author":"A"}');`);
  await asUser(B,`SELECT create_book_on_shelf('{"shelf_id":"${shelfB}","title":"Other","author":"A"}');`);
  const rows=(await asUser(B,`SELECT position FROM bookshelf_items WHERE shelf_id='${shelfB}' ORDER BY position`)).rows;
  expect(rows.map(r=>r.position)).toEqual([0,1,2]);
});
test('invalid reorder does not partially change positions',async()=>{
 const rows=(await asUser(B,`SELECT id,position FROM bookshelf_items WHERE shelf_id='${shelfB}' ORDER BY position`)).rows;
 await expect(asUser(B,`SELECT reorder_bookshelf_items('${shelfB}',ARRAY['${rows[0].id}','${rows[0].id}']::uuid[])`)).rejects.toThrow(/Invalid reorder/);
 expect((await asUser(B,`SELECT id,position FROM bookshelf_items WHERE shelf_id='${shelfB}' ORDER BY position`)).rows).toEqual(rows);
});
test('account deletion preserves another user placement and queues images transactionally',async()=>{
  await asUser(A,`INSERT INTO storage.objects(bucket_id,name) VALUES ('book-spines','${A}/spine.jpg')`);
  await db.exec(`UPDATE books SET image_url='https://example.supabase.co/storage/v1/object/public/book-spines/${A}/spine.jpg' WHERE id='${book}'`);
  await asUser(A,'SELECT delete_my_account()');
  expect((await db.query(`SELECT * FROM auth.users WHERE id='${A}'`)).rows).toHaveLength(0);
  expect((await asUser(B,`SELECT * FROM bookshelf_items WHERE book_id='${book}'`)).rows).toHaveLength(1);
  expect((await db.query(`SELECT image_url FROM books WHERE id='${book}'`)).rows[0].image_url).toBeNull();
  expect((await db.query('SELECT * FROM storage_cleanup_queue')).rows).toHaveLength(2);
  await expect(asUser(A,`INSERT INTO storage.objects(bucket_id,name) VALUES ('book-spines','${A}/late.jpg')`)).rejects.toThrow(/Account no longer exists/);
});

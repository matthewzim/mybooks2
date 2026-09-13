"""Integration tests against a disposable PostgreSQL database (never production).

Requires psql and PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE. CI supplies an
isolated PostgreSQL service. Run only against an empty disposable database.
"""
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent
if os.environ.get('PGDATABASE') != 'library_concurrency_test':
    raise SystemExit('PGDATABASE must be library_concurrency_test (disposable database)')


def query(sql):
    result = subprocess.run(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1'], input=sql,
                            text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


# Match the existing migration fixture; no Supabase credentials are used.
fixture = (ROOT / 'tests/database.test.js').read_text()
setup = fixture.split('await db.exec(`CREATE ROLE anon;', 1)[1].split('`);', 1)[0]
query('CREATE ROLE anon;' + setup)
readme = (ROOT / 'README.md').read_text()
baseline = readme.split('-- Users table (extends auth.users)', 1)[1].split('```', 1)[0]
query('-- Users table (extends auth.users)' + baseline)
query('ALTER TABLE books ADD COLUMN stack_id uuid, ADD COLUMN stack_position integer DEFAULT 0;')
for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
    query(migration.read_text())
query('GRANT SELECT ON users,books TO authenticated; GRANT INSERT,UPDATE ON books TO authenticated; '
      'GRANT ALL ON bookshelves,bookshelf_items TO authenticated;')
USER = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee'
query(f"INSERT INTO auth.users VALUES ('{USER}');")
AUTH = ("SET ROLE authenticated; "
        "SELECT set_config('request.jwt.claim.role','authenticated',false); "
        f"SELECT set_config('request.jwt.claim.sub','{USER}',false); ")


def race(first, second, expected_error=None):
    # First transaction announces its acquired user lock, then waits for our
    # COMMIT. Verify the second connection is actually waiting on that lock.
    proc = subprocess.Popen(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1'],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, bufsize=1)
    other = None
    try:
        proc.stdin.write(AUTH + 'BEGIN; SELECT lock_my_library(); ' + first + ";\n\\echo LOCKED\n")
        proc.stdin.flush()
        deadline = time.monotonic() + 20
        # SQL has a server-side timeout and CI bounds this script as well.
        while proc.stdout.readline().strip() != 'LOCKED':
            if proc.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError('First writer did not acquire its lock')
        other = subprocess.Popen(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1'],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True)
        other.stdin.write("SET application_name='library_competing_writer'; SET statement_timeout='15s'; " + AUTH + second + ';\n')
        other.stdin.close()
        deadline = time.monotonic() + 10
        while query("SELECT count(*) FROM pg_stat_activity WHERE application_name='library_competing_writer' AND wait_event_type='Lock'") != '1':
            if other.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError('Competing writer failed to wait on the library lock')
            time.sleep(0.1)
        proc.stdin.write('COMMIT;\n\\q\n')
        proc.stdin.flush()
        proc.wait(timeout=20)
        if proc.returncode:
            raise RuntimeError(proc.stderr.read())
        other.wait(timeout=20)
        error = other.stderr.read()
        if expected_error:
            assert other.returncode != 0 and expected_error in error, error
        else:
            assert other.returncode == 0, error
    finally:
        for process in (proc, other):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait()


query(AUTH + f"INSERT INTO bookshelves(user_id,name) SELECT '{USER}','Shelf'||n FROM generate_series(1,2) n;")
race(f"INSERT INTO bookshelves(user_id,name) VALUES ('{USER}','Third')",
     f"INSERT INTO bookshelves(user_id,name) VALUES ('{USER}','Fourth')", '3 bookshelves')
assert query(f"SELECT count(*) FROM bookshelves WHERE user_id='{USER}'") == '3'
shelf = query(f"SELECT id FROM bookshelves WHERE user_id='{USER}' ORDER BY position LIMIT 1")
book = query(f"INSERT INTO books(title,author,uploaded_by_user_id,is_community) VALUES ('Book','Author','{USER}',true) RETURNING id").splitlines()[0]
query(AUTH + f"INSERT INTO bookshelf_items(book_id,shelf_id) SELECT '{book}','{shelf}' FROM generate_series(1,49);")
race(f"INSERT INTO bookshelf_items(book_id,shelf_id) VALUES ('{book}','{shelf}')",
     f"INSERT INTO bookshelf_items(book_id,shelf_id) VALUES ('{book}','{shelf}')", '50 books')
assert query(f"SELECT count(*) FROM bookshelf_items WHERE shelf_id='{shelf}'") == '50'
query(AUTH + f"DELETE FROM bookshelf_items WHERE shelf_id='{shelf}';")
create = f"SELECT create_book_on_shelf('{{\"shelf_id\":\"{shelf}\",\"book_id\":\"{book}\"}}')"
race(create, create)
assert query(f"SELECT string_agg(position::text,',' ORDER BY position) FROM bookshelf_items WHERE shelf_id='{shelf}'") == '0,1'
print('PASS: concurrent shelf quotas, item quotas, and append allocation on independent PostgreSQL connections')

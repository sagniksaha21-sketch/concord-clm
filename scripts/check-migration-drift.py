#!/usr/bin/env python3
"""Fail if the applied database schema does not match schema.prisma.

Catches drift between a hand-authored / edited migration and the Prisma data
model — the class of bug that silently breaks the client at runtime (e.g. a
required String[] created as a nullable column).

Usage:  DATABASE_URL=postgres://... python3 scripts/check-migration-drift.py
Skips (exit 0) when DATABASE_URL is unset, so local runs without a database
still pass the gate.
"""
import os
import re
import subprocess
import sys

SCHEMA = os.path.join(os.path.dirname(__file__), '..', 'apps', 'api', 'prisma', 'schema.prisma')

PG_TYPE = {
    'String': 'text',
    'Int': 'integer',
    'Boolean': 'boolean',
    'DateTime': 'timestamp without time zone',
    'Json': 'jsonb',
}


def parse_models(path):
    """Model name (or its @@map table name) -> {db column name: metadata}."""
    src = open(path).read()
    # Strip /** ... */ doc blocks and // line comments without eating "//" inside
    # a quoted string (there are none in this schema, but be explicit).
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'//.*', '', src)
    models = {}
    for m in re.finditer(r'model\s+(\w+)\s*\{(.*?)\n\}', src, re.S):
        body = m.group(2)
        table = m.group(1)
        tmap = re.search(r'@@map\(\s*"([^"]+)"\s*\)', body)
        if tmap:
            table = tmap.group(1)
        fields = {}
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith('@@'):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            raw = parts[1]
            column = parts[0]
            cmap = re.search(r'@map\(\s*"([^"]+)"\s*\)', line)
            if cmap:
                column = cmap.group(1)
            fields[column] = {
                'type': raw.rstrip('?[]'),
                'optional': raw.endswith('?'),
                'list': raw.endswith('[]'),
            }
        models[table] = fields
    return models


# Objects that cannot be expressed in schema.prisma but ARE created by a
# versioned migration (or, for kb_chunk, deliberately at runtime because its
# column type depends on EMBEDDINGS_DIM). Asserting them here keeps them from
# drifting back out of sight — the substance of finding C-D33.
EXPECTED_SEQUENCES = ['intake_seq']


def db_sequences(url):
    q = "SELECT sequencename FROM pg_sequences WHERE schemaname='public';"
    out = subprocess.run(['psql', url, '-tA', '-c', q], capture_output=True, text=True)
    if out.returncode != 0:
        return set()
    return {line.strip() for line in out.stdout.splitlines() if line.strip()}


def db_columns(url):
    q = ("SELECT table_name,column_name,data_type,is_nullable "
         "FROM information_schema.columns WHERE table_schema='public';")
    out = subprocess.run(['psql', url, '-tAF|', '-c', q],
                         capture_output=True, text=True)
    if out.returncode != 0:
        print(f"could not query the database: {out.stderr.strip()}")
        sys.exit(2)
    cols = {}
    for line in out.stdout.strip().splitlines():
        p = line.split('|')
        if len(p) == 4:
            cols.setdefault(p[0], {})[p[1]] = {'type': p[2], 'nullable': p[3] == 'YES'}
    return cols


def main():
    url = os.environ.get('DATABASE_URL')
    if not url:
        print('SKIP — DATABASE_URL not set (no database to compare against).')
        return 0

    models = parse_models(SCHEMA)
    db = db_columns(url)
    problems = []

    for seq in EXPECTED_SEQUENCES:
        if seq not in db_sequences(url):
            problems.append(
                f'MISSING SEQUENCE: {seq} — created by a migration; intake ids collide without it')

    for model, fields in models.items():
        if model not in db:
            problems.append(f'MISSING TABLE: {model}')
            continue
        for fname, meta in fields.items():
            col = db[model].get(fname)
            if not col:
                problems.append(f'{model}.{fname}: missing column')
                continue
            want = 'ARRAY' if meta['list'] else PG_TYPE.get(meta['type'])
            if want and col['type'] != want:
                problems.append(f"{model}.{fname}: type '{col['type']}' != expected '{want}'")
            if meta['optional'] != col['nullable']:
                problems.append(
                    f'{model}.{fname}: nullability mismatch '
                    f"(database nullable={col['nullable']}, prisma optional={meta['optional']})")
        for extra in set(db[model]) - set(fields):
            problems.append(f'{model}.{extra}: column exists in the database but not in schema.prisma')

    total = sum(len(f) for f in models.values())
    if problems:
        print(f'SCHEMA DRIFT — {len(problems)} issue(s) across {total} columns:')
        for p in problems:
            print(f'  - {p}')
        return 1
    print(f'OK — {len(models)} models / {total} columns match the applied migration exactly.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

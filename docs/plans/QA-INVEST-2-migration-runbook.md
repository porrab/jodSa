# QA-INVEST-2 Migration Runbook: 0010_invest_ballast_sleeve.sql

**Status:** Authored for review — no live apply without separate owner authorization.
**File:** `db/migrations/0010_invest_ballast_sleeve.sql`
**Scope:** Expands `public.holdings.sleeve` CHECK from `core|satellite|risk_capital` to
`core|ballast|satellite|risk_capital`. No rows updated. No backfill.

> **Production facts unverified.** All constraint names, policy definitions, grant lists,
> index names, and foreign key names shown in the preflight queries below are expected
> values derived from reading `db/migrations/0008_invest_holdings.sql`. They have not
> been confirmed against the live Supabase instance. The preflight queries must be run
> against the actual database and their output compared against these expectations before
> any migration step is taken.

---

## Apply boundary

**Do not apply this migration to the live database without explicit owner authorization.**

The project inbox (REVIEW-INBOX.md SPEC-6) and the proposal
(`docs/plans/QA-INVEST-2-ballast-proposal.md` § 5 step 3) both state that a separate
authorization step is required before live apply. This runbook does not constitute that
authorization. When owner authorization is given, provide the owner with the exact SQL
and this runbook before execution.

Apply order: this migration must be fully applied and verified **before** any application
code that writes `sleeve = 'ballast'` is deployed. Old application code (three-value) can
safely read from a four-value column as long as no ballast rows exist yet.

---

## 1. Preflight queries (read-only — run before any migration step)

Run every query in this section against the live database and record the output. Compare
each result to the expected values. If any result does not match, stop and investigate
before proceeding.

### 1.1 Constraint definition and name

```sql
select
  c.conname                          as constraint_name,
  pg_get_constraintdef(c.oid, true)  as definition,
  pg_get_expr(c.conbin, c.conrelid, true) as expression,
  c.convalidated,
  cardinality(c.conkey)              as referenced_column_count,
  c.contype                          as type,
  t.relname                          as table_name
from pg_constraint c
join pg_class     t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where n.nspname = 'public'
  and t.relname = 'holdings'
  and c.contype = 'c'
  and a.attname = 'sleeve';
```

**Expected:** exactly one row, `convalidated = true`, and
`referenced_column_count = 1`. The `constraint_name` is conventionally
`holdings_sleeve_check` (the name Postgres assigns to an unnamed CHECK) but must be
confirmed from the actual output. After trimming only outer whitespace, the
`expression` must exactly match PostgreSQL's `sleeve = ANY (ARRAY['core'::text,
'satellite'::text, 'risk_capital'::text])` serialization (or an exact equivalent `IN`
serialization). Mere presence of those three literals is insufficient: an extra value,
`OR` branch, function call or second referenced column is drift and must stop the apply.
Never lowercase or strip embedded whitespace: quoted literal values and the default
must preserve their exact case and spacing. Unexpected PostgreSQL formatting fails
closed and requires review rather than relaxing the guard.

The migration takes `ACCESS EXCLUSIVE` on `public.holdings` before reading catalog
metadata, serializing preflight and replacement with concurrent DDL/writes. Its
transaction-local `lock_timeout` is five seconds; a busy table aborts without a change.
Plan a quiet apply window and compare before/after counts before creating QA fixtures.

### 1.2 Column nullability and default

```sql
select
  column_name,
  is_nullable,
  column_default,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'holdings'
  and column_name  = 'sleeve';
```

**Expected:** `is_nullable = 'NO'`, `column_default = '''core''::text'` (or equivalent),
`data_type = 'text'`.

### 1.3 Row count and classification counts

```sql
-- Total rows
select count(*) as total_rows from public.holdings;

-- Per-sleeve breakdown
select sleeve, count(*) as rows
from public.holdings
group by sleeve
order by sleeve;
```

Record both outputs. Run the same queries immediately after migration and verify total
row count and all existing sleeve counts are identical. The `ballast` sleeve will be
absent from the `GROUP BY` output both before and after migration (no rows have been
written yet, so it does not appear as a group).

### 1.4 RLS enabled and force flags

```sql
select
  relname        as table_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where nspname = 'public'
  and relname  = 'holdings';
```

**Expected from migration 0008:** `rls_enabled = true`, `rls_forced = false`. Record the
live value rather than relying on this source-derived expectation.

### 1.5 RLS policies

```sql
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename  = 'holdings'
order by policyname;
```

**Expected: four policies** from 0008:

| policyname | cmd |
|---|---|
| `holdings_delete_own` | DELETE |
| `holdings_insert_own` | INSERT |
| `holdings_select_own` | SELECT |
| `holdings_update_own` | UPDATE |

Confirm all four are present before and after migration and that their `qual` /
`with_check` expressions are unchanged.

### 1.6 Grants

```sql
select
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'holdings'
order by grantee, privilege_type;
```

Record the full output. Verify it is identical after migration.

### 1.7 Indexes

```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename  = 'holdings'
order by indexname;
```

**Expected indexes from 0008:**

| indexname | definition |
|---|---|
| `holdings_pkey` | PRIMARY KEY on `id` |
| `holdings_user_id_idx` | `CREATE INDEX … ON public.holdings (user_id)` |
| `holdings_asset_id_idx` | `CREATE INDEX … ON public.holdings (asset_id)` |

Verify all three are present and unchanged after migration.

### 1.8 Foreign keys referencing or from holdings

```sql
-- Foreign keys on holdings (outbound)
select
  c.conname           as fk_name,
  a.attname           as local_column,
  ft.relname          as references_table,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_class     t  on t.oid  = c.conrelid
join pg_namespace n  on n.oid  = t.relnamespace
join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
join pg_class     ft on ft.oid = c.confrelid
where n.nspname = 'public'
  and t.relname  = 'holdings'
  and c.contype  = 'f'
order by c.conname;

-- Foreign keys pointing at holdings from other tables (inbound)
select
  c.conname           as fk_name,
  st.relname          as source_table,
  a.attname           as source_column,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_class     st on st.oid = c.conrelid
join pg_namespace n  on n.oid  = st.relnamespace
join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where n.nspname  = 'public'
  and c.confrelid = (select oid from pg_class where relname = 'holdings'
                       and relnamespace = (select oid from pg_namespace where nspname = 'public'))
  and c.contype   = 'f'
order by c.conname;
```

**Expected outbound FKs from 0008:** `user_id → public.users(id) ON DELETE CASCADE`,
`asset_id → public.assets(id) ON DELETE RESTRICT`.

**Expected inbound FK from 0008:** `asset_transactions.holding_id → public.holdings(id)
ON DELETE CASCADE`.

Verify all are present and definitions are unchanged after migration.

### 1.9 Table ownership

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as owner_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'holdings'
  and c.relkind = 'r';
```

Record the owner. Verify it is identical after migration.

---

## 2. Migration apply

Once every preflight check above passes and is recorded:

1. Begin a transaction (the migration SQL wraps itself in `begin`/`commit`).
2. Run the exact reviewed contents of `db/migrations/0010_invest_ballast_sleeve.sql`
   through the owner-approved SQL execution path. The repo's Drizzle journal is stale
   and `drizzle-kit generate` is broken, so do **not** assume `pnpm db:migrate` will
   discover or safely apply this hand-authored file. Previous investment migrations
   used a reviewed simple-protocol PostgreSQL execution path; the Supabase SQL editor
   can also execute the file's explicit transaction when the owner authorizes that path.
3. The `DO $$` block will print `NOTICE: PREFLIGHT PASSED` and `NOTICE: Dropped
   constraint …` to the query log, or raise an exception and roll back the entire
   transaction on any mismatch. Confirm the notices appear before the commit.
4. The final `ALTER TABLE … ADD CONSTRAINT holdings_sleeve_values` adds the expanded
   named CHECK.

If the migration raises an exception, the transaction is rolled back automatically. No
partial state is left. Investigate the reported mismatch, correct the cause, and obtain
fresh owner authorization before retrying.

---

## 3. Postflight queries (read-only — run immediately after migration)

Repeat each preflight query and compare to the before state. Expected differences only:

### 3.1 Constraint definition and name (postflight)

Same query as 1.1. **Expected change:** the row's `constraint_name` is now
`holdings_sleeve_values` (the stable named constraint added by this migration) and the
definition includes `'ballast'` alongside the three legacy values. No other rows.

### 3.2 Column nullability and default (postflight)

Same query as 1.2. **Expected: unchanged** — `is_nullable = 'NO'`,
`column_default = '''core''::text'`, `data_type = 'text'`.

### 3.3 Row count and classification counts (postflight)

Same queries as 1.3. **Expected: identical total row count.** The per-sleeve breakdown
must show the same counts for `core`, `satellite`, and `risk_capital`. The `ballast`
sleeve remains absent from the `GROUP BY` output because no row has been written with
that value. If any count differs, the migration mutated data — stop and investigate.

### 3.4 RLS flags (postflight)

Same query as 1.4. **Expected: unchanged** (`rls_enabled = true`,
`rls_forced = false`).

### 3.5 RLS policies (postflight)

Same query as 1.5. **Expected: all four policies unchanged** — names, commands, qual
expressions, and with_check expressions identical to preflight output.

### 3.6 Grants (postflight)

Same query as 1.6. **Expected: identical to preflight output.**

### 3.7 Indexes (postflight)

Same query as 1.7. **Expected: identical to preflight output** — three indexes,
definitions unchanged.

### 3.8 Foreign keys (postflight)

Same queries as 1.8. **Expected: identical to preflight output** — all foreign key
names and definitions unchanged.

### 3.9 Table ownership (postflight)

Same query as 1.9. **Expected: identical to preflight output.**

---

## 4. Rollback guidance

**Rollback is safe only before any `ballast` row has been written to `public.holdings`.**

Once a holding with `sleeve = 'ballast'` exists, removing `'ballast'` from the CHECK
constraint will cause those rows to violate the constraint. Do not roll back after a
ballast write without first obtaining explicit owner authorization to reclassify those
rows.

If rollback is needed before any ballast write:

```sql
-- Confirm no ballast rows exist before proceeding with rollback
select count(*) from public.holdings where sleeve = 'ballast';
-- Expected: 0 — abort if any value other than 0
```

Rollback itself also requires explicit owner authorization. If authorized, use one
transaction that takes an exclusive table lock before checking the guard, so a ballast
write cannot race between the check and constraint replacement:

```sql
begin;

lock table public.holdings in access exclusive mode;

do $$
begin
  if exists (select 1 from public.holdings where sleeve = 'ballast') then
    raise exception
      'ROLLBACK ABORTED: ballast rows exist. Obtain explicit row-by-row reclassification authorization.';
  end if;
end;
$$;

alter table public.holdings
  drop constraint holdings_sleeve_values;

alter table public.holdings
  add constraint holdings_sleeve_check
    check (sleeve in ('core', 'satellite', 'risk_capital'));

commit;
```

This restores a functionally equivalent constraint (the same three values as 0008) under
the conventional name `holdings_sleeve_check`. Run the preflight queries from section 1
after rollback to confirm the constraint name and definition match pre-migration state.

After any ballast row exists, rollback requires row-by-row reclassification authorized
by the owner — never silently collapse ballast back into core without that authorization.
Use a forward fix or compatible application rollback that retains ballast support instead.

---

## 5. Production status

Production database facts are **unverified**. This runbook was authored by reading only
the migration source files (`db/migrations/0008_invest_holdings.sql`,
`db/migrations/0009_invest_plans.sql`) and the proposal
(`docs/plans/QA-INVEST-2-ballast-proposal.md`). No live Supabase instance, no owner
portfolio, no remote database connection, and no `.env` or secrets file was inspected.

The following are unverified and must be confirmed by running the preflight queries
against the actual live database before any migration step:

- Actual CHECK constraint name on `public.holdings.sleeve`
- Actual CHECK constraint definition text as stored by Postgres
- Whether any intermediary migration or manual SQL applied to the live instance differs
  from the migration files in this repository
- Current row count and per-sleeve distribution
- Current grant list, index definitions, policy expressions, and foreign key definitions
- RLS enabled / forced flags as they actually appear on the live instance

Record all preflight outputs before applying the migration. Keep that record for the
implementation handoff.

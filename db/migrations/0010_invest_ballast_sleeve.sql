-- 0010 — JodSa Investments: expand holdings.sleeve to include 'ballast'.
-- Hand-authored CHECK-constraint migration only. No row updates, no backfill.
-- WARNING: Do NOT apply to the live Supabase project without explicit owner authorization.
--          This file is authored for review; no database connection is made here.
--
-- Design intent
--   Migration 0008 created public.holdings.sleeve with an unnamed CHECK permitting
--   exactly 'core', 'satellite', 'risk_capital'.  PostgreSQL conventionally names that
--   constraint 'holdings_sleeve_check', but the actual name on the deployed instance is
--   unverified — it must be confirmed with the preflight query below before applying.
--
--   This migration, inside a single transaction:
--     1. Preflights: asserts that exactly one CHECK on public.holdings constrains the
--        sleeve column to exactly the three legacy values, using pg_constraint metadata
--        and a fail-closed allowlist of PostgreSQL's normalized expression forms.
--        Raises an exception and rolls back if the constraint is missing, has an
--        unexpected definition, or if more than one such constraint exists.
--     2. Drops only the verified constraint by its dynamically resolved name.
--     3. Adds a stable NAMED CHECK permitting exactly 'core', 'ballast', 'satellite',
--        'risk_capital'.  Named so future migrations and runbook queries can reference it
--        by a predictable identifier rather than relying on convention.
--
--   Nothing else changes: the column, NOT NULL, default 'core', all rows, all indexes,
--   all grants, all foreign keys, object ownership, RLS enablement (row_security /
--   force_row_security flags), and all RLS policies are fully preserved.

begin;

-- Serialize preflight and replacement with writes/concurrent DDL. Fail instead
-- of waiting indefinitely if the table is busy; no change survives rollback.
set local lock_timeout = '5s';
lock table public.holdings in access exclusive mode;

do $$
declare
  v_con_name  text;
  v_con_def   text;
  v_con_expr  text;
  v_canonical_expr text;
  v_count     int;
  v_key_count int;
  v_validated boolean;
  v_column_count int;
  v_not_null boolean;
  v_default_expr text;
  v_data_type text;
begin
  -- ── Preflight: find the CHECK constraint on public.holdings.sleeve ──────────────
  --
  -- We inspect pg_constraint joined to pg_attribute to find every CHECK on the
  -- holdings table that references the 'sleeve' column. The executable expression
  -- from pg_get_expr is compared with a fail-closed allowlist. Only outer
  -- whitespace is trimmed: quoted literal case and embedded spaces stay exact.
  --
  -- Accepted pg_get_expr output forms (Postgres may emit either depending on version);
  -- the outer parentheses are part of the pg_get_expr serialization:
  --   (sleeve = ANY (ARRAY['core'::text, 'satellite'::text, 'risk_capital'::text]))
  --   (sleeve IN ('core'::text, 'satellite'::text, 'risk_capital'::text))
  --   (sleeve IN ('core', 'satellite', 'risk_capital'))
  -- Any extra literal, OR branch, function call, other column, reordered/changed
  -- operator, or already-expanded value fails before the constraint is dropped.

  select
      count(*),
      min(c.conname),
      min(pg_get_constraintdef(c.oid, true)),
      min(pg_get_expr(c.conbin, c.conrelid, true)),
      min(cardinality(c.conkey)),
      bool_and(c.convalidated)
    into v_count, v_con_name, v_con_def, v_con_expr, v_key_count, v_validated
    from pg_constraint c
    join pg_class     t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    -- confirm the constraint touches the sleeve column
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where n.nspname = 'public'
     and t.relname = 'holdings'
     and c.contype = 'c'          -- CHECK
     and a.attname = 'sleeve';

  -- Must find exactly one CHECK on sleeve
  if v_count <> 1 then
    raise exception
      'PREFLIGHT FAILED: expected exactly 1 CHECK constraint on public.holdings.sleeve, found %. '
      'Inspect pg_constraint manually before proceeding.',
      v_count;
  end if;

  if v_key_count <> 1 then
    raise exception
      'PREFLIGHT FAILED: CHECK constraint "%" references sleeve plus another column. '
      'Found definition: [%]. Do not proceed — inspect the constraint manually.',
      v_con_name, v_con_def;
  end if;

  -- coalesce guards against NULL from bool_and when v_count = 0 (already caught above,
  -- but also prevents a silent pass if the aggregate returns NULL for any other reason).
  if not coalesce(v_validated, false) then
    raise exception
      'PREFLIGHT FAILED: CHECK constraint "%" is NOT VALID. Do not replace an '
      'unvalidated production constraint without investigation.',
      v_con_name;
  end if;

  v_canonical_expr := btrim(coalesce(v_con_expr, ''));

  -- pg_get_expr may wrap the CHECK body in parentheses. The = ANY (ARRAY[...])
  -- form is the standard serialization observed in the read-only live preflight;
  -- the two IN variants cover PostgreSQL versions or configurations that retain IN syntax.
  -- All six allowlisted strings describe only the exact legacy expression from 0008.
  if v_canonical_expr not in (
    '(sleeve = ANY (ARRAY[''core''::text, ''satellite''::text, ''risk_capital''::text]))',
    'sleeve = ANY (ARRAY[''core''::text, ''satellite''::text, ''risk_capital''::text])',
    '(sleeve IN (''core''::text, ''satellite''::text, ''risk_capital''::text))',
    'sleeve IN (''core''::text, ''satellite''::text, ''risk_capital''::text)',
    '(sleeve IN (''core'', ''satellite'', ''risk_capital''))',
    'sleeve IN (''core'', ''satellite'', ''risk_capital'')'
  ) then
    raise exception
      'PREFLIGHT FAILED: CHECK constraint "%" is not the exact expected three-value '
      'legacy expression. Found expression: [%]. Do not proceed — compare the live '
      'expression with migration 0008 and review a revised migration.',
      v_con_name, v_con_expr;
  end if;

  -- The CHECK change cannot alter these attributes, but fail before DDL if the live
  -- column has already drifted from 0008's NOT NULL + default core contract.
  select
      count(*),
      bool_and(a.attnotnull),
      min(pg_get_expr(d.adbin, d.adrelid, true)),
      min(format_type(a.atttypid, a.atttypmod))
    into v_column_count, v_not_null, v_default_expr, v_data_type
    from pg_attribute a
    join pg_class t on t.oid = a.attrelid
    join pg_namespace n on n.oid = t.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where n.nspname = 'public'
     and t.relname = 'holdings'
     and a.attname = 'sleeve'
     and not a.attisdropped;

  if v_column_count <> 1
  or not coalesce(v_not_null, false)
  or v_data_type <> 'text'
  or btrim(coalesce(v_default_expr, ''))
       not in ('''core''::text', '''core''') then
    raise exception
      'PREFLIGHT FAILED: public.holdings.sleeve must be one NOT NULL text column '
      'with default core. Found count=%, type=%, not_null=%, default=[%].',
      v_column_count, v_data_type, v_not_null, v_default_expr;
  end if;

  raise notice 'PREFLIGHT PASSED: dropping constraint "%" with definition [%].',
    v_con_name, v_con_def;

  -- ── Step 1: drop the verified legacy CHECK ──────────────────────────────────────
  execute format('alter table public.holdings drop constraint %I', v_con_name);

  raise notice 'Dropped constraint "%".', v_con_name;
end;
$$;

-- ── Step 2: add the expanded, named CHECK ──────────────────────────────────────────
-- Named 'holdings_sleeve_values' so runbook and future migrations can reference it
-- by a stable, predictable identifier.  Order matches the approved product selector
-- order: core, ballast, satellite, risk_capital.
alter table public.holdings
  add constraint holdings_sleeve_values
    check (sleeve in ('core', 'ballast', 'satellite', 'risk_capital'));

commit;

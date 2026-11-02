# Supabase 資料庫狀態快照 SOP

## 1. 目的與範圍

Supabase SQL Editor 的 CSV 下載只保證匯出目前結果表格；**同一次執行包含多段 `SELECT` 時，不保證把每段查詢結果合併成一份 CSV**。因此完整盤點必須拆成多個獨立查詢：每次只執行一段 `SELECT`，下載一份 CSV，再依資料集名稱命名。

本 SOP 定義的是「Supabase PostgreSQL 資料庫 metadata／安全設定／migration history 快照」，不是整個 Supabase 平台的完整備份。它不包含資料列內容、Auth 使用者個資、Edge Function 原始碼與部署版本、Dashboard 專案設定、Secrets、API keys、網路設定或 Storage 物件內容。這些項目若任務需要，必須另用具權限的官方來源核對，不得宣稱本 SQL 快照已涵蓋。

所有查詢均為唯讀 `SELECT`，不執行 DDL、DML、權限變更或會改動資料的函式。每次只在正確 Supabase 專案的 SQL Editor 執行一段查詢並下載該結果。

## 2. 執行前準備

1. 在 Supabase Dashboard 確認目前選取的 Project，記下 Project Ref、環境名稱（production／staging／development）及操作者；不得把 Project Ref 當成 SQL 可自動驗證的欄位。
2. 記錄快照開始時間，使用台灣時間 `yyyy-MM-dd_HH-mm` 作為整批檔案共用的時間戳，例如 `2026-11-02_14-30`。
3. 依第 3 節順序執行。**每次只貼入並執行一個 SQL 區塊**，確認結果表格是該區塊的單一結果，再下載 CSV。不可把多個區塊一次貼入後，假設下載檔會包含全部結果。
4. 若某一段查詢失敗，記錄失敗資料集及錯誤；不得把缺少該資料集的匯出組合標示為完整快照。修正方式只能是調整該查詢的唯讀相容性，不能略過後仍宣稱完整。
5. 全部匯出後，逐一核對檔案數量、檔案大小、CSV 標頭、資料列數及每份結果內的 `captured_at_taipei`。若盤點期間發生 schema／migration／權限變更，應重新執行整批查詢。

## 3. 必要查詢集

以下每一個 SQL 區塊都必須獨立執行及下載。所有查詢皆回傳單一結果集。

### 00 — 資料庫與執行環境

檔名：`Supabase_State_<timestamp>_00_environment.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  clock_timestamp() AT TIME ZONE 'Asia/Taipei' AS captured_at_taipei,
  current_database() AS database_name,
  pg_get_userbyid(db.datdba) AS database_owner,
  pg_encoding_to_char(db.encoding) AS database_encoding,
  db.datcollate AS database_collation,
  db.datctype AS database_character_type,
  db.datconnlimit AS connection_limit,
  db.datallowconn AS allows_connections,
  db.datacl AS raw_database_acl,
  current_user AS current_role,
  session_user AS session_role,
  current_setting('server_version') AS server_version,
  current_setting('search_path') AS search_path,
  current_setting('TimeZone') AS session_timezone,
  current_setting('row_security') AS row_security_setting,
  version() AS server_build
FROM pg_database db
WHERE db.datname = current_database();
```

### 00b — Database Grants

檔名：`Supabase_State_<timestamp>_00b_database_grants.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  d.datname AS database_name,
  pg_get_userbyid(d.datdba) AS database_owner,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_database d
CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE d.datname = current_database()
ORDER BY d.datname, grantee, a.privilege_type;
```

### 01 — Schemas

檔名：`Supabase_State_<timestamp>_01_schemas.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  pg_get_userbyid(n.nspowner) AS owner,
  n.nspacl AS raw_acl,
  obj_description(n.oid, 'pg_namespace') AS comment
FROM pg_namespace n
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname;
```

### 02 — Tables、Views、Materialized Views、Sequences 與其他 Relations

檔名：`Supabase_State_<timestamp>_02_relations.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  c.relname AS relation_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned_table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
    WHEN 'S' THEN 'sequence'
    WHEN 'f' THEN 'foreign_table'
    WHEN 'i' THEN 'index'
    WHEN 'I' THEN 'partitioned_index'
    ELSE c.relkind::text
  END AS relation_type,
  pg_get_userbyid(c.relowner) AS owner,
  c.relpersistence AS persistence,
  c.relispartition AS is_partition,
  CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END AS partition_key,
  CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound, c.oid) END AS partition_bound,
  c.relrowsecurity AS row_level_security_enabled,
  c.relforcerowsecurity AS force_row_level_security,
  c.reltuples AS estimated_rows,
  pg_total_relation_size(c.oid) AS total_bytes,
  CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true) END AS view_definition,
  obj_description(c.oid, 'pg_class') AS comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
ORDER BY n.nspname, c.relname;
```

### 03 — Columns 與欄位預設值

檔名：`Supabase_State_<timestamp>_03_columns.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  table_schema AS schema_name,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default,
  is_identity,
  identity_generation,
  is_generated,
  generation_expression,
  collation_name,
  col_description(c.oid, a.attnum) AS column_comment
FROM information_schema.columns
LEFT JOIN pg_namespace n ON n.nspname = table_schema
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = table_name
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = column_name
  AND a.attnum > 0 AND NOT a.attisdropped
WHERE table_schema !~ '^pg_'
  AND table_schema <> 'information_schema'
ORDER BY table_schema, table_name, ordinal_position;
```

### 04 — Enum 與 Domain Types

檔名：`Supabase_State_<timestamp>_04_types.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  t.typname AS type_name,
  t.typtype AS type_kind,
  CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'd' THEN 'domain' ELSE t.typtype::text END AS type_kind_name,
  CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) END AS domain_base_type,
  t.typnotnull AS domain_not_null,
  t.typdefault AS domain_default,
  (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
   FROM pg_enum e WHERE e.enumtypid = t.oid) AS enum_labels
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND t.typtype IN ('e', 'd')
ORDER BY n.nspname, t.typname;
```

### 04b — Type Grants

檔名：`Supabase_State_<timestamp>_04b_type_grants.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  t.typname AS type_name,
  pg_get_userbyid(t.typowner) AS type_owner,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(t.typacl, acldefault('T', t.typowner))) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND t.typtype IN ('e', 'd', 'c', 'b')
ORDER BY n.nspname, t.typname, grantee, a.privilege_type;
```

### 05 — Constraints

檔名：`Supabase_State_<timestamp>_05_constraints.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  ns.nspname AS schema_name,
  tbl.relname AS table_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'primary_key'
    WHEN 'f' THEN 'foreign_key'
    WHEN 'u' THEN 'unique'
    WHEN 'c' THEN 'check'
    WHEN 'x' THEN 'exclusion'
    ELSE con.contype::text
  END AS constraint_type,
  refns.nspname AS referenced_schema,
  ref.relname AS referenced_table,
  pg_get_constraintdef(con.oid, true) AS definition,
  con.convalidated AS is_validated,
  con.condeferrable AS is_deferrable,
  con.condeferred AS initially_deferred
FROM pg_constraint con
JOIN pg_class tbl ON tbl.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
LEFT JOIN pg_class ref ON ref.oid = con.confrelid
LEFT JOIN pg_namespace refns ON refns.oid = ref.relnamespace
WHERE ns.nspname !~ '^pg_'
  AND ns.nspname <> 'information_schema'
ORDER BY ns.nspname, tbl.relname, con.conname;
```

### 05b — Domain Constraints

檔名：`Supabase_State_<timestamp>_05b_domain_constraints.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  t.typname AS domain_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid, true) AS definition,
  con.convalidated AS is_validated
FROM pg_constraint con
JOIN pg_type t ON t.oid = con.contypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE con.contypid <> 0
  AND n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, t.typname, con.conname;
```

### 06 — Indexes

檔名：`Supabase_State_<timestamp>_06_indexes.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  ns.nspname AS schema_name,
  tbl.relname AS table_name,
  idx.relname AS index_name,
  i.indisprimary AS is_primary,
  i.indisunique AS is_unique,
  i.indisvalid AS is_valid,
  i.indisready AS is_ready,
  pg_get_indexdef(i.indexrelid) AS definition,
  pg_get_expr(i.indpred, i.indrelid) AS partial_predicate
FROM pg_index i
JOIN pg_class tbl ON tbl.oid = i.indrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
JOIN pg_class idx ON idx.oid = i.indexrelid
WHERE ns.nspname !~ '^pg_'
  AND ns.nspname <> 'information_schema'
ORDER BY ns.nspname, tbl.relname, idx.relname;
```

### 07 — RLS 開關狀態

檔名：`Supabase_State_<timestamp>_07_rls_status.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname;
```

### 08 — RLS Policies

檔名：`Supabase_State_<timestamp>_08_rls_policies.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  c.relname AS table_name,
  p.polname AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE p.polcmd::text
  END AS command,
  p.polpermissive AS is_permissive,
  ARRAY(
    SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END
    FROM unnest(p.polroles) AS roles(role_oid)
  ) AS roles,
  pg_get_expr(p.polqual, p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname, p.polname;
```

### 09 — Schema Grants

檔名：`Supabase_State_<timestamp>_09_schema_grants.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  pg_get_userbyid(n.nspowner) AS schema_owner,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_namespace n
CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, grantee, a.privilege_type;
```

### 10 — Table／View／Foreign Table Grants

檔名：`Supabase_State_<timestamp>_10_relation_grants.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  pg_get_userbyid(c.relowner) AS relation_owner,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname, grantee, a.privilege_type;
```

### 10b — Column-level Grants

檔名：`Supabase_State_<timestamp>_10b_column_grants.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  table_schema AS schema_name,
  table_name,
  column_name,
  grantor,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.column_privileges
WHERE table_schema !~ '^pg_'
  AND table_schema <> 'information_schema'
ORDER BY table_schema, table_name, column_name, grantee, privilege_type;
```

### 11 — Sequence Grants

檔名：`Supabase_State_<timestamp>_11_sequence_grants.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  c.relname AS sequence_name,
  pg_get_userbyid(c.relowner) AS sequence_owner,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE c.relkind = 'S'
  AND n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname, grantee, a.privilege_type;
```

### 11b — Sequence Metadata

檔名：`Supabase_State_<timestamp>_11b_sequence_metadata.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  schemaname AS schema_name,
  sequencename AS sequence_name,
  sequenceowner AS owner,
  data_type,
  start_value,
  min_value,
  max_value,
  increment_by,
  cycle,
  cache_size
FROM pg_sequences
WHERE schemaname !~ '^pg_'
  AND schemaname <> 'information_schema'
ORDER BY schemaname, sequencename;
```

### 12 — Functions／Procedures Definitions

檔名：`Supabase_State_<timestamp>_12_functions.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  p.proname AS routine_name,
  p.oid::regprocedure AS identity,
  CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS routine_kind,
  pg_get_userbyid(p.proowner) AS owner,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS return_type,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proconfig AS function_settings,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND p.prokind IN ('f', 'p')
ORDER BY n.nspname, p.proname, p.oid::regprocedure::text;
```

### 13 — Function／Procedure EXECUTE Grants

檔名：`Supabase_State_<timestamp>_13_function_grants.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  p.proname AS routine_name,
  p.oid::regprocedure AS identity,
  pg_get_userbyid(p.proowner) AS routine_owner,
  p.prosecdef AS security_definer,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND p.prokind IN ('f', 'p')
ORDER BY n.nspname, p.proname, p.oid::regprocedure::text, grantee;
```

### 14 — Default Privileges

檔名：`Supabase_State_<timestamp>_14_default_privileges.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  COALESCE(n.nspname, '(all schemas)') AS schema_name,
  pg_get_userbyid(d.defaclrole) AS object_creator_role,
  d.defaclobjtype AS object_type,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  grantor.rolname AS grantor,
  a.privilege_type,
  a.is_grantable
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
LEFT JOIN pg_roles grantee ON grantee.oid = a.grantee
LEFT JOIN pg_roles grantor ON grantor.oid = a.grantor
ORDER BY schema_name, object_creator_role, d.defaclobjtype, grantee;
```

### 15 — User Triggers

檔名：`Supabase_State_<timestamp>_15_triggers.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  t.tgenabled AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS definition,
  t.tgfoid::regprocedure AS trigger_function
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname, t.tgname;
```

### 15b — Event Triggers

檔名：`Supabase_State_<timestamp>_15b_event_triggers.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  evtname AS event_trigger_name,
  evtevent AS event_name,
  evtenabled AS enabled_state,
  pg_get_userbyid(evtowner) AS owner,
  evtfoid::regprocedure AS trigger_function,
  evttags AS event_tags
FROM pg_event_trigger
ORDER BY evtname;
```

### 16 — Installed Extensions

檔名：`Supabase_State_<timestamp>_16_extensions.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  e.extname AS extension_name,
  e.extversion AS version,
  n.nspname AS schema_name,
  pg_get_userbyid(e.extowner) AS owner
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY e.extname;
```

### 17 — Supabase Migration History

檔名：`Supabase_State_<timestamp>_17_migrations.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  version,
  name
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

若 `supabase_migrations.schema_migrations` 不存在或沒有權限讀取，記錄錯誤及原因；不可將空結果冒充「沒有 migration」。

### 18 — Table Statistics（估算值）

檔名：`Supabase_State_<timestamp>_18_table_stats.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  schemaname AS schema_name,
  relname AS table_name,
  n_live_tup AS estimated_live_rows,
  n_dead_tup AS estimated_dead_rows,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) AS total_bytes
FROM pg_stat_user_tables
ORDER BY schemaname, relname;
```

`n_live_tup`／`n_dead_tup` 是統計估算，不是逐表 `COUNT(*)` 精確筆數；本 SOP 不讀取玩家資料列。

### 19 — Role Attributes

檔名：`Supabase_State_<timestamp>_19_roles.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  rolname AS role_name,
  rolsuper AS is_superuser,
  rolinherit AS inherits_privileges,
  rolcreaterole AS can_create_roles,
  rolcreatedb AS can_create_databases,
  rolcanlogin AS can_login,
  rolreplication AS can_replicate,
  rolbypassrls AS bypasses_rls,
  rolconnlimit AS connection_limit,
  rolvaliduntil AS valid_until
FROM pg_roles
ORDER BY rolname;
```

### 20 — Role Memberships

檔名：`Supabase_State_<timestamp>_20_role_memberships.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  granted.rolname AS granted_role,
  member.rolname AS member_role,
  grantor.rolname AS grantor_role,
  m.admin_option
FROM pg_auth_members m
JOIN pg_roles granted ON granted.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
JOIN pg_roles grantor ON grantor.oid = m.grantor
ORDER BY granted.rolname, member.rolname;
```

### 21 — Publications／Realtime Publication Tables

檔名：`Supabase_State_<timestamp>_21_publications.csv`

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  p.pubname AS publication_name,
  p.puballtables AS all_tables,
  p.pubinsert AS publishes_inserts,
  p.pubupdate AS publishes_updates,
  p.pubdelete AS publishes_deletes,
  p.pubtruncate AS publishes_truncates,
  pt.schemaname AS schema_name,
  pt.tablename AS table_name,
  pt.attnames AS published_columns,
  pt.rowfilter AS row_filter
FROM pg_publication p
LEFT JOIN pg_publication_tables pt ON pt.pubname = p.pubname
ORDER BY p.pubname, pt.schemaname, pt.tablename;
```

### 22 — Storage Bucket Metadata（選用）

檔名：`Supabase_State_<timestamp>_22_storage_buckets.csv`

只有在 `storage.buckets` 存在且目前角色有權讀取時才執行。若不存在或權限不足，記錄為「未取得」，不得將它解讀成沒有 bucket。

```sql
SELECT
  clock_timestamp() AS captured_at_utc,
  id AS bucket_id,
  name AS bucket_name,
  public AS is_public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
FROM storage.buckets
ORDER BY id;
```

## 4. 完整快照判定

必要匯出共 28 份 CSV：`00` 至 `21`，另加 `00b_database_grants`、`04b_type_grants`、`05b_domain_constraints`、`10b_column_grants`、`11b_sequence_metadata`、`15b_event_triggers`；`22_storage_buckets` 是選用資料集，但若本專案使用 Supabase Storage，應一併取得。只有必要檔案全部存在、均有有效標頭、查詢未報錯且時間戳一致性可接受，才能將這一組檔案標示為完整資料庫快照。

必要檔案核對清單：

- [ ] `00_environment`
- [ ] `00b_database_grants`
- [ ] `01_schemas`
- [ ] `02_relations`
- [ ] `03_columns`
- [ ] `04_types`
- [ ] `04b_type_grants`
- [ ] `05_constraints`
- [ ] `05b_domain_constraints`
- [ ] `06_indexes`
- [ ] `07_rls_status`
- [ ] `08_rls_policies`
- [ ] `09_schema_grants`
- [ ] `10_relation_grants`
- [ ] `10b_column_grants`
- [ ] `11_sequence_grants`
- [ ] `11b_sequence_metadata`
- [ ] `12_functions`
- [ ] `13_function_grants`
- [ ] `14_default_privileges`
- [ ] `15_triggers`
- [ ] `15b_event_triggers`
- [ ] `16_extensions`
- [ ] `17_migrations`
- [ ] `18_table_stats`
- [ ] `19_roles`
- [ ] `20_role_memberships`
- [ ] `21_publications`
- [ ] `22_storage_buckets`（若專案使用 Storage，必須取得；否則記錄不適用）

建議另外建立一份同時間戳的 `Supabase_State_<timestamp>_manifest.md`，記錄 Project Ref、環境、執行者、開始／結束時間、各 CSV 檔名、各資料集是否成功，以及失敗或不適用原因。Manifest 是人工核對清單，不取代任何查詢結果。

每份 CSV 檔名格式：

`Supabase_State_yyyy-MM-dd_HH-mm_<序號>_<dataset>.csv`

例如：

- `Supabase_State_2026-11-02_14-30_00_environment.csv`
- `Supabase_State_2026-11-02_14-30_01_schemas.csv`
- `Supabase_State_2026-11-02_14-30_17_migrations.csv`

若同名檔案已存在，不得覆蓋；整批使用新的時間戳。若只取得其中一部分，檔案仍可保留，但只能視為局部資料集，不得建立或命名成單一完整 `Supabase_State_yyyy-MM-dd_HH-mm.csv`。

下載後由 AI 自動辨識每份 CSV 的標頭與資料內容，依本節序號與 dataset 命名，並確認必要 22 份是否齊全。AI 不得把一份 `Table_Stats`、`Migration_Versions` 或其他單一結果改名成完整快照。

## 5. 限制與額外核對

- 每個查詢分開執行，代表每個結果是在不同資料庫交易／時間點讀取；這不是跨查詢的單一 MVCC 原子快照。請連續完成整批匯出，並比對各檔 `captured_at_utc`。若盤點期間有 DDL、migration、grant 或 policy 變更，整批重跑。
- 查詢結果依執行角色可見的 catalog／statistics 權限而定。空結果不必然表示物件不存在；若懷疑權限不足，記錄角色及錯誤，請具權限管理者重新執行。
- Migration history 只代表該資料表記錄的版本，不單獨證明 Edge Function、GitHub Pages 或其他服務已部署。
- `SECURITY DEFINER` 安全審查至少交叉檢查函式定義、固定 `search_path`、呼叫者身份驗證、`EXECUTE` ACL、RLS／table grants 及交易副作用；不得只看 RLS 是否開啟。
- 不要在 SQL Editor 執行多段查詢後，只下載最後一個結果便宣稱盤點完成。

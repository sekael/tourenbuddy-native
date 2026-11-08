-- =============================================================================
-- A contact_method value is unique to at most one contact per user.
--
-- Dedupe rule (no created_at exists on contact_methods or contacts, so "earliest"
-- is undefined): for each (user_id, method_type, value) group with >1 row, keep
-- the row with is_primary = true, tie-break lowest id; delete the rest. Then
-- re-promote: any contact left with phone methods but no primary phone gets its
-- lowest-id phone set is_primary = true (the app assumes a primary phone exists).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Dedupe existing cross-contact duplicates
-- ---------------------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (
           partition by user_id, method_type, value
           order by is_primary desc, id asc
         ) as rn
    from public.contact_methods
)
delete from public.contact_methods cm
 using ranked
 where cm.id = ranked.id
   and ranked.rn > 1;

-- ---------------------------------------------------------------------------
-- Re-promote primary phone for contacts left without one
-- ---------------------------------------------------------------------------
with missing_primary as (
  select contact_id
    from public.contact_methods
   where method_type = 'phone'
   group by contact_id
  having bool_or(is_primary) = false
),
promote as (
  select distinct on (cm.contact_id) cm.id
    from public.contact_methods cm
    join missing_primary mp on mp.contact_id = cm.contact_id
   where cm.method_type = 'phone'
   order by cm.contact_id, cm.id asc
)
update public.contact_methods cm
   set is_primary = true
  from promote
 where cm.id = promote.id;

-- ---------------------------------------------------------------------------
-- Enforce uniqueness per user going forward
-- ---------------------------------------------------------------------------
create unique index contact_methods_value_unique_per_user
  on public.contact_methods (user_id, method_type, value);

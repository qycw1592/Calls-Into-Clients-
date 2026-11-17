create table cc_private.booking_slots (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 service text not null check(service in ('pet','litter','windows')),
 state text not null default 'draft' check(state in ('draft','available','held','closed')),
 confirmed_by uuid references auth.users(id),
 property_id uuid references public.properties(id),
 held_at timestamptz,
 constraint slot_duration check(ends_at>starts_at),
 constraint slot_approval check(state='draft' or confirmed_by is not null),
 constraint slot_hold check((state='held')=(property_id is not null and held_at is not null)),
 exclude using gist (tstzrange(starts_at,ends_at,'[)') with &&) where (state in ('available','held'))
);
alter table cc_private.booking_slots enable row level security;
revoke all on cc_private.booking_slots from public,anon,authenticated;
grant select,insert,update on cc_private.booking_slots to service_role;
create or replace function public.cc_list_confirmed_slots(p_service text) returns table(id uuid,starts_at timestamptz,ends_at timestamptz) language sql stable security invoker set search_path='' as $$
 select b.id,b.starts_at,b.ends_at from cc_private.booking_slots b where b.state='available' and b.confirmed_by is not null and b.starts_at>now() and b.service=p_service order by b.starts_at limit 100
$$;
revoke all on function public.cc_list_confirmed_slots(text) from public,anon,authenticated;
grant execute on function public.cc_list_confirmed_slots(text) to service_role;

create table cc_private.cc_booking_slots (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 blocked_until timestamptz not null,
 owner_confirmed boolean not null default false,
 check (ends_at > starts_at),
 check (blocked_until >= ends_at + interval '15 minutes'),
 exclude using gist (tstzrange(starts_at, blocked_until,'[)') with &&)
);
create table cc_private.cc_booking_holds (
 slot_id uuid primary key references cc_private.cc_booking_slots(id),
 request_id uuid not null unique,
 created_at timestamptz not null default now()
);
alter table cc_private.cc_booking_slots enable row level security;
alter table cc_private.cc_booking_holds enable row level security;
revoke all on cc_private.cc_booking_slots,cc_private.cc_booking_holds from public,anon,authenticated;
create function public.cc_hold_booking_slot(p_slot uuid,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 if p_slot is null or p_request is null then raise exception 'invalid request'; end if;
 perform 1 from cc_private.cc_booking_slots where id=p_slot and owner_confirmed and starts_at>now() for update;
 if not found then raise exception 'slot unavailable'; end if;
 select slot_id into v from cc_private.cc_booking_holds where request_id=p_request;
 if found then if v=p_slot then return v; else raise exception 'request conflict'; end if; end if;
 insert into cc_private.cc_booking_holds(slot_id,request_id) values(p_slot,p_request);
 return p_slot;
end $$;
revoke all on function public.cc_hold_booking_slot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cc_hold_booking_slot(uuid,uuid) to service_role;
create table cc_private.booking_quote_approvals(
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.properties(id),
 service text not null check(service in ('pet','litter','windows')),
 amount_cents integer not null check(amount_cents>0),
 approved_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 slot_id uuid unique references cc_private.booking_slots(id),
 request_id uuid unique,
 held_until timestamptz,
 check((slot_id is null and request_id is null and held_until is null) or (slot_id is not null and request_id is not null and held_until is not null))
);
alter table cc_private.booking_quote_approvals enable row level security;
revoke all on cc_private.booking_quote_approvals from public,anon,authenticated;
grant select,insert,update on cc_private.booking_quote_approvals to service_role;
create or replace function public.cc_approve_booking_quote(p_actor uuid,p_property uuid,p_service text,p_amount integer,p_expires timestamptz) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if p_actor is null or not exists(select 1 from cc_private.staff where user_id=p_actor) then raise exception 'Not available' using errcode='42501'; end if;
 if p_service is null or p_service not in ('pet','litter','windows') or p_amount is null or p_amount<=0 or p_expires is null or p_expires<=now() or p_expires>now()+interval '30 days' then raise exception 'Invalid quote' using errcode='22023'; end if;
 if not exists(select 1 from public.properties where id=p_property) then raise exception 'Property unavailable' using errcode='42501'; end if;
 insert into cc_private.booking_quote_approvals(property_id,service,amount_cents,approved_by,expires_at) values(p_property,p_service,p_amount,p_actor,p_expires) returning id into v_id;
 return v_id;
end $$;
create or replace function public.cc_hold_approved_booking(p_actor uuid,p_quote uuid,p_slot uuid,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare q cc_private.booking_quote_approvals%rowtype; s cc_private.booking_slots%rowtype;
begin
 if p_actor is null or p_request is null then raise exception 'Invalid request' using errcode='22023'; end if;
 select * into q from cc_private.booking_quote_approvals where id=p_quote for update;
 if not found or not exists(select 1 from public.properties where id=q.property_id and customer_id=p_actor) then raise exception 'Quote unavailable' using errcode='42501'; end if;
 if q.expires_at<=now() then raise exception 'Expired quote' using errcode='22023'; end if;
 if q.slot_id is not null then
   if q.slot_id=p_slot and q.request_id=p_request and q.held_until>now() then return q.id; end if;
   raise exception 'Quote already reserved or hold expired' using errcode='PT409';
 end if;
 select * into s from cc_private.booking_slots where id=p_slot for update nowait;
 if not found or s.state<>'available' or s.service<>q.service or s.confirmed_by is null or s.starts_at<=now()+interval '15 minutes' or not exists(select 1 from cc_private.staff where user_id=s.confirmed_by) then raise exception 'Slot unavailable' using errcode='PT409'; end if;
 update cc_private.booking_slots set state='held',property_id=q.property_id,held_at=now() where id=s.id;
 update cc_private.booking_quote_approvals set slot_id=s.id,request_id=p_request,held_until=least(now()+interval '15 minutes',q.expires_at) where id=q.id;
 return q.id;
exception when lock_not_available then raise exception 'Slot temporarily unavailable' using errcode='PT409';
end $$;
revoke all on function public.cc_approve_booking_quote(uuid,uuid,text,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.cc_hold_approved_booking(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cc_approve_booking_quote(uuid,uuid,text,integer,timestamptz) to service_role;
grant execute on function public.cc_hold_approved_booking(uuid,uuid,uuid,uuid) to service_role;
-- Preserve legacy tables for audit, but disable the unbound legacy hold RPC.
revoke execute on function public.cc_hold_booking_slot(uuid,uuid) from service_role;
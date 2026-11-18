-- Pre-checkout only. Do not call after payment sessions are enabled until reconciliation is implemented.
create or replace function public.cc_release_expired_booking_hold(p_actor uuid,p_quote uuid)
returns boolean language plpgsql set search_path to '' as $$
declare q cc_private.booking_quote_approvals%rowtype; s cc_private.booking_slots%rowtype;
begin
 select * into q from cc_private.booking_quote_approvals where id=p_quote for update;
 if not found or p_actor is null or not exists(select 1 from public.properties where id=q.property_id and customer_id=p_actor) then raise exception 'Quote unavailable' using errcode='42501'; end if;
 if q.slot_id is null or q.held_until is null or q.held_until>now() then return false; end if;
 -- A payment attempt must be reconciled with Stripe before releasing its slot.
 if exists(select 1 from cc_private.checkout_test_attempts a where a.quote_id=q.id and a.request_id=q.request_id and a.state in ('pending','open','paid','needs_review')) then return false; end if;
 select * into s from cc_private.booking_slots where id=q.slot_id for update;
 if not found or s.state<>'held' or s.property_id is distinct from q.property_id or s.service is distinct from q.service then return false; end if;
 update cc_private.booking_slots set state='available',property_id=null,held_at=null where id=s.id;
 update cc_private.booking_quote_approvals set slot_id=null,request_id=null,held_until=null where id=q.id;
 return true;
end $$;
revoke all on function public.cc_release_expired_booking_hold(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cc_release_expired_booking_hold(uuid,uuid) to service_role;

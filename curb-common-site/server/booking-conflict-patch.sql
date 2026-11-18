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

revoke all on function public.cc_hold_approved_booking(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cc_hold_approved_booking(uuid,uuid,uuid,uuid) to service_role;

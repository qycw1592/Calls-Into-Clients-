create or replace function public.cc_booking_hold_receipt(p_actor uuid,p_quote uuid,p_request uuid)
returns table(quote_id uuid,slot_id uuid,held_until timestamptz,amount_cents integer)
language sql stable set search_path='' as $$
select q.id,q.slot_id,q.held_until,q.amount_cents
from cc_private.booking_quote_approvals q
join public.properties p on p.id=q.property_id
join cc_private.booking_slots s on s.id=q.slot_id
where p.customer_id=p_actor and q.id=p_quote and q.request_id=p_request
and q.held_until>now() and q.expires_at>now() and s.state='held'
and s.property_id=q.property_id and s.service=q.service
$$;
revoke all on function public.cc_booking_hold_receipt(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cc_booking_hold_receipt(uuid,uuid,uuid) to service_role;

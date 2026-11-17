create or replace function public.cc_list_approved_booking_slots(p_actor uuid,p_quote uuid)
returns table(slot_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable set search_path to '' as $$
select s.id,s.starts_at,s.ends_at
from cc_private.booking_quote_approvals q
join public.properties p on p.id=q.property_id
join cc_private.booking_slots s on s.service=q.service
join cc_private.staff st on st.user_id=s.confirmed_by
where q.id=p_quote and p.customer_id=p_actor and q.expires_at>now()
and q.slot_id is null and s.state='available' and s.starts_at>now()+interval '15 minutes'
and s.starts_at<now()+interval '30 days'
order by s.starts_at,s.id limit 50
$$;
revoke all on function public.cc_list_approved_booking_slots(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cc_list_approved_booking_slots(uuid,uuid) to service_role;
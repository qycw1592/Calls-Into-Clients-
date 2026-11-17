-- Idempotent staff approval and authenticated customer quote discovery.
create table cc_private.quote_approval_requests (
 request_id uuid primary key,
 actor_id uuid not null,
 property_id uuid not null,
 service text not null,
 amount_cents integer not null,
 expires_at timestamptz not null,
 quote_id uuid not null references cc_private.booking_quote_approvals(id) on delete restrict
);
alter table cc_private.quote_approval_requests enable row level security;
revoke all on cc_private.quote_approval_requests from public, anon, authenticated;
grant select,insert on cc_private.quote_approval_requests to service_role;
create function public.cc_approve_booking_quote_request(p_actor uuid,p_property uuid,p_service text,p_amount integer,p_expires timestamptz,p_request uuid)
returns uuid language plpgsql set search_path to '' as $$
declare existing cc_private.quote_approval_requests%rowtype; q uuid;
begin
 if p_actor is null or not exists(select 1 from cc_private.staff where user_id=p_actor) then raise exception 'Not available' using errcode='42501'; end if;
 if p_request is null or p_property is null or p_service is null or p_amount is null or p_expires is null then raise exception 'Invalid request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,73121));
 select * into existing from cc_private.quote_approval_requests where request_id=p_request;
 if found then
  if existing.actor_id is distinct from p_actor or existing.property_id is distinct from p_property or existing.service is distinct from p_service or existing.amount_cents is distinct from p_amount or existing.expires_at is distinct from p_expires then raise exception 'Request conflict' using errcode='40001'; end if;
  return existing.quote_id;
 end if;
 q:=public.cc_approve_booking_quote(p_actor,p_property,p_service,p_amount,p_expires);
 insert into cc_private.quote_approval_requests values(p_request,p_actor,p_property,p_service,p_amount,p_expires,q);
 return q;
end $$;
revoke all on function public.cc_approve_booking_quote_request(uuid,uuid,text,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.cc_approve_booking_quote_request(uuid,uuid,text,integer,timestamptz,uuid) to service_role;
create function public.cc_list_customer_approved_quotes(p_actor uuid)
returns table(quote_id uuid,property_id uuid,service text,amount_cents integer,expires_at timestamptz)
language sql stable set search_path to '' as $$
select q.id,q.property_id,q.service,q.amount_cents,q.expires_at from cc_private.booking_quote_approvals q
join public.properties p on p.id=q.property_id where p.customer_id=p_actor and q.expires_at>now() and q.slot_id is null
order by q.created_at desc,q.id limit 100
$$;
revoke all on function public.cc_list_customer_approved_quotes(uuid) from public,anon,authenticated;
grant execute on function public.cc_list_customer_approved_quotes(uuid) to service_role;

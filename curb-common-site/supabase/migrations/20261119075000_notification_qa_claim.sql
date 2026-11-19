-- Capture-only synthetic claim; no external transport or real recipient lookup.
alter table cc_private.notification_outbox add column if not exists qa_claim_token uuid, add column if not exists qa_claimed_at timestamptz, add column if not exists qa_attempts integer not null default 0, add column if not exists qa_captured_at timestamptz;
create or replace function cc_private.claim_notification_qa(p_event uuid,p_actor uuid,p_property uuid)
returns table(event_id uuid,claim_token uuid,recipient text) language sql security definer set search_path='' as $$
with eligible as (
 select o.id,u.email from cc_private.notification_outbox o
 join public.properties p on p.id=p_property and p.customer_id=p_actor
 join auth.users u on u.id=p.customer_id
 where o.id=p_event and u.email ~ '^cc-qa-[a-z0-9-]+@example\.invalid$'
 and o.qa_captured_at is null and o.qa_attempts<3
 and (o.qa_claimed_at is null or o.qa_claimed_at<now()-interval '5 minutes')
 and ((o.event_type='service_request.created' and exists(select 1 from public.service_requests s where s.id=o.entity_id and s.property_id=p.id))
 or (o.event_type='visit.scheduled' and exists(select 1 from public.visits v where v.id=o.entity_id and v.property_id=p.id))
 or (o.event_type='quote.approved' and exists(select 1 from cc_private.booking_quote_approvals q where q.id=o.entity_id and q.property_id=p.id)))
 for update of o skip locked
), claimed as (
 update cc_private.notification_outbox o set qa_claim_token=gen_random_uuid(),qa_claimed_at=now(),qa_attempts=o.qa_attempts+1 from eligible e where o.id=e.id returning o.id,o.qa_claim_token,e.email
) select id,qa_claim_token,email from claimed;
$$;
create or replace function cc_private.finish_notification_qa(p_event uuid,p_token uuid,p_captured boolean)
returns boolean language sql security definer set search_path='' as $$
with changed as (update cc_private.notification_outbox set qa_captured_at=case when p_captured then now() else null end,qa_claim_token=null,qa_claimed_at=null where id=p_event and qa_claim_token=p_token and qa_captured_at is null and qa_claimed_at>=now()-interval '5 minutes' returning id) select exists(select 1 from changed);
$$;
revoke all on function cc_private.claim_notification_qa(uuid,uuid,uuid),cc_private.finish_notification_qa(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function cc_private.claim_notification_qa(uuid,uuid,uuid),cc_private.finish_notification_qa(uuid,uuid,boolean) to service_role;

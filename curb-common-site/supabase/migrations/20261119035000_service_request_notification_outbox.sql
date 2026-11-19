-- Private transactional outbox; no sender or external network access.
create table cc_private.notification_outbox (
 id uuid primary key default gen_random_uuid(),
 event_type text not null check (event_type = 'service_request.created'),
 entity_id uuid not null,
 created_at timestamptz not null default now(),
 unique(event_type, entity_id)
);
alter table cc_private.notification_outbox enable row level security;
revoke all on cc_private.notification_outbox from public, anon, authenticated;
grant select, insert, delete on cc_private.notification_outbox to service_role;
create function cc_private.enqueue_service_request_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into cc_private.notification_outbox(event_type,entity_id)
 values ('service_request.created',new.id) on conflict(event_type,entity_id) do nothing;
 return new;
end;
$$;
revoke all on function cc_private.enqueue_service_request_notification() from public, anon, authenticated;
create trigger cc_service_request_outbox after insert on public.service_requests
for each row execute function cc_private.enqueue_service_request_notification();
-- No delivery until a separately accepted worker and recipient policy exist.

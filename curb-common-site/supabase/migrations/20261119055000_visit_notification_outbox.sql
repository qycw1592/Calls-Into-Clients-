-- Queue initial scheduled visit only; no delivery or external network access.
alter table cc_private.notification_outbox drop constraint notification_outbox_event_type_check;
alter table cc_private.notification_outbox add constraint notification_outbox_event_type_check check (event_type in ('service_request.created','visit.scheduled'));
create function cc_private.enqueue_scheduled_visit_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'scheduled' then
  if tg_op = 'INSERT' then
   insert into cc_private.notification_outbox(event_type,entity_id) values ('visit.scheduled',new.id) on conflict(event_type,entity_id) do nothing;
  elsif old.status is distinct from new.status then
   insert into cc_private.notification_outbox(event_type,entity_id) values ('visit.scheduled',new.id) on conflict(event_type,entity_id) do nothing;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function cc_private.enqueue_scheduled_visit_notification() from public, anon, authenticated;
create trigger cc_visit_scheduled_outbox after insert or update of status on public.visits
for each row execute function cc_private.enqueue_scheduled_visit_notification();

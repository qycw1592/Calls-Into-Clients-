alter table cc_private.notification_outbox drop constraint notification_outbox_event_type_check, add constraint notification_outbox_event_type_check check (event_type in ('service_request.created','visit.scheduled','quote.approved'));
create function cc_private.enqueue_quote_approved() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into cc_private.notification_outbox(event_type,entity_id) values ('quote.approved',new.id) on conflict (event_type,entity_id) do nothing;
 return new;
end;
$$;
revoke all on function cc_private.enqueue_quote_approved() from public, anon, authenticated;
create trigger quote_approved_outbox after insert on cc_private.booking_quote_approvals for each row execute function cc_private.enqueue_quote_approved();

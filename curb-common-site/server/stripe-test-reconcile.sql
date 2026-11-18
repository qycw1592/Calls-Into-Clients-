-- Sandbox reconciliation only; service_role callable after verified Stripe signature and session retrieval.
alter table cc_private.checkout_test_attempts add column visit_id uuid references public.visits(id),add column invoice_id uuid references public.invoices(id);
create table cc_private.checkout_test_events(event_id text primary key check(event_id like 'evt_%'),attempt_id uuid not null references cc_private.checkout_test_attempts(id),event_kind text not null check(event_kind in ('paid','expired')),received_at timestamptz not null default now());
alter table cc_private.checkout_test_events enable row level security;
revoke all on cc_private.checkout_test_events from public,anon,authenticated;
grant select,insert on cc_private.checkout_test_events to service_role;
create function public.cc_reconcile_test_checkout(p_attempt uuid,p_session text,p_quote uuid,p_request uuid,p_amount integer,p_event text,p_kind text)
returns text language plpgsql security invoker set search_path='' as $$
declare q cc_private.booking_quote_approvals%rowtype;s cc_private.booking_slots%rowtype;a cc_private.checkout_test_attempts%rowtype;v_visit uuid;v_invoice uuid;prior cc_private.checkout_test_events%rowtype;
begin
 if p_session is null or p_session not like 'cs_test_%' or p_event is null or p_event not like 'evt_%' or p_kind not in ('paid','expired') or p_amount<=0 then raise exception 'Invalid event' using errcode='22023';end if;
 select * into q from cc_private.booking_quote_approvals where id=p_quote for update;
 if not found then raise exception 'Quote unavailable' using errcode='42501';end if;
 select * into s from cc_private.booking_slots where id=q.slot_id for update;
 select * into a from cc_private.checkout_test_attempts where id=p_attempt for update;
 if not found or a.quote_id<>p_quote or a.request_id<>p_request or a.amount_cents<>p_amount or q.amount_cents<>p_amount or (a.stripe_session_id is not null and a.stripe_session_id<>p_session) then raise exception 'Event mismatch' using errcode='22023';end if;
 select * into prior from cc_private.checkout_test_events where event_id=p_event;
 if found then
 if prior.attempt_id<>p_attempt or prior.event_kind<>p_kind then raise exception 'Event mismatch' using errcode='22023';end if;
 return a.state;
 end if;
 insert into cc_private.checkout_test_events(event_id,attempt_id,event_kind) values(p_event,p_attempt,p_kind);
 update cc_private.checkout_test_attempts set stripe_session_id=p_session where id=a.id;
 if a.state='paid' then return 'paid';end if;
 if a.state='needs_review' then return 'needs_review';end if;
 if p_kind='expired' then update cc_private.checkout_test_attempts set state='expired' where id=a.id;return 'expired';end if;
 -- A paid session may arrive after the hold timestamp, but only confirm the exact still-held reservation.
 if a.state not in ('pending','open') or q.request_id is distinct from p_request or s.id is null or s.state<>'held' or s.property_id is distinct from q.property_id or s.service<>q.service or s.starts_at<=now() then
 update cc_private.checkout_test_attempts set state='needs_review' where id=a.id;return 'needs_review';
 end if;
 insert into public.visits(property_id,service,scheduled_at,status,notes) values(q.property_id,q.service,s.starts_at,'scheduled','SYNTHETIC STRIPE TEST ONLY') returning id into v_visit;
 insert into public.invoices(property_id,amount_cents,status) values(q.property_id,p_amount,'paid') returning id into v_invoice;
 update cc_private.booking_slots set state='closed',property_id=null,held_at=null where id=s.id;
 update cc_private.checkout_test_attempts set state='paid',visit_id=v_visit,invoice_id=v_invoice where id=a.id;
 return 'paid';
end $$;
revoke all on function public.cc_reconcile_test_checkout(uuid,text,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.cc_reconcile_test_checkout(uuid,text,uuid,uuid,integer,text,text) to service_role;
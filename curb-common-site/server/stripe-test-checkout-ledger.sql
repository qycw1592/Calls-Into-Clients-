-- Sandbox-only checkout ledger. No public table access or live-payment capability.
create table cc_private.checkout_test_attempts(
 id uuid primary key default gen_random_uuid(),quote_id uuid not null references cc_private.booking_quote_approvals(id),
 request_id uuid not null,actor_id uuid not null references auth.users(id),amount_cents integer not null check(amount_cents>0),
 expires_at timestamptz not null,state text not null default 'pending' check(state in ('pending','open','paid','expired','needs_review')),
 stripe_session_id text unique check(stripe_session_id is null or stripe_session_id like 'cs_test_%'),
 created_at timestamptz not null default now(),unique(quote_id,request_id)
);
alter table cc_private.checkout_test_attempts enable row level security;
revoke all on cc_private.checkout_test_attempts from public,anon,authenticated;
grant select,insert,update on cc_private.checkout_test_attempts to service_role;
create function public.cc_prepare_test_checkout(p_actor uuid,p_quote uuid,p_request uuid)
returns table(attempt_id uuid,amount_cents integer,expires_at timestamptz,session_id text,state text)
language plpgsql security invoker set search_path='' as $$
declare q cc_private.booking_quote_approvals%rowtype; s cc_private.booking_slots%rowtype; a cc_private.checkout_test_attempts%rowtype; deadline timestamptz;
begin
 select * into q from cc_private.booking_quote_approvals where id=p_quote for update;
 if not found or not exists(select 1 from public.properties where id=q.property_id and customer_id=p_actor) then raise exception 'Quote unavailable' using errcode='42501';end if;
 if q.request_id is distinct from p_request or q.slot_id is null then raise exception 'Hold unavailable' using errcode='PT409';end if;
 select * into s from cc_private.booking_slots where id=q.slot_id for update;
 if not found or s.state<>'held' or s.property_id is distinct from q.property_id then raise exception 'Hold unavailable' using errcode='PT409';end if;
 select * into a from cc_private.checkout_test_attempts where quote_id=q.id and request_id=p_request;
 if found then
 if a.actor_id<>p_actor or a.state not in ('pending','open') or a.expires_at<=now() then raise exception 'Checkout unavailable' using errcode='PT409';end if;
 return query select a.id,a.amount_cents,a.expires_at,a.stripe_session_id,a.state;return;end if;
 deadline:=date_trunc('second',now()+interval '35 minutes');
 if q.held_until<=now() or q.expires_at<=deadline or s.starts_at<=deadline+interval '15 minutes' then raise exception 'Hold unavailable' using errcode='PT409';end if;
 insert into cc_private.checkout_test_attempts(quote_id,request_id,actor_id,amount_cents,expires_at)
 values(q.id,p_request,p_actor,q.amount_cents,deadline) returning * into a;
 update cc_private.booking_quote_approvals set held_until=deadline where id=q.id;
 return query select a.id,a.amount_cents,a.expires_at,a.stripe_session_id,a.state;
end $$;
create function public.cc_bind_test_checkout(p_actor uuid,p_attempt uuid,p_session text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a cc_private.checkout_test_attempts%rowtype;
begin
 if p_session is null or p_session not like 'cs_test_%' or length(p_session)>255 then raise exception 'Invalid session' using errcode='22023';end if;
 select * into a from cc_private.checkout_test_attempts where id=p_attempt for update;
 if not found or a.actor_id<>p_actor then raise exception 'Checkout unavailable' using errcode='42501';end if;
 if a.state not in ('pending','open') or (a.stripe_session_id is not null and a.stripe_session_id<>p_session) then raise exception 'Checkout unavailable' using errcode='PT409';end if;
 update cc_private.checkout_test_attempts set stripe_session_id=p_session,state='open' where id=a.id;
 return true;
end $$;
revoke all on function public.cc_prepare_test_checkout(uuid,uuid,uuid),public.cc_bind_test_checkout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cc_prepare_test_checkout(uuid,uuid,uuid),public.cc_bind_test_checkout(uuid,uuid,text) to service_role;
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

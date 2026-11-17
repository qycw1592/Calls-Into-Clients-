begin;
insert into auth.users(id,email) values ('bb000000-0000-4000-8000-000000000011','cc-booking-a@example.invalid'),('bb000000-0000-4000-8000-000000000012','cc-booking-b@example.invalid');
insert into public.properties(id,customer_id,address) values ('bb000000-0000-4000-8000-000000000021','bb000000-0000-4000-8000-000000000011','Synthetic booking QA');
insert into cc_private.booking_slots(id,starts_at,ends_at,service,state,confirmed_by,property_id,held_at) values ('bb000000-0000-4000-8000-000000000031',now()+interval '100 years',now()+interval '100 years 1 hour','pet','held','bb000000-0000-4000-8000-000000000012','bb000000-0000-4000-8000-000000000021',now());
insert into cc_private.booking_quote_approvals(id,property_id,service,amount_cents,approved_by,expires_at,slot_id,request_id,held_until) values ('bb000000-0000-4000-8000-000000000041','bb000000-0000-4000-8000-000000000021','pet',10000,'bb000000-0000-4000-8000-000000000012',now()+interval '1 day','bb000000-0000-4000-8000-000000000031','bb000000-0000-4000-8000-000000000051',now()+interval '10 minutes');
do $$ begin
if not exists(select 1 from public.cc_booking_hold_receipt('bb000000-0000-4000-8000-000000000011','bb000000-0000-4000-8000-000000000041','bb000000-0000-4000-8000-000000000051') where amount_cents=10000 and slot_id='bb000000-0000-4000-8000-000000000031') then raise exception 'valid receipt missing'; end if;
if exists(select 1 from public.cc_booking_hold_receipt('bb000000-0000-4000-8000-000000000012','bb000000-0000-4000-8000-000000000041','bb000000-0000-4000-8000-000000000051')) then raise exception 'cross-account receipt'; end if;
if exists(select 1 from public.cc_booking_hold_receipt('bb000000-0000-4000-8000-000000000011','bb000000-0000-4000-8000-000000000041','bb000000-0000-4000-8000-000000000052')) then raise exception 'wrong request receipt'; end if;
update cc_private.booking_quote_approvals set held_until=now()-interval '1 second' where id='bb000000-0000-4000-8000-000000000041';
if exists(select 1 from public.cc_booking_hold_receipt('bb000000-0000-4000-8000-000000000011','bb000000-0000-4000-8000-000000000041','bb000000-0000-4000-8000-000000000051')) then raise exception 'expired receipt'; end if;
end $$;
select 'PASS: positive amount, cross-account, wrong request, expired hold' as result;
rollback;
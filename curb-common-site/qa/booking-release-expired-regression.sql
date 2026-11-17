begin;
insert into auth.users(id,email) values ('bc000000-0000-4000-8000-000000000011','cc-flow-a@example.invalid'),('bc000000-0000-4000-8000-000000000012','cc-flow-b@example.invalid'),('bc000000-0000-4000-8000-000000000013','cc-flow-staff@example.invalid');
insert into cc_private.staff(user_id) values ('bc000000-0000-4000-8000-000000000013');
insert into public.properties(id,customer_id,address) values ('bc000000-0000-4000-8000-000000000021','bc000000-0000-4000-8000-000000000011','Synthetic flow A'),('bc000000-0000-4000-8000-000000000022','bc000000-0000-4000-8000-000000000012','Synthetic flow B');
insert into cc_private.booking_slots(id,starts_at,ends_at,service,state,confirmed_by) values ('bc000000-0000-4000-8000-000000000031',now()+interval '100 years',now()+interval '100 years 1 hour','pet','available','bc000000-0000-4000-8000-000000000013');
insert into cc_private.booking_quote_approvals(id,property_id,service,amount_cents,approved_by,expires_at) values ('bc000000-0000-4000-8000-000000000041','bc000000-0000-4000-8000-000000000021','pet',10000,'bc000000-0000-4000-8000-000000000013',now()+interval '1 day'),('bc000000-0000-4000-8000-000000000042','bc000000-0000-4000-8000-000000000022','pet',10000,'bc000000-0000-4000-8000-000000000013',now()+interval '1 day');
do $$ begin
perform public.cc_hold_approved_booking('bc000000-0000-4000-8000-000000000011','bc000000-0000-4000-8000-000000000041','bc000000-0000-4000-8000-000000000031','bc000000-0000-4000-8000-000000000051');
if public.cc_release_expired_booking_hold('bc000000-0000-4000-8000-000000000011','bc000000-0000-4000-8000-000000000041') then raise exception 'active hold released'; end if;
begin perform public.cc_release_expired_booking_hold('bc000000-0000-4000-8000-000000000012','bc000000-0000-4000-8000-000000000041'); raise exception 'cross-account release'; exception when insufficient_privilege then null; end;
update cc_private.booking_quote_approvals set held_until=now()-interval '1 minute' where id='bc000000-0000-4000-8000-000000000041';
if not public.cc_release_expired_booking_hold('bc000000-0000-4000-8000-000000000011','bc000000-0000-4000-8000-000000000041') then raise exception 'expired hold not released'; end if;
if public.cc_release_expired_booking_hold('bc000000-0000-4000-8000-000000000011','bc000000-0000-4000-8000-000000000041') then raise exception 'repeat release'; end if;
perform public.cc_hold_approved_booking('bc000000-0000-4000-8000-000000000012','bc000000-0000-4000-8000-000000000042','bc000000-0000-4000-8000-000000000031','bc000000-0000-4000-8000-000000000052');
if not exists(select 1 from cc_private.booking_slots where id='bc000000-0000-4000-8000-000000000031' and state='held' and property_id='bc000000-0000-4000-8000-000000000022') then raise exception 'rebooking failed'; end if;
end $$;
select 'PASS: active hold retained, cross-account denied, expired released, retry no-op, rebooking succeeds' as result;
rollback;
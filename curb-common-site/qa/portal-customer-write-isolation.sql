begin;
insert into auth.users(id,email) values ('ab000000-0000-4000-8000-000000000011','cc-qa-write@example.invalid');
insert into public.properties(id,customer_id,address) values ('ab000000-0000-4000-8000-000000000021','ab000000-0000-4000-8000-000000000011','QA synthetic');
insert into public.visits(id,property_id,service,scheduled_at) values ('ab000000-0000-4000-8000-000000000041','ab000000-0000-4000-8000-000000000021','pet',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000011',true);
do $$ declare n integer; begin
update public.properties set address='unauthorized' where id='ab000000-0000-4000-8000-000000000021'; get diagnostics n=row_count; if n<>0 then raise exception 'customer property update allowed'; end if;
update public.visits set scheduled_at=now()+interval '1 day' where id='ab000000-0000-4000-8000-000000000041'; get diagnostics n=row_count; if n<>0 then raise exception 'customer visit update allowed'; end if;
begin insert into public.properties(id,customer_id,address) values ('ab000000-0000-4000-8000-000000000022','ab000000-0000-4000-8000-000000000011','unauthorized'); raise exception 'customer property insert allowed'; exception when insufficient_privilege then null; end;
begin insert into public.visits(id,property_id,service,scheduled_at) values ('ab000000-0000-4000-8000-000000000042','ab000000-0000-4000-8000-000000000021','pet',now()); raise exception 'customer visit insert allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin;
insert into auth.users(id,email) values ('aa000000-0000-4000-8000-000000000011','cc-qa-a@example.invalid'),('aa000000-0000-4000-8000-000000000012','cc-qa-b@example.invalid');
insert into public.properties(id,customer_id,address) values ('aa000000-0000-4000-8000-000000000021','aa000000-0000-4000-8000-000000000011','QA synthetic A'),('aa000000-0000-4000-8000-000000000022','aa000000-0000-4000-8000-000000000012','QA synthetic B');
insert into public.invoices(id,property_id,amount_cents,status) values ('aa000000-0000-4000-8000-000000000031','aa000000-0000-4000-8000-000000000021',100,'open'),('aa000000-0000-4000-8000-000000000032','aa000000-0000-4000-8000-000000000021',100,'draft'),('aa000000-0000-4000-8000-000000000033','aa000000-0000-4000-8000-000000000022',100,'open');
insert into public.visits(id,property_id,service,scheduled_at) values ('aa000000-0000-4000-8000-000000000041','aa000000-0000-4000-8000-000000000021','pet',now()),('aa000000-0000-4000-8000-000000000042','aa000000-0000-4000-8000-000000000022','pet',now());
insert into public.service_requests(id,property_id,message) values ('aa000000-0000-4000-8000-000000000051','aa000000-0000-4000-8000-000000000021','QA synthetic A'),('aa000000-0000-4000-8000-000000000052','aa000000-0000-4000-8000-000000000022','QA synthetic B');
set local role authenticated;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000011',true);
do $$ begin
if (select count(*) from public.properties where id in ('aa000000-0000-4000-8000-000000000021','aa000000-0000-4000-8000-000000000022')) <> 1 then raise exception 'property isolation failed'; end if;
if (select count(*) from public.invoices where id in ('aa000000-0000-4000-8000-000000000031','aa000000-0000-4000-8000-000000000032','aa000000-0000-4000-8000-000000000033')) <> 1 then raise exception 'invoice isolation failed'; end if;
if not exists(select 1 from public.invoices where id='aa000000-0000-4000-8000-000000000031') then raise exception 'own open invoice missing'; end if;
if (select count(*) from public.visits where id in ('aa000000-0000-4000-8000-000000000041','aa000000-0000-4000-8000-000000000042')) <> 1 then raise exception 'visit isolation failed'; end if;
if (select count(*) from public.service_requests where id in ('aa000000-0000-4000-8000-000000000051','aa000000-0000-4000-8000-000000000052')) <> 1 then raise exception 'request isolation failed'; end if;
if exists(select 1 from public.leads) then raise exception 'customer can see leads'; end if;
end $$;
rollback;
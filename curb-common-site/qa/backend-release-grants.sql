-- C&C release regression: read-only, fails closed on privilege drift.
do $qa$
declare f record; n integer:=0;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('cc_create_service_request','cc_set_lead_status','cc_submit_inquiry','cc_intake_client_gate') loop
 n:=n+1;
 if has_function_privilege('anon',f.oid,'execute') or has_function_privilege('authenticated',f.oid,'execute') or not has_function_privilege('service_role',f.oid,'execute') then raise exception 'Unsafe RPC grants: %',f.proname; end if;
 end loop;
 if n<>4 then raise exception 'Expected four protected RPCs, found %',n; end if;
 if has_table_privilege('authenticated','public.leads','UPDATE') or has_table_privilege('authenticated','public.service_requests','INSERT') or has_table_privilege('authenticated','public.service_requests','UPDATE') then raise exception 'Direct portal writes exposed'; end if;
 if exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname in ('leads','properties','service_requests','visits','invoices') and not c.relrowsecurity) then raise exception 'RLS disabled'; end if;
 if (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname in ('leads','properties','service_requests','visits','invoices') and c.relrowsecurity)<>5 then raise exception 'Missing protected table'; end if;
end $qa$;
select 'PASS: protected RPC grants, direct-write denial, five RLS tables' as result;

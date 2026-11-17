-- Read-only release gate: all current public C&C RPCs, including booking.
do $qa$
declare f record; n integer:=0;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname like 'cc\_%' escape '\' loop
 n:=n+1;
 if has_function_privilege('anon',f.oid,'execute') or has_function_privilege('authenticated',f.oid,'execute') then raise exception 'Public RPC exposed: %',f.proname; end if;
 if has_function_privilege('service_role',f.oid,'execute') <> (f.proname <> 'cc_hold_booking_slot') then raise exception 'Unexpected server grant: %',f.proname; end if;
 end loop;
 if n<>9 then raise exception 'RPC inventory changed: %',n; end if;
 if exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='cc_private' and c.relkind='r' and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) then raise exception 'Private table exposed'; end if;
end $qa$;
select 'PASS: nine RPCs, retired hold denied, private tables inaccessible' as result;
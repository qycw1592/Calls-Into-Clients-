-- C&C read-only search-path and RLS release regression.
do $qa$
declare f record; t record; nf int:=0; nt int:=0;
begin
 for f in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cc\_%' escape '\' loop
 nf:=nf+1;
 if not coalesce('search_path=""'=any(f.proconfig),false) then raise exception 'Unsafe search path: %',f.proname; end if;
 end loop;
 for t in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cc_private' and c.relkind='r' loop
 nt:=nt+1;
 if not t.relrowsecurity then raise exception 'RLS disabled: %',t.relname; end if;
 if has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Private table grant: %',t.relname; end if;
 end loop;
 if nf<9 or nt<7 then raise exception 'Unexpected inventory: %, %',nf,nt; end if;
 if has_schema_privilege('anon','cc_private','CREATE') or has_schema_privilege('authenticated','cc_private','CREATE') then raise exception 'Private schema CREATE exposed'; end if;
end $qa$;
select 'PASS: pinned RPC search paths, private RLS and expanded privileges' as result;
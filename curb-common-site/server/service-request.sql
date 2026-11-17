-- Server-only. Pass actor ID ONLY from a verified Auth session, never from browser input.
create or replace function public.cc_create_service_request(p_actor uuid,p_property uuid,p_message text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if p_actor is null or not exists(select 1 from public.properties where id=p_property and customer_id=p_actor) then raise exception 'Request not available' using errcode='42501'; end if;
 if p_message is null or length(trim(p_message)) not between 1 and 3000 then raise exception 'Invalid request' using errcode='22023'; end if;
 insert into public.service_requests(property_id,message,status) values(p_property,trim(p_message),'new') returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.cc_create_service_request(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cc_create_service_request(uuid,uuid,text) to service_role;
-- Optional request UUID overload; legacy three-argument RPC remains unchanged.
create or replace function public.cc_create_service_request(p_actor uuid,p_property uuid,p_message text,p_request uuid)
returns uuid language plpgsql set search_path to '' as $function$
declare v_id uuid;
begin
 if p_actor is null or not exists(select 1 from public.properties where id=p_property and customer_id=p_actor) then raise exception 'Request not available' using errcode='42501'; end if;
 if p_message is null or length(trim(p_message)) not between 1 and 3000 or p_request is null then raise exception 'Invalid request' using errcode='22023'; end if;
 insert into public.service_requests(id,property_id,message,status) values(p_request,p_property,trim(p_message),'new') on conflict(id) do nothing returning id into v_id;
 if v_id is not null then return v_id; end if;
 select id into v_id from public.service_requests where id=p_request and property_id=p_property and message=trim(p_message);
 if v_id is null then raise exception 'Request identifier conflict' using errcode='22023'; end if;
 return v_id;
end; $function$;
revoke all on function public.cc_create_service_request(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.cc_create_service_request(uuid,uuid,text,uuid) to service_role;

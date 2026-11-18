CREATE OR REPLACE FUNCTION public.cc_set_lead_status(p_actor uuid, p_lead uuid, p_expected text, p_next text)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO '' AS $function$
declare v_id uuid;
begin
 if p_actor is null or not exists(select 1 from cc_private.staff where user_id=p_actor) then raise exception 'Not available' using errcode='42501'; end if;
 if not ((p_expected='new' and p_next in ('reviewing','closed')) or (p_expected='reviewing' and p_next in ('quoted','closed')) or (p_expected='quoted' and p_next='closed')) then raise exception 'Invalid transition' using errcode='22023'; end if;
 update public.leads set status=p_next where id=p_lead and status=p_expected returning id into v_id;
 if v_id is null then raise exception 'Lead not available or changed' using errcode='PT409'; end if;
 return v_id;
end; $function$;
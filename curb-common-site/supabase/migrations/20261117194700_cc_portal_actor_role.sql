create or replace function public.cc_portal_actor_is_staff(p_actor uuid) returns boolean language sql stable security definer set search_path = '' as $$ select p_actor is not null and exists(select 1 from cc_private.staff where user_id=p_actor) $$;
revoke all on function public.cc_portal_actor_is_staff(uuid) from public, anon, authenticated;
grant execute on function public.cc_portal_actor_is_staff(uuid) to service_role;

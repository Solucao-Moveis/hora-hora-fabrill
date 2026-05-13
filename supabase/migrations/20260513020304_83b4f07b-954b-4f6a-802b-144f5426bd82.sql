
create or replace function public.handle_first_user_pcp()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.user_roles) = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'pcp');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_promote_pcp
  after insert on auth.users
  for each row execute function public.handle_first_user_pcp();

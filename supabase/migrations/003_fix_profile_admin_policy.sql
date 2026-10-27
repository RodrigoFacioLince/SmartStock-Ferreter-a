create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'admin'
    );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.is_current_user_admin());

update storage.buckets
set public = true
where id = 'product-images';

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only" on public.profiles
for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

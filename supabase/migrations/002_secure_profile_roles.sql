drop policy if exists "profiles_insert_authenticated" on public.profiles;
create policy "profiles_insert_authenticated" on public.profiles
for insert to authenticated with check (
    id = auth.uid()
    and role = 'seller'
);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only" on public.profiles
for update to authenticated using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
    )
);

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'seller');

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text not null,
    role app_role not null default 'seller',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text not null default '',
    category text not null,
    price numeric(12,2) not null check (price >= 0),
    quantity integer not null default 0 check (quantity >= 0),
    min_stock integer not null default 0 check (min_stock >= 0),
    image_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists products_name_category_unique
    on public.products (lower(name), lower(category));

create table if not exists public.sales (
    id uuid primary key default gen_random_uuid(),
    seller_id uuid not null references public.profiles(id),
    total numeric(12,2) not null check (total >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.sale_details (
    id uuid primary key default gen_random_uuid(),
    sale_id uuid not null references public.sales(id) on delete cascade,
    product_id uuid not null references public.products(id),
    quantity integer not null check (quantity > 0),
    unit_price numeric(12,2) not null check (unit_price >= 0),
    subtotal numeric(12,2) not null check (subtotal >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.inventory_adjustments (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id),
    old_quantity integer not null,
    new_quantity integer not null,
    reason text not null default 'manual adjustment',
    created_by uuid not null references public.profiles(id),
    created_at timestamptz not null default now()
);

create or replace function public.update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.update_updated_at();

create trigger products_updated_at
before update on public.products
for each row
execute function public.update_updated_at();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_details enable row level security;
alter table public.inventory_adjustments enable row level security;

create policy "profiles_select_authenticated" on public.profiles
for select to authenticated using (true);

create policy "profiles_insert_authenticated" on public.profiles
for insert to authenticated with check (id = auth.uid());

create policy "profiles_update_self_or_admin" on public.profiles
for update to authenticated using (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "products_select_authenticated" on public.products
for select to authenticated using (true);

create policy "products_manage_admin_only" on public.products
for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "sales_select_role_based" on public.sales
for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or seller_id = auth.uid()
);

create policy "sales_insert_role_based" on public.sales
for insert to authenticated with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'seller'))
    and seller_id = auth.uid()
);

create policy "sales_details_read_own_or_admin" on public.sale_details
for select to authenticated using (
    exists (
        select 1 from public.sales s
        join public.profiles p on p.id = s.seller_id
        where s.id = sale_details.sale_id and (p.id = auth.uid() or p.role = 'admin')
    )
);

create policy "inventory_adjustments_admin_only" on public.inventory_adjustments
for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product_images_select_public" on storage.objects
for select to public using (bucket_id = 'product-images');

create policy "product_images_insert_admin_only" on storage.objects
for insert to authenticated with check (
    bucket_id = 'product-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "product_images_update_admin_only" on storage.objects
for update to authenticated using (
    bucket_id = 'product-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
    bucket_id = 'product-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "product_images_delete_admin_only" on storage.objects
for delete to authenticated using (
    bucket_id = 'product-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.register_sale(p_seller_id uuid, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
    sale_id uuid := gen_random_uuid();
    item jsonb;
    item_product_id uuid;
    product_record record;
    product_request record;
    sale_total numeric(12,2) := 0;
    requested_quantity integer;
    sale_inserted record;
begin
    if p_seller_id is null then
        raise exception 'seller_id is required';
    end if;

    if not exists (
        select 1
        from public.profiles
        where id = p_seller_id
    ) then
        raise exception 'Seller profile not found';
    end if;

    if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
        raise exception 'Sale items must be a JSON array';
    end if;

    if jsonb_array_length(p_items) = 0 then
        raise exception 'Sale must include at least one product';
    end if;

    for item in select * from jsonb_array_elements(p_items)
    loop
        if jsonb_typeof(item) is distinct from 'object'
            or jsonb_typeof(item->'product_id') is distinct from 'string'
            or jsonb_typeof(item->'quantity') is distinct from 'number'
            or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$' then
            raise exception 'Each sale item must include a valid product_id and positive integer quantity';
        end if;

        item_product_id := (item->>'product_id')::uuid;
        requested_quantity := (item->>'quantity')::integer;

        if item_product_id is null then
            raise exception 'Sale product_id is required';
        end if;
    end loop;

    for product_request in
        select
            (entry.value->>'product_id')::uuid as product_id,
            sum((entry.value->>'quantity')::integer)::bigint as requested_quantity
        from jsonb_array_elements(p_items) as entry(value)
        group by (entry.value->>'product_id')::uuid
        order by (entry.value->>'product_id')::uuid
    loop
        select * into product_record
        from public.products
        where id = product_request.product_id
        for update;

        if not found then
            raise exception 'Product not found';
        end if;

        if product_record.quantity < product_request.requested_quantity then
            raise exception 'Insufficient stock for product %', product_record.name;
        end if;

        sale_total := sale_total + (product_record.price * product_request.requested_quantity);
    end loop;

    insert into public.sales (id, seller_id, total)
    values (sale_id, p_seller_id, sale_total)
    returning * into sale_inserted;

    insert into public.sale_details (id, sale_id, product_id, quantity, unit_price, subtotal)
    select
        gen_random_uuid(),
        sale_id,
        (entry.value->>'product_id')::uuid,
        (entry.value->>'quantity')::integer,
        product.price,
        product.price * (entry.value->>'quantity')::integer
    from jsonb_array_elements(p_items) as entry(value)
    join public.products product on product.id = (entry.value->>'product_id')::uuid;

    for product_request in
        select
            (entry.value->>'product_id')::uuid as product_id,
            sum((entry.value->>'quantity')::integer)::bigint as requested_quantity
        from jsonb_array_elements(p_items) as entry(value)
        group by (entry.value->>'product_id')::uuid
        order by (entry.value->>'product_id')::uuid
    loop
        update public.products
        set quantity = quantity - product_request.requested_quantity,
            updated_at = now()
        where id = product_request.product_id;
    end loop;

    return jsonb_build_object(
        'id', sale_inserted.id,
        'seller_id', sale_inserted.seller_id,
        'total', sale_inserted.total,
        'created_at', sale_inserted.created_at
    );
end;
$$;

comment on table public.products is 'Inventory products for the ferreteria';
comment on table public.sales is 'Sales records';
comment on table public.sale_details is 'Each product included in a sale';

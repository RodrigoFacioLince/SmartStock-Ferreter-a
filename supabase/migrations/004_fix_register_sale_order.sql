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

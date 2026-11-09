alter table public.products
    add column if not exists image_urls jsonb not null default '[]'::jsonb;

update public.products
set image_urls = jsonb_build_array(image_url)
where coalesce(image_url, '') <> ''
  and image_urls = '[]'::jsonb;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.products'::regclass
          and conname = 'products_image_urls_max_five'
    ) then
        alter table public.products
            add constraint products_image_urls_max_five
            check (
                jsonb_typeof(image_urls) = 'array'
                and jsonb_array_length(image_urls) <= 5
            );
    end if;
end;
$$;

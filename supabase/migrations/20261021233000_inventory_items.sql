create table public.inventory_items (
    id uuid primary key default gen_random_uuid(),
    barber_id uuid not null references public.profiles (id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 100),
    category text not null check (char_length(trim(category)) between 1 and 60),
    quantity numeric(10, 2) not null default 0 check (quantity >= 0),
    unit text not null check (unit in ('un.', 'caixas', 'pacotes', 'litros', 'frascos', 'pares', 'rolos')),
    unit_cost numeric(10, 2) not null default 0 check (unit_cost >= 0),
    minimum_quantity numeric(10, 2) not null default 0 check (minimum_quantity >= 0),
    updated_at timestamptz not null default now()
);

create index inventory_items_barber_name_idx
    on public.inventory_items (barber_id, name);

alter table public.inventory_items enable row level security;

create policy "Barbers can manage their own inventory"
    on public.inventory_items for all to authenticated
    using (
        barber_id = (select auth.uid())
        and exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.role = 'barber'
        )
    )
    with check (
        barber_id = (select auth.uid())
        and exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.role = 'barber'
        )
    );

grant select, delete on public.inventory_items to authenticated;

create function public.create_inventory_item(
    p_name text,
    p_category text,
    p_quantity numeric,
    p_unit text,
    p_unit_cost numeric,
    p_minimum_quantity numeric,
    p_entry_date date
)
returns public.inventory_items
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := auth.uid();
    created_item public.inventory_items;
begin
    if current_user_id is null or not exists (
        select 1 from public.profiles p
        where p.id = current_user_id and p.role = 'barber'
    ) then
        raise exception using errcode = '42501', message = 'Only authenticated barbers can manage inventory.';
    end if;
    if p_quantity is null or p_quantity <> round(p_quantity, 2)
        or p_unit_cost is null or p_unit_cost <> round(p_unit_cost, 2)
        or p_minimum_quantity is null or p_minimum_quantity <> round(p_minimum_quantity, 2)
        or p_entry_date is null then
        raise exception using errcode = '22023', message = 'Inventory values must have at most two decimal places.';
    end if;

    insert into public.inventory_items (
        barber_id, name, category, quantity, unit, unit_cost, minimum_quantity
    ) values (
        current_user_id, trim(p_name), trim(p_category), p_quantity, trim(p_unit), p_unit_cost, p_minimum_quantity
    )
    returning * into created_item;

    if p_quantity > 0 and p_unit_cost > 0 then
        insert into public.financial_entries (barber_id, type, description, category, amount, entry_date)
        values (
            current_user_id,
            'expense',
            'Compra de estoque: ' || created_item.name,
            'Estoque',
            round(p_quantity * p_unit_cost, 2),
            p_entry_date
        );
    end if;

    return created_item;
end;
$function$;

revoke all on function public.create_inventory_item(text, text, numeric, text, numeric, numeric, date) from public;
grant execute on function public.create_inventory_item(text, text, numeric, text, numeric, numeric, date) to authenticated;

create function public.move_inventory_item(
    p_item_id uuid,
    p_direction text,
    p_quantity numeric,
    p_unit_cost numeric,
    p_entry_date date
)
returns public.inventory_items
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := auth.uid();
    selected_item public.inventory_items;
begin
    if current_user_id is null or not exists (
        select 1 from public.profiles p
        where p.id = current_user_id and p.role = 'barber'
    ) then
        raise exception using errcode = '42501', message = 'Only authenticated barbers can manage inventory.';
    end if;

    if p_direction is null or p_direction not in ('entry', 'use')
        or p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 2)
        or p_entry_date is null then
        raise exception using errcode = '22023', message = 'Invalid inventory movement.';
    end if;
    if p_direction = 'entry' and (p_unit_cost is null or p_unit_cost < 0 or p_unit_cost <> round(p_unit_cost, 2)) then
        raise exception using errcode = '22023', message = 'Unit cost cannot be negative.';
    end if;

    select item.* into selected_item
    from public.inventory_items item
    where item.id = p_item_id and item.barber_id = current_user_id
    for update;

    if not found then
        raise exception using errcode = 'P0002', message = 'Inventory item not found.';
    end if;

    if p_direction = 'use' then
        if selected_item.quantity < p_quantity then
            raise exception using errcode = '22023', message = 'Usage quantity exceeds available stock.';
        end if;
        update public.inventory_items
        set quantity = quantity - p_quantity, updated_at = now()
        where id = p_item_id
        returning * into selected_item;
    else
        update public.inventory_items
        set quantity = quantity + p_quantity, unit_cost = p_unit_cost, updated_at = now()
        where id = p_item_id
        returning * into selected_item;

        if p_unit_cost > 0 then
            insert into public.financial_entries (barber_id, type, description, category, amount, entry_date)
            values (
                current_user_id,
                'expense',
                'Compra de estoque: ' || selected_item.name,
                'Estoque',
                round(p_quantity * p_unit_cost, 2),
                p_entry_date
            );
        end if;
    end if;

    return selected_item;
end;
$function$;

revoke all on function public.move_inventory_item(uuid, text, numeric, numeric, date) from public;
grant execute on function public.move_inventory_item(uuid, text, numeric, numeric, date) to authenticated;

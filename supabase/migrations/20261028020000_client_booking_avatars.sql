drop function public.get_my_bookings();

create function public.get_my_bookings()
returns table (
    id uuid,
    customer_id uuid,
    customer_name text,
    customer_avatar_path text,
    barber_id uuid,
    barber_name text,
    shop_name text,
    service_id uuid,
    service_name text,
    price numeric,
    starts_at timestamptz,
    ends_at timestamptz,
    status text
)
language sql
stable
security definer
set search_path = ''
as $$
    select b.id, b.customer_id, customer.full_name, customer.avatar_path,
        b.barber_id, barber.full_name, barber.shop_name, b.service_id, s.name, s.price,
        b.starts_at, b.ends_at, b.status
    from public.bookings b
    join public.profiles customer on customer.id = b.customer_id
    join public.profiles barber on barber.id = b.barber_id
    join public.services s on s.id = b.service_id
    where b.customer_id = (select auth.uid()) or b.barber_id = (select auth.uid())
    order by b.starts_at desc
    limit 200;
$$;

revoke all on function public.get_my_bookings() from public, anon, authenticated;
grant execute on function public.get_my_bookings() to authenticated;

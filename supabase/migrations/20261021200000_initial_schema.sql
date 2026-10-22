create extension if not exists btree_gist with schema extensions;

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    role text not null check (role in ('barber', 'customer')),
    full_name text not null check (char_length(trim(full_name)) between 1 and 100),
    shop_name text,
    bio text not null default '' check (char_length(bio) <= 500),
    created_at timestamptz not null default now(),
    constraint barber_shop_name_required check (
        role <> 'barber' or (shop_name is not null and char_length(trim(shop_name)) > 0)
    )
);

create table public.services (
    id uuid primary key default gen_random_uuid(),
    barber_id uuid not null references public.profiles (id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 100),
    description text not null default '' check (char_length(description) <= 500),
    price numeric(10, 2) not null check (price >= 0),
    duration_minutes integer not null check (duration_minutes between 10 and 480),
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table public.posts (
    id uuid primary key default gen_random_uuid(),
    barber_id uuid not null references public.profiles (id) on delete cascade,
    body text not null check (char_length(trim(body)) between 1 and 2000),
    image_url text check (image_url is null or char_length(image_url) <= 2048),
    created_at timestamptz not null default now()
);

create table public.post_likes (
    post_id uuid not null references public.posts (id) on delete cascade,
    profile_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (post_id, profile_id)
);

create table public.post_comments (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.posts (id) on delete cascade,
    author_id uuid not null references public.profiles (id) on delete cascade,
    body text not null check (char_length(trim(body)) between 1 and 1000),
    created_at timestamptz not null default now()
);

create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.profiles (id) on delete cascade,
    barber_id uuid not null references public.profiles (id) on delete cascade,
    service_id uuid not null references public.services (id) on delete restrict,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null default 'pending'
        check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
    created_at timestamptz not null default now(),
    constraint valid_booking_period check (ends_at > starts_at),
    constraint barber_booking_no_overlap exclude using gist (
        barber_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status in ('pending', 'confirmed'))
);

create index services_barber_active_idx on public.services (barber_id, active);
create index posts_created_at_idx on public.posts (created_at desc);
create index post_comments_post_created_idx on public.post_comments (post_id, created_at);
create index bookings_customer_start_idx on public.bookings (customer_id, starts_at);
create index bookings_barber_start_idx on public.bookings (barber_id, starts_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected_role text;
begin
    selected_role := coalesce(new.raw_user_meta_data ->> 'role', 'customer');
    if selected_role not in ('barber', 'customer') then
        raise exception 'Invalid account role';
    end if;

    insert into public.profiles (id, role, full_name, shop_name)
    values (
        new.id,
        selected_role,
        trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'shop_name', '')), '')
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.role is distinct from old.role or new.id is distinct from old.id then
        raise exception 'Account role and owner cannot be changed';
    end if;
    return new;
end;
$$;

create trigger protect_profile_role_before_update
    before update on public.profiles
    for each row execute function public.protect_profile_role();

create or replace function public.validate_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    service_duration integer;
begin
    if new.starts_at <= now() then
        raise exception 'Booking must be in the future';
    end if;

    select duration_minutes into service_duration
    from public.services
    where id = new.service_id
      and barber_id = new.barber_id
      and active = true;

    if service_duration is null then
        raise exception 'Service is not available for this barber';
    end if;

    if new.ends_at <> new.starts_at + make_interval(mins => service_duration) then
        raise exception 'Booking duration does not match the service';
    end if;
    return new;
end;
$$;

create trigger validate_booking_before_write
    before insert or update on public.bookings
    for each row execute function public.validate_booking();

create or replace function public.get_public_posts()
returns table (
    id uuid,
    barber_id uuid,
    barber_name text,
    shop_name text,
    body text,
    image_url text,
    created_at timestamptz,
    likes_count bigint,
    comments_count bigint,
    has_liked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select p.id, p.barber_id, b.full_name, b.shop_name, p.body, p.image_url, p.created_at,
        (select count(*) from public.post_likes l where l.post_id = p.id),
        (select count(*) from public.post_comments c where c.post_id = p.id),
        exists (
            select 1 from public.post_likes mine
            where mine.post_id = p.id and mine.profile_id = (select auth.uid())
        )
    from public.posts p
    join public.profiles b on b.id = p.barber_id and b.role = 'barber'
    order by p.created_at desc
    limit 100;
$$;

create or replace function public.get_post_comments(p_post_id uuid)
returns table (id uuid, author_name text, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, author.full_name, c.body, c.created_at
    from public.post_comments c
    join public.profiles author on author.id = c.author_id
    where c.post_id = p_post_id
      and exists (select 1 from public.posts p where p.id = p_post_id)
    order by c.created_at asc
    limit 100;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    update public.bookings
    set status = 'cancelled'
    where id = p_booking_id
      and customer_id = (select auth.uid())
      and status in ('pending', 'confirmed')
      and starts_at > now();
    if not found then
        raise exception 'Booking cannot be cancelled';
    end if;
end;
$$;

create or replace function public.get_my_bookings()
returns table (
    id uuid,
    customer_id uuid,
    customer_name text,
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
    select b.id, b.customer_id, customer.full_name, b.barber_id, barber.full_name,
        barber.shop_name, b.service_id, s.name, s.price, b.starts_at, b.ends_at, b.status
    from public.bookings b
    join public.profiles customer on customer.id = b.customer_id
    join public.profiles barber on barber.id = b.barber_id
    join public.services s on s.id = b.service_id
    where b.customer_id = (select auth.uid()) or b.barber_id = (select auth.uid())
    order by b.starts_at desc
    limit 200;
$$;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.bookings enable row level security;

create policy "Users can view their own profile and public barber profiles"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or role = 'barber');
create policy "Users can update their own profile"
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

create policy "Anyone can view active services"
    on public.services for select to anon, authenticated
    using (active or barber_id = (select auth.uid()));
create policy "Barbers can manage their services"
    on public.services for insert to authenticated
    with check (
        barber_id = (select auth.uid())
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'barber')
    );
create policy "Barbers can update their services"
    on public.services for update to authenticated
    using (barber_id = (select auth.uid()))
    with check (barber_id = (select auth.uid()));
create policy "Barbers can delete their services"
    on public.services for delete to authenticated
    using (barber_id = (select auth.uid()));

create policy "Anyone can view barber posts"
    on public.posts for select to anon, authenticated
    using (exists (select 1 from public.profiles p where p.id = barber_id and p.role = 'barber'));
create policy "Barbers can create their posts"
    on public.posts for insert to authenticated
    with check (
        barber_id = (select auth.uid())
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'barber')
    );
create policy "Barbers can manage their posts"
    on public.posts for update to authenticated
    using (barber_id = (select auth.uid()))
    with check (barber_id = (select auth.uid()));
create policy "Barbers can delete their posts"
    on public.posts for delete to authenticated
    using (barber_id = (select auth.uid()));

create policy "Users can view their own likes"
    on public.post_likes for select to authenticated
    using (profile_id = (select auth.uid()));
create policy "Customers can like posts"
    on public.post_likes for insert to authenticated
    with check (
        profile_id = (select auth.uid())
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'customer')
    );
create policy "Users can remove their own likes"
    on public.post_likes for delete to authenticated
    using (profile_id = (select auth.uid()));

create policy "Users can view post comments"
    on public.post_comments for select to authenticated
    using (exists (select 1 from public.posts p where p.id = post_id));
create policy "Customers can comment on posts"
    on public.post_comments for insert to authenticated
    with check (
        author_id = (select auth.uid())
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'customer')
    );
create policy "Authors can delete their comments"
    on public.post_comments for delete to authenticated
    using (author_id = (select auth.uid()));

create policy "Customers and barbers can view their bookings"
    on public.bookings for select to authenticated
    using (customer_id = (select auth.uid()) or barber_id = (select auth.uid()));
create policy "Customers can request bookings"
    on public.bookings for insert to authenticated
    with check (
        customer_id = (select auth.uid())
        and status = 'pending'
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'customer')
    );
create policy "Barbers can update their bookings"
    on public.bookings for update to authenticated
    using (barber_id = (select auth.uid()))
    with check (barber_id = (select auth.uid()));
create policy "Customers can cancel future bookings"
    on public.bookings for update to authenticated
    using (
        customer_id = (select auth.uid())
        and status in ('pending', 'confirmed')
        and starts_at > now()
    )
    with check (customer_id = (select auth.uid()) and status = 'cancelled');

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_role() from public, anon, authenticated;
revoke all on function public.validate_booking() from public, anon, authenticated;
revoke all on function public.get_public_posts() from public, anon, authenticated;
revoke all on function public.get_post_comments(uuid) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid) from public, anon, authenticated;
revoke all on function public.get_my_bookings() from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.services, public.posts to authenticated;
grant select on public.services, public.posts to anon;
grant update (full_name, shop_name, bio) on public.profiles to authenticated;
grant select, insert, update, delete on public.services, public.posts to authenticated;
grant insert, delete on public.post_likes, public.post_comments to authenticated;
grant select, insert on public.bookings to authenticated;
grant update (status) on public.bookings to authenticated;
grant execute on function public.get_public_posts() to authenticated;
grant execute on function public.get_post_comments(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.get_my_bookings() to authenticated;

alter table public.profiles
    add column avatar_path text,
    add constraint profiles_avatar_path_owner check (
        avatar_path is null or split_part(avatar_path, '/', 1) = id::text
    );

grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'profile-photos',
    'profile-photos',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view profile photos"
    on storage.objects for select to public
    using (bucket_id = 'profile-photos');

create policy "Users can upload their own profile photos"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Users can update their own profile photos"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Users can delete their own profile photos"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'profile-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop function public.get_public_posts();
create function public.get_public_posts()
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
    has_liked boolean,
    barber_avatar_path text
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
        ),
        b.avatar_path
    from public.posts p
    join public.profiles b on b.id = p.barber_id and b.role = 'barber'
    order by p.created_at desc
    limit 100;
$$;

drop function public.get_post_comments(uuid);
create function public.get_post_comments(p_post_id uuid)
returns table (
    id uuid,
    author_name text,
    body text,
    created_at timestamptz,
    author_avatar_path text
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, author.full_name, c.body, c.created_at, author.avatar_path
    from public.post_comments c
    join public.profiles author on author.id = c.author_id
    where c.post_id = p_post_id
      and exists (select 1 from public.posts p where p.id = p_post_id)
    order by c.created_at asc
    limit 100;
$$;

create function public.get_post_likes(p_post_id uuid)
returns table (
    profile_id uuid,
    profile_name text,
    avatar_path text,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select liker.id, liker.full_name, liker.avatar_path, l.created_at
    from public.post_likes l
    join public.profiles liker on liker.id = l.profile_id
    where l.post_id = p_post_id
      and exists (
          select 1
          from public.posts p
          where p.id = p_post_id and p.barber_id = (select auth.uid())
      )
    order by l.created_at desc
    limit 100;
$$;

revoke all on function public.get_public_posts() from public, anon, authenticated;
revoke all on function public.get_post_comments(uuid) from public, anon, authenticated;
revoke all on function public.get_post_likes(uuid) from public, anon, authenticated;
grant execute on function public.get_public_posts() to authenticated;
grant execute on function public.get_post_comments(uuid) to authenticated;
grant execute on function public.get_post_likes(uuid) to authenticated;

create table public.financial_entries (
    id uuid primary key default gen_random_uuid(),
    barber_id uuid not null references public.profiles (id) on delete cascade,
    type text not null check (type in ('income', 'expense')),
    description text not null check (char_length(trim(description)) between 1 and 120),
    category text not null check (char_length(trim(category)) between 1 and 60),
    amount numeric(10, 2) not null check (amount > 0),
    entry_date date not null default current_date,
    created_at timestamptz not null default now()
);

create index financial_entries_barber_date_idx
    on public.financial_entries (barber_id, entry_date desc, created_at desc);

alter table public.financial_entries enable row level security;

create policy "Barbers can manage their own financial entries"
    on public.financial_entries for all to authenticated
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

grant select, insert, delete on public.financial_entries to authenticated;

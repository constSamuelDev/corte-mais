alter table public.profiles
    add constraint profile_locations_barbers_only check (
        role = 'barber'
        or (location_latitude is null and location_longitude is null)
    );

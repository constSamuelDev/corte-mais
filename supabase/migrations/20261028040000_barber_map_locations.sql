alter table public.profiles
    add column location_latitude double precision,
    add column location_longitude double precision,
    add constraint barber_location_coordinates_valid check (
        (location_latitude is null and location_longitude is null)
        or (
            location_latitude is not null
            and location_longitude is not null
            and location_latitude between -90 and 90
            and location_longitude between -180 and 180
        )
    );

grant update (location_latitude, location_longitude) on public.profiles to authenticated;

notify pgrst, 'reload schema';

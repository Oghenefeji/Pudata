-- Non-destructive pudata profile and admin pricing additions.
-- This file does not modify Supabase Edge Functions or delete application data.

alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.product_costs (
  product_id text primary key references public.catalogue_products(id) on delete cascade,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  updated_at timestamptz not null default now()
);

alter table public.product_costs enable row level security;
drop policy if exists product_costs_admin_read on public.product_costs;
create policy product_costs_admin_read on public.product_costs for select using (public.is_admin());
drop policy if exists product_costs_admin_write on public.product_costs;
create policy product_costs_admin_write on public.product_costs for all using (public.is_admin()) with check (public.is_admin());

insert into public.product_costs(product_id, cost)
select id, pulseflow_cost from public.catalogue_products
on conflict (product_id) do nothing;

create or replace function public.sync_product_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.product_costs(product_id, cost, updated_at)
  values (new.id, coalesce(new.pulseflow_cost, 0), now())
  on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  return new;
end;
$$;

drop trigger if exists catalogue_products_sync_cost on public.catalogue_products;
create trigger catalogue_products_sync_cost
after insert or update of pulseflow_cost on public.catalogue_products
for each row execute function public.sync_product_cost();

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- pudata Supabase schema
-- Run once in a fresh Supabase SQL editor. Review all provider secrets separately.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('user', 'admin', 'support')),
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalogue_services (
  id text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists public.catalogue_categories (
  id text primary key,
  service_id text not null references public.catalogue_services(id) on delete cascade,
  name text not null,
  description text,
  discount_based boolean not null default false,
  logo text,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists public.catalogue_products (
  id text primary key,
  service_id text not null references public.catalogue_services(id) on delete cascade,
  category_id text references public.catalogue_categories(id) on delete set null,
  name text not null,
  description text,
  product_type text not null check (product_type in ('airtime','data','tv','education','data_card','recharge_card','electricity','other')),
  pulseflow_cost numeric(14,2) not null default 0 check (pulseflow_cost >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('service','category','product')),
  service_id text references public.catalogue_services(id) on delete cascade,
  category_id text references public.catalogue_categories(id) on delete cascade,
  product_id text references public.catalogue_products(id) on delete cascade,
  margin_type text not null check (margin_type in ('percentage','fixed')),
  margin_value numeric(14,2) not null check (margin_value >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((scope = 'service' and service_id is not null and category_id is null and product_id is null)
      or (scope = 'category' and category_id is not null and product_id is null)
      or (scope = 'product' and product_id is not null))
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  guest_email text,
  client_reference text not null unique,
  tx_ref text unique,
  pulseflow_ref text,
  product_id text references public.catalogue_products(id) on delete set null,
  service_type text not null,
  status text not null default 'pending' check (status in ('pending','success','failed','reversed','refund_pending','refunded')),
  amount numeric(14,2) not null check (amount >= 0),
  cost_amount numeric(14,2) not null default 0 check (cost_amount >= 0),
  margin_amount numeric(14,2) not null default 0,
  currency text not null default 'NGN' check (currency = 'NGN'),
  payment_provider text check (payment_provider in ('wallet','flutterwave')),
  payment_tx_ref text unique,
  customer_phone text,
  customer_identifier text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  pin_payload jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or guest_email is not null)
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  entry_type text not null check (entry_type in ('credit','debit','reversal')),
  amount numeric(14,2) not null check (amount > 0),
  balance_after numeric(14,2) not null check (balance_after >= 0),
  note text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid references public.profiles(id) on delete set null,
  code text not null unique,
  reward_amount numeric(14,2) not null default 0 check (reward_amount >= 0),
  status text not null default 'active' check (status in ('active','earned','paid','disabled')),
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  active boolean not null default true,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.support_settings (
  id boolean primary key default true check (id = true),
  whatsapp_url text,
  support_email text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_created on public.transactions(user_id, created_at desc);
create index if not exists idx_transactions_status_created on public.transactions(status, created_at desc);
create index if not exists idx_transactions_guest_lookup on public.transactions(guest_email, client_reference);
create index if not exists idx_products_service_category on public.catalogue_products(service_id, category_id, active);
create index if not exists idx_ledger_user_created on public.wallet_ledger(user_id, created_at desc);
create unique index if not exists idx_pricing_scope_product on public.pricing_rules(scope, coalesce(product_id, ''), coalesce(category_id, ''), coalesce(service_id, '')) where active;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at before update on public.wallets for each row execute function public.set_updated_at();
drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','support') and suspended = false
  );
$$;

create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_note text default null,
  p_idempotency_key text default null,
  p_transaction_id uuid default null
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'credit amount must be positive'; end if;
  insert into public.wallets(user_id, balance) values (p_user_id, 0) on conflict (user_id) do nothing;
  select balance into v_balance from public.wallets where user_id = p_user_id for update;
  update public.wallets set balance = balance + p_amount, updated_at = now() where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger(user_id, transaction_id, entry_type, amount, balance_after, note, idempotency_key)
  values (p_user_id, p_transaction_id, 'credit', p_amount, v_balance, p_note, p_idempotency_key)
  on conflict (idempotency_key) do nothing;
  return v_balance;
end;
$$;

create or replace function public.debit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_note text default null,
  p_idempotency_key text default null,
  p_transaction_id uuid default null
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'debit amount must be positive'; end if;
  insert into public.wallets(user_id, balance) values (p_user_id, 0) on conflict (user_id) do nothing;
  select balance into v_balance from public.wallets where user_id = p_user_id for update;
  if v_balance < p_amount then raise exception 'insufficient wallet balance'; end if;
  update public.wallets set balance = balance - p_amount, updated_at = now() where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger(user_id, transaction_id, entry_type, amount, balance_after, note, idempotency_key)
  values (p_user_id, p_transaction_id, 'debit', p_amount, v_balance, p_note, p_idempotency_key)
  on conflict (idempotency_key) do nothing;
  return v_balance;
end;
$$;

revoke all on function public.credit_wallet(uuid,numeric,text,text,uuid) from public;
revoke all on function public.debit_wallet(uuid,numeric,text,text,uuid) from public;
grant execute on function public.credit_wallet(uuid,numeric,text,text,uuid) to service_role;
grant execute on function public.debit_wallet(uuid,numeric,text,text,uuid) to service_role;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.catalogue_services enable row level security;
alter table public.catalogue_categories enable row level security;
alter table public.catalogue_products enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.referrals enable row level security;
alter table public.announcements enable row level security;
alter table public.support_settings enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (id = auth.uid() and role = 'user') with check (id = auth.uid() and role = 'user');
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists wallets_admin_all on public.wallets;
create policy wallets_admin_all on public.wallets for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists catalogue_services_public_read on public.catalogue_services;
create policy catalogue_services_public_read on public.catalogue_services for select using (active = true or public.is_admin());
drop policy if exists catalogue_services_admin_write on public.catalogue_services;
create policy catalogue_services_admin_write on public.catalogue_services for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists catalogue_categories_public_read on public.catalogue_categories;
create policy catalogue_categories_public_read on public.catalogue_categories for select using (active = true or public.is_admin());
drop policy if exists catalogue_categories_admin_write on public.catalogue_categories;
create policy catalogue_categories_admin_write on public.catalogue_categories for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists catalogue_products_public_read on public.catalogue_products;
create policy catalogue_products_public_read on public.catalogue_products for select using (active = true or public.is_admin());
drop policy if exists catalogue_products_admin_write on public.catalogue_products;
create policy catalogue_products_admin_write on public.catalogue_products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists pricing_public_read on public.pricing_rules;
create policy pricing_public_read on public.pricing_rules for select using (active = true or public.is_admin());
drop policy if exists pricing_admin_write on public.pricing_rules;
create policy pricing_admin_write on public.pricing_rules for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists transactions_admin_write on public.transactions;
create policy transactions_admin_write on public.transactions for all using (public.is_admin()) with check (public.is_admin());

-- Guest receipts are intentionally not readable through a public table policy.
-- The guest-receipt Edge Function verifies reference + email using service_role.

drop policy if exists ledger_select_own on public.wallet_ledger;
create policy ledger_select_own on public.wallet_ledger for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists ledger_admin_write on public.wallet_ledger;
create policy ledger_admin_write on public.wallet_ledger for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals for select using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());
drop policy if exists referrals_insert_own on public.referrals;
create policy referrals_insert_own on public.referrals for insert with check (referrer_id = auth.uid());
drop policy if exists referrals_admin_all on public.referrals;
create policy referrals_admin_all on public.referrals for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements for select using (active = true or public.is_admin());
drop policy if exists announcements_admin_write on public.announcements;
create policy announcements_admin_write on public.announcements for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists support_public_read on public.support_settings;
create policy support_public_read on public.support_settings for select using (true);
drop policy if exists support_admin_write on public.support_settings;
create policy support_admin_write on public.support_settings for all using (public.is_admin()) with check (public.is_admin());

-- Admin setup: after creating your account, run the following with your real auth user id.
-- update public.profiles set role = 'admin' where id = 'YOUR_AUTH_USER_UUID';
-- Never grant admin by setting a client-side flag.

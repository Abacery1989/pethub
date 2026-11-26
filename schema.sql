create extension if not exists pgcrypto;

create table if not exists public.admins (email text primary key);
insert into public.admins(email) values ('ahmed.abacery99@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email','')));
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null, sort int default 0
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null, description text default '',
  price numeric(10,2) not null check (price >= 0),
  compare_at_price numeric(10,2),
  image_url text, stock int not null default 0 check (stock >= 0),
  active boolean not null default true, is_sample boolean not null default false,
  created_at timestamptz default now()
);
create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null check (kind in ('percent','fixed')),
  value numeric(10,2) not null check (value > 0),
  min_subtotal numeric(10,2) not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  note text default ''
);
create table if not exists public.delivery_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null, fee numeric(10,2) not null default 0, active boolean not null default true, sort int default 0
);
create table if not exists public.settings (key text primary key, value text not null default '');
create sequence if not exists public.order_seq start 1001;
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  customer_name text not null, phone text not null, email text,
  address text not null, city text not null, notes text default '',
  delivery_method text not null, delivery_fee numeric(10,2) not null default 0,
  payment_method text not null,
  subtotal numeric(10,2) not null, discount_code text, discount_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  status text not null default 'new' check (status in ('new','confirmed','shipped','delivered','cancelled')),
  created_at timestamptz default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null, price numeric(10,2) not null, qty int not null check (qty > 0)
);

alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.discounts enable row level security;
alter table public.delivery_methods enable row level security;
alter table public.settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy cat_read on public.categories for select using (true);
create policy cat_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy prod_read on public.products for select using (active or public.is_admin());
create policy prod_admin on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy disc_admin on public.discounts for all using (public.is_admin()) with check (public.is_admin());
create policy dm_read on public.delivery_methods for select using (active or public.is_admin());
create policy dm_admin on public.delivery_methods for all using (public.is_admin()) with check (public.is_admin());
create policy set_read on public.settings for select using (true);
create policy set_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());
create policy ord_admin on public.orders for all using (public.is_admin()) with check (public.is_admin());
create policy oi_admin on public.order_items for all using (public.is_admin()) with check (public.is_admin());
create policy adm_admin on public.admins for select using (public.is_admin());

create or replace function public.calc_discount(p_code text, p_subtotal numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare d public.discounts; amt numeric := 0;
begin
  if p_code is null or length(trim(p_code)) = 0 then return 0; end if;
  select * into d from public.discounts where lower(code) = lower(trim(p_code)) and active
    and (expires_at is null or expires_at > now()) limit 1;
  if not found or p_subtotal < d.min_subtotal then return -1; end if;
  if d.kind = 'percent' then amt := round(p_subtotal * least(d.value,100) / 100, 2);
  else amt := least(d.value, p_subtotal); end if;
  return amt;
end $$;

create or replace function public.check_discount(p_code text, p_subtotal numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select public.calc_discount(p_code, p_subtotal);
$$;

create or replace function public.place_order(
  p_name text, p_phone text, p_email text, p_address text, p_city text, p_notes text,
  p_delivery_id uuid, p_payment text, p_code text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it jsonb; pr public.products; q int; sub numeric := 0; v_fee numeric; v_dname text;
  disc numeric := 0; tot numeric; oid uuid := gen_random_uuid(); ono text;
begin
  if coalesce(trim(p_name),'')='' or coalesce(trim(p_phone),'')='' or coalesce(trim(p_address),'')='' or coalesce(trim(p_city),'')='' then
    raise exception 'بيانات العميل ناقصة';
  end if;
  if p_payment not in ('cod','bank_transfer') then raise exception 'طريقة الدفع غير متاحة'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'السلة فاضية'; end if;
  select dm.name, dm.fee into v_dname, v_fee from public.delivery_methods dm where dm.id = p_delivery_id and dm.active;
  if v_dname is null then raise exception 'طريقة التوصيل غير متاحة'; end if;
  ono := 'ORD-' || nextval('public.order_seq');
  insert into public.orders(id, order_no, customer_name, phone, email, address, city, notes, delivery_method, delivery_fee, payment_method, subtotal, total)
    values (oid, ono, trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email,'')),''), trim(p_address), trim(p_city), coalesce(p_notes,''), v_dname, v_fee, p_payment, 0, 0);
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'qty')::int;
    if q is null or q < 1 or q > 99 then raise exception 'كمية غير صحيحة'; end if;
    select * into pr from public.products where id = (it->>'id')::uuid and active for update;
    if not found then raise exception 'منتج غير متاح'; end if;
    if pr.stock < q then raise exception 'الكمية المطلوبة من "%" غير متوفرة (المتاح %)', pr.name, pr.stock; end if;
    update public.products set stock = stock - q where id = pr.id;
    insert into public.order_items(order_id, product_id, name, price, qty) values (oid, pr.id, pr.name, pr.price, q);
    sub := sub + pr.price * q;
  end loop;
  disc := public.calc_discount(p_code, sub);
  if disc < 0 then raise exception 'كود الخصم غير صالح'; end if;
  tot := sub - disc + v_fee;
  update public.orders set subtotal = sub, discount_code = nullif(trim(coalesce(p_code,'')),''), discount_amount = disc, total = tot where id = oid;
  return jsonb_build_object('order_no', ono, 'subtotal', sub, 'discount', disc, 'delivery_fee', v_fee, 'total', tot, 'payment', p_payment, 'status', 'new');
end $$;

create or replace function public.track_order(p_order_no text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('order_no', order_no, 'status', status, 'total', total, 'created_at', created_at)
  from public.orders where upper(order_no) = upper(trim(p_order_no)) and right(regexp_replace(phone,'\D','','g'),8) = right(regexp_replace(p_phone,'\D','','g'),8) limit 1;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.delivery_methods, public.settings to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.check_discount(text, numeric), public.place_order(text,text,text,text,text,text,uuid,text,text,jsonb), public.track_order(text,text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant usage on sequence public.order_seq to authenticated;
revoke execute on function public.calc_discount(text, numeric) from public, anon, authenticated;

insert into storage.buckets (id, name, public) values ('product-images','product-images', true) on conflict (id) do nothing;
create policy "img_public_read" on storage.objects for select using (bucket_id = 'product-images');
create policy "img_admin_insert" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_admin());
create policy "img_admin_update" on storage.objects for update using (bucket_id = 'product-images' and public.is_admin());
create policy "img_admin_delete" on storage.objects for delete using (bucket_id = 'product-images' and public.is_admin());

insert into public.settings(key,value) values
 ('store_name','متجري (اسم تجريبي)'),
 ('whatsapp','201025820071'),
 ('bank_info','بيانات التحويل البنكي: (اكتبها من لوحة التحكم)'),
 ('contact_email','ahmed.abacery99@gmail.com'),
 ('address','القاهرة، مصر (عنوان تجريبي)') on conflict do nothing;
insert into public.delivery_methods(name,fee,sort) values ('توصيل داخل القاهرة والجيزة',50,1),('توصيل لباقي المحافظات',80,2),('استلام من المتجر',0,3);
insert into public.categories(name,slug,sort) values ('إلكترونيات','electronics',1),('منزل ومطبخ','home',2),('إكسسوارات','accessories',3);
insert into public.products(category_id,name,description,price,compare_at_price,stock,is_sample)
select c.id, v.name, v.descr, v.price, v.cmp, v.stock, true from (values
 ('electronics','سماعة بلوتوث (عينة)','منتج تجريبي. اكتب وصف المنتج الحقيقي من لوحة التحكم.',450,550,15),
 ('electronics','شاحن سريع (عينة)','منتج تجريبي لتجربة المتجر.',220,null,30),
 ('electronics','باور بانك (عينة)','منتج تجريبي لتجربة المتجر.',600,700,8),
 ('home','طقم أكواب (عينة)','منتج تجريبي لتجربة المتجر.',180,null,20),
 ('home','حافظة طعام (عينة)','منتج تجريبي لتجربة المتجر.',130,160,0),
 ('home','مفرش طاولة (عينة)','منتج تجريبي لتجربة المتجر.',250,null,12),
 ('accessories','حقيبة يد (عينة)','منتج تجريبي لتجربة المتجر.',520,650,6),
 ('accessories','ساعة يد (عينة)','منتج تجريبي لتجربة المتجر.',890,null,5)
) as v(cat,name,descr,price,cmp,stock) join public.categories c on c.slug = v.cat;
insert into public.discounts(code,kind,value,min_subtotal,note) values ('SAMPLE10','percent',10,200,'كود تجريبي: خصم 10% للطلبات فوق 200 ج.م');

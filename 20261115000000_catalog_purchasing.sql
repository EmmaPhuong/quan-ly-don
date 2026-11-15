-- =====================================================================
-- Bước 2: nhóm hàng + thuộc tính, mua hàng/trả NCC, phương thức thu và mã giao dịch ngân hàng.
-- Chạy SAU 20261114000000_init.sql, một lần, trong SQL Editor của Supabase.
-- =====================================================================

-- ---------- Nhóm hàng và thuộc tính (dữ liệu gốc) ----------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default '',
  sort        integer not null default 0
);
create table public.attributes (          -- thương hiệu, chất liệu, màu, đơn vị tính
  id   uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('brand', 'material', 'color', 'unit')),
  name text not null check (btrim(name) <> ''),
  note text not null default '',
  unique (kind, name)
);

alter table public.products
  add column category_id uuid references public.categories(id),
  add column brand_id    uuid references public.attributes(id),
  add column material_id uuid references public.attributes(id),
  add column description text not null default '';
alter table public.items
  add column category_id uuid references public.categories(id),   -- dùng cho phụ kiện; tấm lấy nhóm từ tên hàng
  add column description text not null default '';
alter table public.customers
  add column customer_group text not null default 'le' check (customer_group in ('le', 'si', 'vip'));
alter table public.suppliers
  add column payment_terms text not null default '';

-- Dữ liệu ban đầu: 4 nhóm hàng, màu và đơn vị lấy từ dữ liệu đang có
insert into public.categories (name, description, sort) values
  ('Tấm nhựa đặc ruột', 'Tấm lấy sáng đặc, cắt theo khổ và chiều dài', 1),
  ('Tấm nhựa rỗng ruột', 'Tấm lấy sáng rỗng ruột, nhẹ, cách nhiệt', 2),
  ('Tấm sóng nhựa', 'Tấm lợp lấy sáng dạng sóng', 3),
  ('Phụ kiện khác', 'Nẹp, vít, keo và phụ kiện đi kèm', 4);
insert into public.attributes (kind, name)
  select 'color', c from (select distinct unnest(colors) as c from public.products) x where btrim(c) <> ''
  on conflict do nothing;
insert into public.attributes (kind, name)
  select 'unit', u from (select distinct unit as u from public.items where unit is not null) x
  on conflict do nothing;
insert into public.attributes (kind, name) values ('unit', 'm²') on conflict do nothing;
update public.products p set category_id = (select id from public.categories where name = case p.code
    when 'PCD' then 'Tấm nhựa đặc ruột' when 'PCR' then 'Tấm nhựa rỗng ruột' when 'SONG' then 'Tấm sóng nhựa' end)
  where p.code in ('PCD', 'PCR', 'SONG');
update public.items set category_id = (select id from public.categories where name = 'Phụ kiện khác') where kind = 'pk';

-- ---------- Phương thức thu và mã giao dịch ngân hàng ----------
-- Mã giao dịch: ưu tiên "Ma GD ACSP/ ug336044" trong nội dung, không có thì lấy mã tham chiếu SePay.
create function public.bank_ref_of(p_content text, p_ref text) returns text
language sql immutable set search_path = public as $$
  select coalesce(substring(coalesce(p_content, '') from '(?i)ACSP/\s*([A-Za-z0-9]+)'), nullif(btrim(coalesce(p_ref, '')), ''), '')
$$;
grant execute on function public.bank_ref_of(text, text) to authenticated, service_role;

alter table public.bank_transactions add column bank_ref text not null default '';
update public.bank_transactions set bank_ref = public.bank_ref_of(content, reference_code);

alter table public.payments drop constraint payments_source_check;
alter table public.payments add constraint payments_source_check check (source in ('manual', 'sepay', 'credit', 'ncc'));
alter table public.payments
  add column method text not null default 'bank' check (method in ('cash', 'bank', 'ncc', 'credit')),
  add column bank_ref text not null default '',
  add column supplier_payment_id uuid;
update public.payments set method = 'cash'   where note ilike 'Tiền mặt%';
update public.payments set method = 'credit' where source = 'credit';
update public.payments p set bank_ref = b.bank_ref from public.bank_transactions b where b.id = p.bank_tx_id;

-- ---------- Mua hàng: tiền trả nhà cung cấp ----------
-- own: bạn tự chuyển/trả NCC. customer_direct: khách chuyển thẳng cho NCC (tự ghi thành khoản khách đã trả vào đơn).
create table public.supplier_payments (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  paid_on     date not null default public.vn_today(),
  amount      bigint not null check (amount > 0),
  method      text not null check (method in ('own', 'customer_direct')),
  fund        text not null default 'bank' check (fund in ('bank', 'cash')),
  order_id    uuid references public.orders(id),
  bank_ref    text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  check (method <> 'customer_direct' or order_id is not null)
);
create index supplier_payments_supplier on public.supplier_payments (supplier_id);
create index supplier_payments_order on public.supplier_payments (order_id);
alter table public.payments
  add constraint payments_supplier_payment_fk foreign key (supplier_payment_id)
  references public.supplier_payments(id) on delete cascade;

-- Khách trả thẳng NCC: tự ghi khoản thu vào đơn (cùng quy tắc tạm ứng/thanh toán như tiền về qua SePay)
create function public.supplier_payments_after_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_adv boolean; v_name text;
begin
  if new.method = 'customer_direct' then
    select name into v_name from suppliers where id = new.supplier_id;
    select exists (select 1 from payments where order_id = new.order_id and kind = 'adv') into v_adv;
    insert into payments (order_id, kind, amount, paid_on, source, method, bank_ref, supplier_payment_id, note)
    values (new.order_id, case when v_adv then 'pay' else 'adv' end, new.amount, new.paid_on, 'ncc', 'ncc',
            new.bank_ref, new.id, 'Khách trả thẳng NCC ' || coalesce(v_name, ''));
  end if;
  return new;
end $$;
create trigger supplier_payments_ai after insert on public.supplier_payments
  for each row execute function public.supplier_payments_after_ins();

create function public.supplier_payments_after_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update payments set paid_on = new.paid_on, bank_ref = new.bank_ref where supplier_payment_id = new.id;
  return new;
end $$;
create trigger supplier_payments_au after update on public.supplier_payments
  for each row execute function public.supplier_payments_after_upd();
create trigger audit_supplier_payments after insert or update or delete on public.supplier_payments
  for each row execute function public.audit_row();

-- ---------- Ghép giao dịch: ghi thêm phương thức và mã giao dịch ----------
create or replace function public.apply_bank_tx(p_tx uuid, p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tx bank_transactions; o orders; v_total bigint; v_paid bigint;
        v_applied bigint; v_excess bigint; has_adv boolean;
begin
  select * into tx from bank_transactions where id = p_tx for update;
  if not found then raise exception 'Không tìm thấy giao dịch'; end if;
  if tx.status <> 'unmatched' then raise exception 'Giao dịch đã được xử lý'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  select total, paid into v_total, v_paid from order_totals where order_id = p_order;
  if v_total > 0 then v_applied := least(tx.amount, greatest(v_total - v_paid, 0));
  else v_applied := tx.amount; end if;
  v_excess := tx.amount - v_applied;
  select exists (select 1 from payments where order_id = p_order and kind = 'adv') into has_adv;
  if v_applied > 0 then
    insert into payments (order_id, kind, amount, paid_on, source, method, bank_tx_id, bank_ref, note)
    values (p_order, case when has_adv then 'pay' else 'adv' end, v_applied,
            coalesce((tx.transaction_date at time zone 'Asia/Ho_Chi_Minh')::date, vn_today()),
            'sepay', 'bank', p_tx, tx.bank_ref, 'Chuyển khoản ' || o.pay_code);
  end if;
  if v_excess > 0 then
    insert into customer_ledger (customer_id, amount, order_id, bank_tx_id, note)
    values (o.customer_id, v_excess, p_order, p_tx, 'Khách chuyển dư, đơn ' || o.pay_code);
  end if;
  update bank_transactions set status = 'matched', order_id = p_order, applied = v_applied, excess = v_excess
  where id = p_tx;
  return jsonb_build_object('result', 'matched', 'order_no', o.no, 'applied', v_applied, 'excess', v_excess);
end $$;

create or replace function public.process_sepay_tx(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint; tx_id uuid; v_acct text; mine text; m text; o_id uuid;
begin
  v_id := nullif(p->>'id', '')::bigint;
  if v_id is null then raise exception 'Thiếu id giao dịch'; end if;
  insert into bank_transactions (sepay_id, transaction_date, account_number, transfer_type,
                                 amount, content, reference_code, bank_ref, raw, status)
  values (v_id,
          nullif(p->>'transactionDate', '')::timestamp at time zone 'Asia/Ho_Chi_Minh',
          p->>'accountNumber', p->>'transferType',
          greatest(coalesce(nullif(p->>'transferAmount', '')::bigint, 1), 1),
          coalesce(p->>'content', ''), p->>'referenceCode',
          bank_ref_of(p->>'content', p->>'referenceCode'), p, 'unmatched')
  on conflict (sepay_id) do nothing
  returning id into tx_id;
  if tx_id is null then return jsonb_build_object('result', 'duplicate'); end if;

  if coalesce(p->>'transferType', '') <> 'in' then
    update bank_transactions set status = 'ignored', note = 'Tiền ra' where id = tx_id;
    return jsonb_build_object('result', 'ignored', 'reason', 'not_in');
  end if;
  v_acct := regexp_replace(coalesce(p->>'accountNumber', ''), '\D', '', 'g');
  select regexp_replace(bank_account, '\D', '', 'g') into mine from settings where id;
  if mine <> '' and v_acct <> mine then
    update bank_transactions set status = 'ignored', note = 'Sai tài khoản nhận' where id = tx_id;
    return jsonb_build_object('result', 'ignored', 'reason', 'wrong_account');
  end if;

  for m in select x[1] from regexp_matches(coalesce(p->>'content', ''), '(?<!\d)(\d{7})(?!\d)', 'g') as x loop
    select id into o_id from orders where pay_code = m;
    exit when o_id is not null;
  end loop;
  if o_id is null then
    return jsonb_build_object('result', 'unmatched');
  end if;
  return apply_bank_tx(tx_id, o_id);
end $$;

-- ---------- Quyền truy cập ----------
alter table public.categories        enable row level security;
alter table public.attributes        enable row level security;
alter table public.supplier_payments enable row level security;

grant select, insert, update, delete on public.categories, public.attributes to authenticated;
grant select, insert, delete on public.supplier_payments to authenticated;
grant update (paid_on, fund, bank_ref, note) on public.supplier_payments to authenticated;

do $$
declare t text;
begin
  foreach t in array array['categories', 'attributes']
  loop
    execute format('create policy owner_access on public.%I for select to authenticated using (public.is_owner())', t);
    execute format('create policy owner_write on public.%I for insert to authenticated with check (public.is_owner())', t);
    execute format('create policy owner_update on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (public.is_owner())', t);
  end loop;
end $$;
create policy owner_access on public.supplier_payments for select to authenticated using (public.is_owner());
create policy owner_write  on public.supplier_payments for insert to authenticated with check (public.is_owner());
create policy owner_update on public.supplier_payments for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_delete on public.supplier_payments for delete to authenticated using (public.is_owner());

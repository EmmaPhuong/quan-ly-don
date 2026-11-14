const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const nz=v=>Number(v)||0;
const money=n=>Math.round(n).toLocaleString('vi-VN')+'đ';
const dec=n=>(+n).toLocaleString('vi-VN',{maximumFractionDigits:2});
const dmy=d=>d.split('-').reverse().join('/');
const ym=d=>d.slice(0,7);
const mlabel=m=>'Tháng '+m.slice(5)+'/'+m.slice(0,4);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,8);
const clone=o=>JSON.parse(JSON.stringify(o));
const sum=(arr,k)=>arr.reduce((a,x)=>a+x[k],0);
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
/* ================= Kết nối Supabase ================= */
const SUPA_URL='https://agsisjudzprrxrnlrajh.supabase.co';
const SUPA_KEY='sb_publishable_tt36dKXHkIeES_DZzLtACA_zYooxvVJ'; // khóa công khai, an toàn: dữ liệu được bảo vệ bằng đăng nhập + RLS
const sb=window.supabase.createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const vnToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
let TODAY=vnToday();
const ST={nhap:'Nháp',da_chot:'Đã chốt',da_giao:'Đã giao',hoan_thanh:'Hoàn thành'};
const STC=Object.fromEntries(Object.entries(ST).map(([k,v])=>[v,k]));
/* gọi Supabase: lỗi thì ném ra để bắt một chỗ */
async function Q(p){const r=await p;if(r.error)throw r.error;return r.data}
function errText(e){
  const m=(e&&e.message)||String(e);
  if(e&&e.code==='23503')return 'Đã có dữ liệu khác đang dùng mục này, không xóa được';
  if(e&&e.code==='23505')return 'Bị trùng với mục đã có';
  if(/permission denied|row-level security/i.test(m))return 'Không có quyền thực hiện thao tác này';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m))return 'Mất kết nối mạng, thử lại sau';
  return m;
}
async function fetchAll(table,key='id',cols='*'){
  const out=[];
  for(let from=0;;from+=1000){
    const d=await Q(sb.from(table).select(cols).order(key).range(from,from+999));
    out.push(...d);if(d.length<1000)break;
  }
  return out;
}

/* ================= Dữ liệu trong bộ nhớ (đọc từ Supabase) ================= */
const DB={settings:{shop:'',markup:30000,advPct:30,bin:'970422',acc:'',accName:''},customers:[],suppliers:[],brokers:[],widths:[],tam:[],pk:[],items:[],costs:{},orders:[],balance:{},txs:[]};
let ITEM={},ITEMKEY={},ITEMS={};
const BANKS={'970436':'Vietcombank','970422':'MB','970415':'VietinBank','970407':'Techcombank','970418':'BIDV'};
async function loadAll(){
  const st=await Q(sb.from('settings').select('*').maybeSingle());
  if(!st)throw new Error('NOT_OWNER');
  const [cu,su,br,wi,pr,it,cp,od,ol,pa,bal,tx]=await Promise.all([
    fetchAll('customers'),fetchAll('suppliers'),fetchAll('brokers'),fetchAll('widths','value'),fetchAll('products'),
    fetchAll('items'),fetchAll('cost_prices'),fetchAll('orders'),fetchAll('order_lines'),fetchAll('payments'),
    fetchAll('customer_balances','customer_id'),
    Q(sb.from('bank_transactions').select('id,sepay_id,transaction_date,amount,content,status,order_id,applied,excess,note,created_at').order('created_at',{ascending:false}).limit(300))
  ]);
  DB.settings={shop:st.shop_name,markup:+st.markup,advPct:+st.advance_pct,bin:st.bank_bin,acc:st.bank_account,accName:st.bank_account_name};
  DB.customers=cu.map(c=>({id:c.id,code:c.code,name:c.name,phone:c.phone,address:c.address,note:c.note})).sort((a,b)=>a.code.localeCompare(b.code));
  DB.suppliers=su.map(s=>({id:s.id,name:s.name,phone:s.phone,note:s.note})).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  DB.brokers=br.map(b=>({id:b.id,name:b.name,phone:b.phone,pct:+b.pct})).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  DB.widths=wi.map(w=>+w.value).sort((a,b)=>a-b);
  DB.tam=pr.map(p=>({id:p.id,code:p.code,name:p.name,colors:p.colors||[],lys:[]})).sort((a,b)=>a.code.localeCompare(b.code));
  DB.pk=[];DB.items=it.slice().sort((a,b)=>a.stt-b.stt);ITEM={};ITEMKEY={};ITEMS={};
  DB.items.forEach(i=>{
    ITEMS[i.id]=i;let key;
    if(i.kind==='tam'){key=i.product_id+'|'+(+i.ly);const t=DB.tam.find(x=>x.id===i.product_id);if(t)t.lys.push(+i.ly)}
    else{key=i.id;DB.pk.push({id:i.id,code:i.code,name:i.name,unit:i.unit})}
    ITEM[key]=i.id;ITEMKEY[i.id]=key;
  });
  DB.tam.forEach(t=>t.lys.sort((a,b)=>a-b));
  DB.costs={};
  cp.slice().sort((a,b)=>a.effective_date<b.effective_date?-1:a.effective_date>b.effective_date?1:0).forEach(c=>{
    const k=ITEMKEY[c.item_id];if(!k)return;
    const m=DB.costs[k]=DB.costs[k]||{};(m[c.supplier_id]=m[c.supplier_id]||[]).push({d:c.effective_date,p:+c.price});
  });
  const byOrder=(rows)=>{const m={};rows.forEach(r=>(m[r.order_id]=m[r.order_id]||[]).push(r));return m};
  const L=byOrder(ol),P=byOrder(pa);
  DB.orders=od.map(o=>({
    id:o.id,type:o.doc_type,no:o.no,date:o.order_date,status:ST[o.status],cust:o.customer_id,
    lines:(L[o.id]||[]).slice().sort((a,b)=>a.position-b.position).map(mapLine),
    discType:o.discount_type,discVal:+o.discount_value,ship:+o.ship_fee,shipCost:+o.ship_cost,
    broker:o.broker_id||'',brokerPct:+o.broker_pct,advance:+o.advance_expected,advManual:o.advance_manual,
    pays:(P[o.id]||[]).slice().sort((a,b)=>a.created_at<b.created_at?-1:1).map(p=>({id:p.id,d:p.paid_on,amt:+p.amount,kind:p.kind,note:p.note,source:p.source})),
    note:o.note
  }));
  DB.balance={};bal.forEach(b=>{DB.balance[b.customer_id]=+b.balance});
  DB.txs=tx;
}
function mapLine(l){
  const it=ITEMS[l.item_id]||{};
  const base={id:l.id,sup:l.supplier_id||'',pin:l.cost_price==null?null:+l.cost_price,pout:+l.sell_price,manual:true};
  if(it.kind==='tam')return Object.assign(base,{k:'tam',pid:it.product_id,color:l.color||'',ly:+it.ly,w:+l.width,dai:+l.length,n:+l.sheets});
  return Object.assign(base,{k:'pk',aid:it.id,qty:+l.quantity});
}
/* các lệnh ghi cho một dòng đơn */
function lineRow(l,i,orderId){
  const r={order_id:orderId,position:i,item_id:ITEM[keyOf(l)],supplier_id:l.sup||null,cost_price:l.pin==null?null:Math.round(l.pin),sell_price:Math.round(nz(l.pout))};
  if(l.k==='tam')Object.assign(r,{color:l.color,width:l.w,length:l.dai,sheets:Math.round(l.n)});
  else r.quantity=l.qty;
  return r;
}
const orderRow=o=>({customer_id:o.cust,order_date:o.date,doc_type:o.type,discount_type:o.discType,discount_value:nz(o.discVal),
  ship_fee:Math.round(nz(o.ship)),ship_cost:Math.round(nz(o.shipCost)),broker_id:o.broker||null,broker_pct:nz(o.brokerPct),
  advance_expected:Math.round(nz(o.advance)),advance_manual:!!o.advManual,note:o.note||''});
const STATS=['Nháp','Đã chốt','Đã giao','Hoàn thành'];
const STAT_CLASS={'Nháp':'','Đã chốt':'acc','Đã giao':'acc','Hoàn thành':'good'};

/* ================= Tra cứu, tính toán ================= */
const tamOf=id=>DB.tam.find(t=>t.id===id), pkOf=id=>DB.pk.find(a=>a.id===id);
const custOf=id=>DB.customers.find(c=>c.id===id), supName=id=>(DB.suppliers.find(s=>s.id===id)||{name:'?'}).name;
const brokerOf=id=>DB.brokers.find(b=>b.id===id);
const keyOf=o=>o.k==='tam'?o.pid+'|'+o.ly:o.aid;
const maTam=(pid,ly)=>tamOf(pid).code+'-'+Math.round(ly*10);
const maOf=l=>l.k==='tam'?maTam(l.pid,l.ly):pkOf(l.aid).code;
const lineName=l=>l.k==='tam'?tamOf(l.pid).name:pkOf(l.aid).name;
const lineQty=l=>l.k==='tam'?Math.round(nz(l.w)*nz(l.dai)*nz(l.n)*1e6)/1e6:nz(l.qty);
const unitOf=l=>l.k==='tam'?'m²':pkOf(l.aid).unit;
const lastOf=h=>h[h.length-1];
function costAt(key,sup,date){
  const h=(DB.costs[key]||{})[sup]; if(!h||!h.length)return null;
  let p=null; h.forEach(x=>{if(x.d<=date)p=x.p}); return p;
}
const costNow=(key,sup)=>costAt(key,sup,TODAY);
function cheapestSup(key){
  const m=DB.costs[key]||{};let best=null;
  Object.keys(m).forEach(id=>{if(!best||lastOf(m[id]).p<lastOf(m[best]).p)best=id});
  return best||(DB.suppliers[0]||{}).id||'';
}
const roundAdv=v=>Math.floor(v/500000+1e-9)*500000;
/* Nội dung chuyển khoản = mã khách (3 số) + 4 số cuối của số phiếu + "chuyen tien". Mã 7 số này không được trùng giữa các đơn. */
const payCode=o=>o.no.slice(4);
const payNote=o=>payCode(o)+' chuyen tien';
const oLabel=o=>o.no;
function oCalc(o){
  let goods=0,cost=0,gross=0;
  o.lines.forEach(l=>{const q=lineQty(l);goods+=Math.round(q*nz(l.pout));if(l.pin!=null){cost+=Math.round(q*l.pin);gross+=Math.round(q*(nz(l.pout)-l.pin));}});
  let disc=o.discType==='pct'?Math.round(goods*nz(o.discVal)/100):nz(o.discVal);
  disc=Math.min(Math.max(disc,0),goods);
  const net=goods-disc, ship=nz(o.ship), shipCost=nz(o.shipCost), total=net+ship;
  const comm=o.broker?Math.round(Math.max(0,gross)*nz(o.brokerPct)/100):0;
  const paid=o.pays.reduce((a,p)=>a+p.amt,0);
  const advPaid=o.pays.filter(p=>p.kind==='adv').reduce((a,p)=>a+p.amt,0);
  const advEff=advPaid>0?advPaid:nz(o.advance);
  const bal=total-advEff-(paid-advPaid);
  return {goods,disc,net,ship,shipCost,total,cost,gross,comm,paid,remain:total-paid,advPaid,advEff,advDue:advPaid>0?0:nz(o.advance),bal,profit:total-cost-shipCost-comm};
}
function repOrders(month){return DB.orders.filter(o=>o.type==='DH'&&o.status!=='Nháp'&&(!month||ym(o.date)===month))}

/* ================= Trạng thái giao diện ================= */
let view='tongquan', ED=null, EDnew=false, OUT='khach';
const D={k:'tam',pid:'pcd',color:'Trong suốt',ly:2,w:1.22,dai:6,n:4,aid:'nep',qty:10};
const F={cust:'',stat:''}, PR={month:'',tab:'thang'}, CR={edit:null,sel:{}}, DASH={month:ym(TODAY)};
const PM={tab:'bang',q:'',kind:'',sup:''}, PXH={}, PME={}, PMA={};
const VIEWS=[['tongquan','Tổng quan'],['don','Đơn hàng'],['khach','Khách hàng'],['mahang','Mã hàng'],['ncc','Nhà cung cấp'],['moigioi','Môi giới'],['loinhuan','Lợi nhuận'],['giaodich','Giao dịch'],['caidat','Cài đặt']];

function toast(t){const e=document.createElement('div');e.className='toast';e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),2400)}
function fill(sel,items,val){
  sel.innerHTML=items.map(i=>`<option value="${esc(i.v)}">${esc(i.t)}</option>`).join('');
  if(items.some(i=>String(i.v)===String(val)))sel.value=val;
}
function go(v){view=v;render();try{if(location.hash!=='#'+v)location.hash=v}catch(e){}}
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(VIEWS.some(x=>x[0]===h)&&h!==view){view=h;render()}});
function render(){
  const unm=DB.txs.filter(t=>t.status==='unmatched').length;
  $('#nav').innerHTML='<span class="brand">Lên đơn</span>'+VIEWS.map(([k,t])=>`<button type="button" data-act="nav" data-v="${k}" ${k===view?'aria-current="page"':''}>${t}${k==='giaodich'&&unm?`<span class="badge">${unm}</span>`:''}</button>`).join('')+'<span class="sp"></span><button type="button" class="ghost" data-act="logout">Đăng xuất</button>';
  VIEW[view]();
  window.scrollTo(0,0);
}

/* ================= VietQR + ảnh ================= */
function crc16(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF;}return c.toString(16).toUpperCase().padStart(4,'0')}
const tlv=(id,v)=>id+String(v.length).padStart(2,'0')+v;
function vietqr(amount,content){
  const S=DB.settings;
  const mer=tlv('00','A000000727')+tlv('01',tlv('00',String(S.bin).trim())+tlv('01',String(S.acc).trim()))+tlv('02','QRIBFTTA');
  const p=tlv('00','01')+tlv('01','12')+tlv('38',mer)+tlv('53','704')+(amount>0?tlv('54',String(Math.round(amount))):'')+tlv('58','VN')+tlv('62',tlv('08',content))+'6304';
  return p+crc16(p);
}
function qrImg(text,size){
  try{
    const q=qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount();let d='';
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c} ${r}h1v1h-1z`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n+4} ${n+4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n+4}" height="${n+4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    return `<img alt="Mã QR chuyển khoản" width="${size}" height="${size}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
  }catch(e){return '<div class="empty">Không tạo được QR</div>'}
}
async function exportImg(id){
  const el=document.getElementById(id);
  if(!el)return;
  if(!window.html2canvas){toast('Chưa tải được công cụ xuất ảnh');return}
  try{
    const cv=await html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true});
    const url=cv.toDataURL('image/png');
    const ov=document.createElement('div');ov.className='ov';
    ov.innerHTML=`<div class="panel"><div class="row" style="justify-content:space-between"><b>Ảnh đã tạo</b><span class="row"><button type="button" id="ovCopy">Sao chép ảnh</button><button type="button" class="primary" id="ovClose">Đóng</button></span></div><p class="hint" style="margin:6px 0 0">Bấm giữ vào ảnh (điện thoại) hoặc chuột phải (máy tính) để lưu hoặc gửi qua Zalo.</p><img alt="Ảnh phiếu" src="${url}"></div>`;
    document.body.appendChild(ov);
    $('#ovClose',ov).onclick=()=>ov.remove();
    $('#ovCopy',ov).onclick=()=>cv.toBlob(b=>{
      try{navigator.clipboard.write([new ClipboardItem({'image/png':b})]).then(()=>toast('Đã sao chép ảnh'),()=>toast('Trình duyệt không cho sao chép, hãy bấm giữ vào ảnh để lưu'))}
      catch(e){toast('Trình duyệt không cho sao chép, hãy bấm giữ vào ảnh để lưu')}
    });
  }catch(e){toast('Không xuất được ảnh')}
}

/* ================= Tổng quan ================= */
function nextStep(o,c){
  if(o.status==='Nháp')return 'Chờ khách cọc';
  if(o.status==='Đã chốt')return 'Cắt hàng và giao';
  return c.remain>0?'Thu nốt '+money(c.remain):'Đã đủ tiền';
}
function viewDash(){
  const all=repOrders(''),months=[...new Set(all.map(o=>ym(o.date)).concat([ym(TODAY)]))].sort();
  const list=repOrders(DASH.month),T=sumOrders(list);
  const outstanding=sum(all.map(o=>oCalc(o)),'remain');
  const open=DB.orders.filter(o=>o.type==='DH'&&o.status!=='Hoàn thành').sort((a,b)=>a.date.localeCompare(b.date));
  const stat=STATS.map(s=>`<button type="button" data-act="dash-stat" data-s="${s}"><span class="hint">${s}</span><b>${DB.orders.filter(o=>o.type==='DH'&&o.status===s).length}</b></button>`).join('');
  const openRows=open.map(o=>{const c=oCalc(o);return `<tr data-act="open" data-id="${o.id}" tabindex="0"><td><b>${o.no}</b></td><td>${esc((custOf(o.cust)||{}).name)}</td><td><span class="pill ${STAT_CLASS[o.status]}">${o.status}</span></td><td class="num">${money(c.total)}</td><td>${nextStep(o,c)}</td></tr>`}).join('');
  const trend=months.slice(-6).map(m=>({m,s:sumOrders(all.filter(o=>ym(o.date)===m))}));
  const mx=Math.max(1,...trend.map(r=>r.s.total));
  const trendRows=trend.map(({m,s})=>`<tr><td style="white-space:nowrap">${mlabel(m)}</td><td style="min-width:110px"><div class="bar"><i style="width:${s.total/mx*100}%"></i></div></td><td class="num">${money(s.total)}</td><td class="num ${s.profit<0?'bad':'good'}">${money(s.profit)}</td></tr>`).join('');
  const top=DB.customers.map(c=>({c,s:sumOrders(list.filter(o=>o.cust===c.id))})).filter(x=>x.s.n).sort((a,b)=>b.s.total-a.s.total).slice(0,5)
    .map(({c,s})=>`<tr><td>${esc(c.name)}</td><td class="num">${s.n}</td><td class="num">${money(s.total)}</td><td class="num ${s.profit<0?'bad':'good'}">${money(s.profit)}</td></tr>`).join('');
  const idle=DB.customers.map(c=>{const os=all.filter(o=>o.cust===c.id).sort((a,b)=>b.date.localeCompare(a.date));return {c,last:os[0]?os[0].date:null}})
    .filter(x=>x.last).map(x=>Object.assign(x,{days:Math.round((new Date(TODAY)-new Date(x.last))/86400000)})).filter(x=>x.days>30).sort((a,b)=>b.days-a.days);
  const idleRows=idle.map(x=>`<tr><td>${esc(x.c.name)}</td><td>${esc(x.c.phone)}</td><td>${dmy(x.last)}</td><td class="num">${x.days} ngày</td></tr>`).join('');
  $('#main').innerHTML=`<div class="top"><h1>Tổng quan</h1><div class="f" style="min-width:200px"><label for="dMonth">Kỳ</label><select id="dMonth"></select></div></div>
  ${DB.txs.some(t=>t.status==='unmatched')?`<div class="credit" style="background:var(--bad-soft);border-color:var(--bad)"><span><b>${DB.txs.filter(t=>t.status==='unmatched').length}</b> giao dịch ngân hàng chưa ghép được với đơn nào.</span><button type="button" class="sm" data-act="nav" data-v="giaodich">Xem và xử lý</button></div>`:''}
  <div class="kpis"><div class="kpi"><small>Doanh thu</small><b>${money(T.total)}</b></div><div class="kpi"><small>Lợi nhuận</small><b class="${T.profit<0?'bad':'good'}">${money(T.profit)}</b></div><div class="kpi"><small>% lãi</small><b>${pct(T.profit,T.total)}</b></div><div class="kpi"><small>Số đơn</small><b>${T.n}</b></div><div class="kpi"><small>Còn phải thu (tất cả)</small><b class="${outstanding>0?'bad':''}">${money(outstanding)}</b></div></div>
  <div class="stat" aria-label="Số đơn theo trạng thái">${stat}</div>
  <div class="col">
  <section class="card"><h2>Việc cần làm <span class="hint">Bấm vào đơn để mở</span></h2><div class="tw"><table><thead><tr><th>Số phiếu</th><th>Khách</th><th>Trạng thái</th><th class="num">Tổng đơn</th><th>Việc tiếp theo</th></tr></thead><tbody>${openRows||'<tr><td colspan="5" class="empty">Không còn đơn nào cần xử lý.</td></tr>'}</tbody></table></div></section>
  <div class="two">
    <section class="card"><h2>Doanh thu 6 tháng gần nhất</h2><div class="tw"><table><thead><tr><th>Tháng</th><th></th><th class="num">Doanh thu</th><th class="num">Lợi nhuận</th></tr></thead><tbody>${trendRows}</tbody></table></div></section>
    <section class="card"><h2>Khách mua nhiều nhất</h2><div class="tw"><table><thead><tr><th>Khách</th><th class="num">Đơn</th><th class="num">Doanh thu</th><th class="num">Lợi nhuận</th></tr></thead><tbody>${top||'<tr><td colspan="4" class="empty">Chưa có đơn trong kỳ này.</td></tr>'}</tbody></table></div></section>
  </div>
  <section class="card"><h2>Khách lâu chưa mua lại <span class="hint">Trên 30 ngày kể từ đơn gần nhất</span></h2><div class="tw"><table><thead><tr><th>Khách</th><th>SĐT</th><th>Đơn gần nhất</th><th class="num">Đã qua</th></tr></thead><tbody>${idleRows||'<tr><td colspan="4" class="empty">Không có khách nào.</td></tr>'}</tbody></table></div></section>
  </div>`;
  fill($('#dMonth'),[{v:'',t:'Tất cả các tháng'}].concat(months.slice().reverse().map(m=>({v:m,t:mlabel(m)}))),DASH.month);
  $('#dMonth').onchange=e=>{DASH.month=e.target.value;viewDash()};
}

/* ================= Đơn hàng: danh sách ================= */
function viewOrders(){
  if(ED)return editor();
  let list=DB.orders.slice().sort((a,b)=>(b.date+b.no).localeCompare(a.date+a.no));
  if(F.cust)list=list.filter(o=>o.cust===F.cust);
  if(F.stat)list=list.filter(o=>o.status===F.stat);
  const rows=list.map(o=>{
    const c=oCalc(o);
    return `<tr data-act="open" data-id="${o.id}" tabindex="0"><td><b>${o.no}</b>${o.type==='BG'?' <span class="pill">Báo giá</span>':''}</td><td>${dmy(o.date)}</td><td>${esc((custOf(o.cust)||{}).name)}</td><td><span class="pill ${STAT_CLASS[o.status]||''}">${o.status}</span></td><td class="num">${money(c.total)}</td><td class="num ${c.remain>0&&o.status!=='Nháp'?'bad':''}">${money(Math.max(0,c.remain))}</td><td class="num ${c.profit<0?'bad':'good'}">${money(c.profit)}</td></tr>`;
  }).join('')||'<tr><td colspan="7" class="empty">Không có đơn nào.</td></tr>';
  $('#main').innerHTML=`<div class="top"><h1>Đơn hàng</h1><button type="button" class="primary" data-act="new">+ Tạo đơn mới</button></div>
  <div class="card"><div class="fields" style="margin-bottom:12px;max-width:520px">
    <div class="f"><label for="fCust">Khách hàng</label><select id="fCust"></select></div>
    <div class="f"><label for="fStat">Trạng thái</label><select id="fStat"></select></div></div>
  <div class="tw"><table><thead><tr><th>Số phiếu</th><th>Ngày</th><th>Khách</th><th>Trạng thái</th><th class="num">Tổng đơn</th><th class="num">Chưa thu</th><th class="num">Lợi nhuận</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="hint" style="margin:8px 0 0">Số phiếu = năm tháng + mã khách + 4 số ngẫu nhiên. Cột lợi nhuận chỉ bạn thấy.</p></div>`;
  fill($('#fCust'),[{v:'',t:'Tất cả khách'}].concat(DB.customers.map(c=>({v:c.id,t:c.name}))),F.cust);
  fill($('#fStat'),[{v:'',t:'Tất cả'}].concat(STATS.map(s=>({v:s,t:s}))),F.stat);
  $('#fCust').onchange=e=>{F.cust=e.target.value;viewOrders()};
  $('#fStat').onchange=e=>{F.stat=e.target.value;viewOrders()};
}
function openEditor(o,isNew){ED=clone(o);EDnew=isNew;OUT='khach';D.k='tam';go('don')}

/* ================= Đơn hàng: màn hình lên đơn ================= */
function editor(){
  $('#main').innerHTML=`
  <div class="top"><div class="row"><button type="button" class="ghost" data-act="back">← Danh sách</button><h1 id="edTitle"></h1></div>
    <div class="row"><button type="button" class="ghost bad" data-act="delorder" id="delOrder">Xóa đơn nháp</button><button type="button" class="ghost" data-act="cancel">Hủy thay đổi</button><button type="button" class="primary" data-act="save">Lưu</button></div></div>
  <div class="grid"><div class="col">
  <section class="card"><h2>Thông tin phiếu</h2>
    <div class="fields">
      <div class="f"><label>Loại phiếu</label><div class="seg" id="docType"><button type="button" data-act="doctype" data-v="BG">Báo giá</button><button type="button" data-act="doctype" data-v="DH">Đơn hàng</button></div></div>
      <div class="f"><label for="e-no">Số phiếu (tự tạo)</label><input id="e-no" readonly></div>
      <div class="f"><label for="e-date">Ngày</label><input id="e-date" type="date"></div>
      <div class="f"><label for="e-status">Trạng thái</label><select id="e-status"></select></div>
      <div class="f"><label for="e-cust">Khách hàng</label><select id="e-cust"></select></div>
    </div>
    <p class="hint" id="custInfo" style="margin:10px 0 0"></p>
    <p class="hint" style="margin:4px 0 0">Nháp là ban đầu. Ghi nhận khoản thu đầu tiên thì tự chuyển sang Đã chốt. Đã giao và thu đủ tiền thì tự chuyển sang Hoàn thành.</p>
  </section>

  <section class="card"><h2>Thêm dòng hàng <span class="seg" id="kind"><button type="button" data-act="kind" data-v="tam">Tấm nhựa</button><button type="button" data-act="kind" data-v="pk">Phụ kiện</button></span></h2>
    <div class="fields">
      <div class="f tam"><label for="pid">Tên hàng</label><select id="pid"></select></div>
      <div class="f tam"><label for="color">Màu sắc</label><select id="color"></select></div>
      <div class="f tam"><label for="ly">Độ ly (mm)</label><select id="ly"></select></div>
      <div class="f tam"><label for="w">Khổ rộng (m)</label><select id="w"></select></div>
      <div class="f tam"><label for="dai">Chiều dài (m)</label><input id="dai" type="number" step="0.1" min="0"></div>
      <div class="f tam"><label for="n">Số tấm</label><input id="n" type="number" min="0"></div>
      <div class="f pk hide"><label for="aid">Phụ kiện</label><select id="aid"></select></div>
      <div class="f pk hide"><label for="qty" id="qtyLbl">Số lượng</label><input id="qty" type="number" min="0"></div>
    </div>
    <div class="row" style="margin-top:12px"><button type="button" class="primary" data-act="addline">Thêm vào đơn</button><span id="draftQty" class="hint"></span></div>
    <p class="hint" style="margin:8px 0 0">Dòng mới tự chọn nhà cung cấp rẻ nhất và giá bán = giá nhập + ${money(DB.settings.markup)}. Đổi nhà cung cấp và giá bán ngay trong bảng bên dưới.</p>
  </section>

  <section class="card"><h2>Các dòng trong đơn</h2>
    <div class="tw" id="linesWrap"></div>
  </section>

  <section class="card"><h2>Thu của khách</h2>
    <div class="fields">
      <div class="f"><label for="e-ship">Phụ thu giao hàng (thu khách)</label><input id="e-ship" type="number" step="10000" placeholder="0"></div>
      <div class="f"><label for="e-advance">Tạm ứng cắt hàng (đ)</label><input id="e-advance" type="number" step="500000"></div>
      <div class="f"><label>&nbsp;</label><button type="button" class="ghost" data-act="advauto">Tính lại theo ${nz(DB.settings.advPct)}%</button></div>
      <div class="f"><label for="e-discType">Giảm giá (trên tiền hàng)</label><select id="e-discType"><option value="vnd">Số tiền (đ)</option><option value="pct">Phần trăm (%)</option></select></div>
      <div class="f"><label for="e-discVal">Giá trị giảm</label><input id="e-discVal" type="number" step="1000"></div>
      <div class="f" style="grid-column:1/-1"><label for="e-note">Ghi chú giao hàng (hiện trên phiếu vận chuyển)</label><input id="e-note"></div>
    </div>
  </section>

  <section class="card"><h2>Chi phí và môi giới <span class="private">Chỉ mình bạn thấy</span></h2>
    <div class="fields">
      <div class="f"><label for="e-shipCost">Chi phí giao hàng thực tế (bạn trả)</label><input id="e-shipCost" type="number" step="10000" placeholder="Nhập số bạn trả"></div>
      <div class="f"><label for="e-broker">Môi giới</label><select id="e-broker"></select></div>
      <div class="f"><label for="e-brokerPct">% hoa hồng môi giới</label><input id="e-brokerPct" type="number" step="0.5"></div>
    </div>
    <p class="hint" style="margin:8px 0 0">Không hiện trên phiếu khách và phiếu vận chuyển.</p>
  </section>

  <section class="card"><h2>Phiếu và ảnh gửi đi
      <span class="seg" id="outTabs"><button type="button" data-act="out" data-v="khach">Phiếu khách</button><button type="button" data-act="out" data-v="van">Phiếu vận chuyển</button><button type="button" data-act="out" data-v="qr">QR thu tiền</button></span></h2>
    <div id="outBody"></div>
  </section>
  </div>

  <aside class="col aside">
    <section class="card"><h2>Lợi nhuận đơn <span class="private">Chỉ mình bạn thấy</span></h2><div id="profitHead"></div><div class="tot" id="profitRows" style="margin-top:10px"></div></section>
    <section class="card"><h2>Tiền hàng và thu tiền</h2><div class="tot" id="moneyRows"></div></section>
    <section class="card"><h2>Ghi nhận thu tiền</h2><div id="creditBox"></div><div id="pays"></div>
      <div class="row" style="margin-top:8px"><select id="payKind" style="width:auto"><option value="adv">Tạm ứng cắt hàng</option><option value="pay">Thanh toán thêm</option></select><input id="payAmt" type="number" step="10000" placeholder="Số tiền thực thu" style="width:140px"><button type="button" class="primary" data-act="payadd">Ghi nhận</button></div>
      <div class="row" style="margin-top:6px"><button type="button" class="ghost sm" data-act="payquick" id="payQuick">Thu đủ tạm ứng</button></div>
      <p class="hint" style="margin:6px 0 0">Khách cọc ít hơn dự kiến cũng được: tạm ứng lấy theo số thực thu, QR và còn phải thu tính lại.</p></section>
  </aside></div>`;

  const bindE=(id,key,num,cb)=>{const el=$('#'+id);el.value=ED[key]==null?'':ED[key];el.addEventListener('input',()=>{ED[key]=num?nz(el.value):el.value;(cb||calc)();});};
  fill($('#e-cust'),DB.customers.map(c=>({v:c.id,t:c.name})),ED.cust);
  fill($('#e-broker'),[{v:'',t:'Không có'}].concat(DB.brokers.map(b=>({v:b.id,t:b.name}))),ED.broker);
  fill($('#e-status'),STATS.map(s=>({v:s,t:s})),ED.status);
  bindE('e-date','date',false);
  bindE('e-discType','discType',false); bindE('e-discVal','discVal',true); bindE('e-ship','ship',true); bindE('e-shipCost','shipCost',true);
  bindE('e-note','note',false);
  bindE('e-brokerPct','brokerPct',true,()=>{const b=brokerOf(ED.broker);if(b)b.pct=ED.brokerPct;calc();});
  $('#e-status').addEventListener('input',()=>{ED.status=$('#e-status').value;autoComplete();calc();});
  $('#e-broker').addEventListener('input',()=>{ED.broker=$('#e-broker').value;const b=brokerOf(ED.broker);if(b){ED.brokerPct=b.pct;$('#e-brokerPct').value=b.pct}calc();});
  $('#e-cust').addEventListener('input',async()=>{
    const v=$('#e-cust').value;
    try{
      await Q(sb.from('orders').update({customer_id:v}).eq('id',ED.id));
      const r=await Q(sb.from('orders').select('no').eq('id',ED.id).single());
      ED.cust=v;ED.no=r.no;calc();toast('Số phiếu mới: '+ED.no);
    }catch(e){toast(errText(e));$('#e-cust').value=ED.cust}
  });
  $('#e-advance').addEventListener('input',()=>{ED.advManual=true;ED.advance=nz($('#e-advance').value);calc();});
  ['pid','color','ly','w','aid','dai','n','qty'].forEach(id=>$('#'+id).addEventListener('input',()=>draftChange(id)));
  $('#dai').value=D.dai||6;$('#n').value=D.n||4;$('#qty').value=D.qty||10;
  popDraft();readDraft();setKind(D.k);
  $('#payKind').value=oCalc(ED).advPaid>0?'pay':'adv';
  renderLines();
}
function popDraft(){
  const t=tamOf(D.pid)||DB.tam[0]||{id:'',colors:[],lys:[]}; D.pid=t.id;
  if(!t.colors.includes(D.color))D.color=t.colors[0];
  if(!t.lys.includes(+D.ly))D.ly=t.lys[0];
  if(!DB.widths.includes(+D.w))D.w=DB.widths[0]||0;
  if(!pkOf(D.aid))D.aid=(DB.pk[0]||{}).id||'';
  fill($('#pid'),DB.tam.map(x=>({v:x.id,t:`${x.name} (${x.code})`})),D.pid);
  fill($('#color'),t.colors.map(c=>({v:c,t:c})),D.color);
  fill($('#ly'),t.lys.map(l=>({v:l,t:dec(l)})),D.ly);
  fill($('#w'),DB.widths.map(w=>({v:w,t:dec(w)})),D.w);
  fill($('#aid'),DB.pk.map(a=>({v:a.id,t:`${a.name} (${a.unit})`})),D.aid);
}
function readDraft(){
  D.pid=$('#pid').value;D.color=$('#color').value;D.ly=+$('#ly').value;D.w=+$('#w').value;
  D.dai=nz($('#dai').value);D.n=nz($('#n').value);D.aid=$('#aid').value;D.qty=nz($('#qty').value);
  const q=D.k==='tam'?D.w*D.dai*D.n:D.qty;
  const pu=(pkOf(D.aid)||{unit:''}).unit;
  $('#qtyLbl').textContent='Số lượng ('+pu+')';
  $('#draftQty').textContent=D.k==='tam'?`${dec(q)} m²`:`${dec(q)} ${pu}`;
}
function draftChange(id){
  readDraft();
  if(id==='pid'){const t=tamOf(D.pid);D.ly=t.lys[0];D.color=t.colors[0];popDraft();readDraft();}
}
function setKind(k){
  D.k=k;
  $$('#kind button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===k));
  $$('.tam').forEach(e=>e.classList.toggle('hide',k!=='tam'));
  $$('.pk').forEach(e=>e.classList.toggle('hide',k!=='pk'));
  readDraft();
}
function autoComplete(){
  const c=oCalc(ED);
  if(ED.status==='Đã giao'&&c.total>0&&c.remain<=0)ED.status='Hoàn thành';
  else if(ED.status==='Hoàn thành'&&c.remain>0)ED.status='Đã giao';
}
function recordPay(a,kind){
  ED.pays.push({d:TODAY,amt:a,kind,note:kind==='adv'?'Tạm ứng cắt hàng':'Thanh toán'});
  if(kind==='adv'){ED.advance=ED.pays.filter(p=>p.kind==='adv').reduce((s,p)=>s+p.amt,0);ED.advManual=true;$('#e-advance').value=ED.advance;}
  const was=ED.status;
  if(ED.status==='Nháp')ED.status='Đã chốt';
  if(ED.type==='BG')ED.type='DH';
  autoComplete();
  $('#payKind').value=oCalc(ED).advPaid>0?'pay':'adv';
  calc();
  toast('Đã ghi nhận '+money(a)+(was!==ED.status?'. Phiếu chuyển sang '+ED.status:''));
}

/* ---- bảng dòng đơn ---- */
function histOf(l){
  const out=[];
  DB.orders.forEach(o=>{
    if(o.id===ED.id||o.type!=='DH'||o.cust!==ED.cust||o.status==='Nháp')return;
    o.lines.forEach(x=>{if(x.k===l.k&&(l.k==='tam'?(x.pid===l.pid&&x.ly===l.ly):x.aid===l.aid))out.push({o,l:x})});
  });
  return out.sort((a,b)=>b.o.date.localeCompare(a.o.date));
}
function costPanel(i,l){
  const key=keyOf(l),m=DB.costs[key]||{};
  const rows=Object.keys(m).sort((a,b)=>lastOf(m[a]).p-lastOf(m[b]).p).map((sid,idx)=>{
    const c=lastOf(m[sid]);
    return `<tr><td>${esc(supName(sid))} ${idx===0?'<span class="pill good">Rẻ nhất</span>':''} ${sid===l.sup?'<span class="pill acc">Đang chọn</span>':''}</td><td class="num"><b>${money(c.p)}</b></td><td>từ ${dmy(c.d)}</td><td>${sid===l.sup?'':`<button type="button" class="sm" data-act="linesup" data-i="${i}" data-s="${sid}">Chọn NCC này</button>`}</td></tr>`;
  }).join('')||'<tr><td colspan="4" class="empty">Chưa có NCC nào có giá cho mã này. Thêm ở mục Mã hàng.</td></tr>';
  return `<div class="tw"><table><thead><tr><th>Giá nhập hiện tại của ${maOf(l)}</th><th class="num">Giá nhập</th><th>Hiệu lực</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="row" style="margin-top:8px"><button type="button" class="sm" data-act="linereset" data-i="${i}">Đặt giá bán = giá nhập + ${money(DB.settings.markup)}</button></div>`;
}
function histPanel(i,l){
  const list=histOf(l),cn=(custOf(ED.cust)||{}).name||'';
  const title=`${esc(cn)} đã mua ${esc(lineName(l))}${l.k==='tam'?', '+dec(l.ly)+' ly':''}`;
  if(!list.length)return `<b>${title}</b><div class="empty">Khách chưa mua mã này.</div>`;
  const body=l.k==='tam'
   ?`<thead><tr><th>Ngày mua</th><th>Mã hàng</th><th>Màu</th><th class="num">Ly</th><th class="num">Khổ</th><th class="num">Dài</th><th class="num">Tấm</th><th class="num">Đơn giá/m²</th><th class="num">Thành tiền</th></tr></thead><tbody>`+
     list.map(({o,l:x})=>`<tr data-act="linepick" data-i="${i}" data-p="${x.pout}" tabindex="0"><td>${dmy(o.date)}</td><td>${maOf(x)}</td><td>${esc(x.color)}</td><td class="num">${dec(x.ly)}</td><td class="num">${dec(x.w)}</td><td class="num">${dec(x.dai)}</td><td class="num">${x.n}</td><td class="num">${money(x.pout)}</td><td class="num">${money(lineQty(x)*x.pout)}</td></tr>`).join('')+'</tbody>'
   :`<thead><tr><th>Ngày mua</th><th>Phụ kiện</th><th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead><tbody>`+
     list.map(({o,l:x})=>`<tr data-act="linepick" data-i="${i}" data-p="${x.pout}" tabindex="0"><td>${dmy(o.date)}</td><td>${esc(pkOf(x.aid).name)}</td><td class="num">${x.qty} ${pkOf(x.aid).unit}</td><td class="num">${money(x.pout)}</td><td class="num">${money(x.qty*x.pout)}</td></tr>`).join('')+'</tbody>';
  return `<b>${title}</b><div class="tw" style="margin-top:6px"><table>${body}</table></div><p class="hint" style="margin:6px 0 0">Bấm vào một dòng để dùng giá đó cho dòng đang xem.</p>`;
}
function renderLines(){
  const L=ED.lines;
  if(!L.length){$('#linesWrap').innerHTML='<div class="empty">Chưa có dòng nào. Chọn hàng ở trên rồi bấm Thêm vào đơn.</div>';calc();return;}
  $('#linesWrap').innerHTML=`<table><thead><tr><th class="num">#</th><th>Mã hàng</th><th class="num">Dài (m)</th><th class="num">Số tấm / SL</th><th class="num">m²</th><th>NCC</th><th class="num">Giá nhập</th><th class="num">Giá bán</th><th class="num">Thành tiền</th><th class="num">Lãi dòng</th><th></th></tr></thead><tbody>`+
  L.map((l,i)=>{
    const spec=l.k==='tam'?`<b>${maOf(l)}</b> ${esc(lineName(l))}<br><span class="hint">${esc(l.color)} · ${dec(l.ly)} ly · khổ ${dec(l.w)}m</span>`:`<b>${maOf(l)}</b> ${esc(lineName(l))}<br><span class="hint">đơn vị: ${pkOf(l.aid).unit}</span>`;
    const dai=l.k==='tam'?`<input class="s" type="number" step="0.1" data-i="${i}" data-f="dai" value="${l.dai}">`:'';
    const sl=`<input class="s" type="number" data-i="${i}" data-f="${l.k==='tam'?'n':'qty'}" value="${l.k==='tam'?l.n:l.qty}">`;
    const key=keyOf(l);
    const sup=`<select data-i="${i}" data-f="sup" aria-label="Nhà cung cấp dòng ${i+1}">${DB.suppliers.map(s=>`<option value="${s.id}" ${s.id===l.sup?'selected':''}>${esc(s.name)}${costNow(key,s.id)==null?' (chưa có giá)':''}</option>`).join('')}</select>`;
    const detail=l.open?`<tr class="detail"><td colspan="11">${l.open==='cost'?costPanel(i,l):histPanel(i,l)}</td></tr>`:'';
    return `<tr data-row="${i}"><td class="num">${i+1}</td><td>${spec}</td><td class="num">${dai}</td><td class="num">${sl}</td><td class="num m2"></td><td>${sup}</td><td class="num">${l.pin!=null?money(l.pin):'?'}</td><td class="num"><input type="number" step="1000" data-i="${i}" data-f="pout" value="${l.pout}"></td><td class="num amt"></td><td class="num prof"></td><td style="white-space:nowrap"><button type="button" class="ghost sm" data-act="linepanel" data-i="${i}" data-v="cost">Giá NCC</button> <button type="button" class="ghost sm" data-act="linepanel" data-i="${i}" data-v="hist">Khách đã mua</button> <button type="button" class="x" data-act="delline" data-i="${i}" aria-label="Xóa dòng">×</button></td></tr>${detail}`;
  }).join('')+'</tbody></table>';
  calc();
}

/* ---- tính lại và vẽ lại các khung phụ thuộc ---- */
function calc(){
  if(!ED)return;
  let c=oCalc(ED);
  if(!ED.advManual){ED.advance=roundAdv(c.total*nz(DB.settings.advPct)/100);if(document.activeElement!==$('#e-advance'))$('#e-advance').value=ED.advance;c=oCalc(ED);}
  $('#edTitle').textContent=(ED.type==='BG'?'Báo giá ':'Đơn hàng ')+ED.no;
  $('#e-no').value=ED.no;
  if($('#e-status').value!==ED.status)$('#e-status').value=ED.status;
  $$('#docType button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===ED.type));
  const cu=custOf(ED.cust)||{};
  $('#custInfo').innerHTML=`Mã khách <b>${esc(cu.code||'')}</b> · SĐT: <b>${esc(cu.phone||'chưa có')}</b> · Địa chỉ: <b>${esc(cu.address||'chưa có')}</b> (sửa ở mục Khách hàng)`;
  $('#e-cust').disabled=ED.status!=='Nháp';
  $('#delOrder').classList.toggle('hide',ED.status!=='Nháp'||ED.pays.length>0);
  const bal=DB.balance[ED.cust]||0,rem=Math.max(0,c.remain);
  $('#creditBox').innerHTML=bal>0&&rem>0?`<div class="credit"><span>Khách có số dư có <b>${money(bal)}</b></span><input id="creditAmt" type="number" step="10000" value="${Math.min(bal,rem)}" style="width:120px"><button type="button" class="primary sm" data-act="credit">Áp dụng vào đơn</button></div>`:(bal>0?`<p class="hint" style="margin:0 0 6px">Khách có số dư có ${money(bal)}.</p>`:'');
  $('#payQuick').textContent='Thu đủ tạm ứng '+money(ED.advance);
  $('#payQuick').classList.toggle('hide',c.advPaid>0||nz(ED.advance)<=0);
  $$('tr[data-row]').forEach(tr=>{
    const l=ED.lines[+tr.dataset.row],q=lineQty(l);
    tr.querySelector('.m2').textContent=l.k==='tam'?dec(q):'';
    tr.querySelector('.amt').textContent=money(q*nz(l.pout));
    const bad=l.pin!=null&&nz(l.pout)<=l.pin, d=l.pin!=null?(nz(l.pout)-l.pin)*q:null;
    const p=tr.querySelector('.prof');p.textContent=d==null?'?':(d>=0?'+':'')+money(d);p.className='num prof '+(bad?'bad':'good');
    tr.classList.toggle('loss',bad);
  });
  const lossLines=ED.lines.filter(l=>l.pin!=null&&nz(l.pout)<=l.pin).length;
  const bad=c.profit<0, margin=c.total>0?c.profit/c.total*100:0;
  $('#profitHead').innerHTML=`<div class="profit ${bad?'bad':'good'}">${c.profit>=0?'+':''}${money(c.profit)}</div><div style="margin-top:4px">${bad?'<span class="pill bad">Đơn bị lỗ</span>':'<span class="pill good">Đơn có lãi</span>'} <span class="hint">${margin.toFixed(1)}% trên doanh thu</span>${lossLines?` <span class="pill bad">${lossLines} dòng bán không lãi</span>`:''}</div>`;
  $('#profitRows').innerHTML=`<span>Doanh thu (tổng đơn)</span><span>${money(c.total)}</span><span>Giá nhập hàng</span><span>− ${money(c.cost)}</span><span>Chi phí giao hàng</span><span>− ${money(c.shipCost)}</span><span>Hoa hồng môi giới</span><span>− ${money(c.comm)}</span><div class="sep"></div><span class="strong">Lợi nhuận</span><span class="strong ${bad?'bad':'good'}">${money(c.profit)}</span><span class="hint" style="grid-column:1/-1">Hoa hồng tính trên (giá bán − giá nhập) từng dòng, không bị trừ giảm giá cả đơn.</span>`;
  $('#moneyRows').innerHTML=`<span>Tiền hàng</span><span>${money(c.goods)}</span>${c.disc?`<span>Giảm giá</span><span>− ${money(c.disc)}</span>`:''}<span>Phụ thu giao hàng</span><span>${money(c.ship)}</span><div class="sep"></div><span class="strong">Tổng đơn</span><span class="strong">${money(c.total)}</span><span>Tạm ứng cắt hàng ${c.advPaid>0?'<span class="pill good">đã thu</span>':(c.advEff>0?'<span class="pill">chưa thu</span>':'')}</span><span>${money(c.advEff)}</span><span>Đã thu</span><span>${money(c.paid)}</span><div class="sep"></div><span class="strong">Còn phải thu</span><span class="strong">${money(Math.max(c.bal,0))}</span><span class="hint" style="grid-column:1/-1">Còn phải thu = tổng đơn − tạm ứng − các khoản đã thu thêm.</span>`;
  $('#pays').innerHTML=ED.pays.length?ED.pays.map((p,i)=>`<div class="pay"><span>${dmy(p.d)} · ${esc(p.note)}</span><span>${money(p.amt)} ${p.id&&p.source!=='manual'?`<span class="pill">${p.source==='sepay'?'tự động':'từ số dư'}</span>`:`<button type="button" class="x" data-act="paydel" data-i="${i}" aria-label="Xóa khoản thu">×</button>`}</span></div>`).join(''):'<div class="empty" style="padding:6px">Chưa thu khoản nào.</div>';
  renderOut(c);
}

/* ---- phiếu gửi đi ---- */
function specText(l){return l.k==='tam'?`${maOf(l)} · ${lineName(l)}, ${l.color}, ${dec(l.ly)} ly, khổ ${dec(l.w)}m`:`${maOf(l)} · ${lineName(l)}`}
function sheetKhach(c){
  const cu=custOf(ED.cust)||{},other=c.paid-c.advPaid,bal=Math.max(0,c.bal),pre=ED.no;
  const rows=ED.lines.map(l=>`<tr><td>${esc(specText(l))}</td><td class="num">${l.k==='tam'?dec(l.dai)+' m':''}</td><td class="num">${l.k==='tam'?l.n+' tấm':dec(l.qty)+' '+pkOf(l.aid).unit}</td><td class="num">${money(l.pout)}${l.k==='tam'?'/m²':'/'+pkOf(l.aid).unit}</td><td class="num">${money(lineQty(l)*nz(l.pout))}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Chưa có dòng hàng</td></tr>';
  const qr=[];
  if(c.advDue>0)qr.push(`<div>${qrImg(vietqr(c.advDue,payNote(ED)),170)}<br><b>Tạm ứng cắt hàng</b><br>${money(c.advDue)}</div>`);
  if(bal>0)qr.push(`<div>${qrImg(vietqr(bal,payNote(ED)),170)}<br><b>Còn phải thu</b><br>${money(bal)}</div>`);
  return `<div class="shop">${esc(DB.settings.shop)}</div><h3>${ED.type==='BG'?'BÁO GIÁ':'PHIẾU XUẤT HÀNG'} ${pre}</h3>
  <div class="meta"><span>Khách hàng: <b>${esc(cu.name||'')}</b><br>${cu.phone?'SĐT: '+esc(cu.phone):''}</span><span>Ngày: ${dmy(ED.date)}</span></div>
  <table><thead><tr><th>Quy cách</th><th class="num">Chiều dài</th><th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sum"><span>Tiền hàng</span><span>${money(c.goods)}</span>${c.disc?`<span>Giảm giá</span><span>− ${money(c.disc)}</span>`:''}<span>Phụ thu giao hàng</span><span>${money(c.ship)}</span><span class="strong">Tổng cộng</span><span class="strong">${money(c.total)}</span><span>Tạm ứng cắt hàng${c.advPaid>0?' (đã nhận)':''}</span><span>${money(c.advEff)}</span>${other>0?`<span>Đã thanh toán thêm</span><span>${money(other)}</span>`:''}<span class="strong">Còn phải thu</span><span class="strong">${money(bal)}</span></div>
  <div class="qrrow">${qr.join('')}<div class="bank">Chuyển khoản:<br>STK <b>${esc(DB.settings.acc)}</b><br>${esc(DB.settings.accName)}<br>Nội dung ghi theo mã QR.</div></div>
  <div class="foot">Cảm ơn quý khách.</div>`;
}
function sheetVan(c){
  const cu=custOf(ED.cust)||{},bal=Math.max(0,c.bal),pre=ED.no;
  const rows=ED.lines.map((l,i)=>`<tr><td class="num">${i+1}</td><td>${l.k==='tam'?`<b>${esc(lineName(l))}</b><br>Màu ${esc(l.color)} · ${dec(l.ly)} ly · khổ rộng ${dec(l.w)} m`:`<b>${esc(lineName(l))}</b>`}</td><td class="num">${l.k==='tam'?dec(l.dai)+' m':''}</td><td class="num"><b>${l.k==='tam'?l.n+' tấm':dec(l.qty)+' '+pkOf(l.aid).unit}</b></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Chưa có dòng hàng</td></tr>';
  const sig=t=>`<div style="flex:1;min-width:140px;text-align:center"><b>${t}</b><div style="font-size:11px;color:#555">(Ký, ghi rõ họ tên)</div><div style="height:70px;border-bottom:1px solid #888"></div></div>`;
  const box=`<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #111;vertical-align:-2px;margin-right:8px"></span>`;
  return `<div class="shop">${esc(DB.settings.shop)}</div><h3>PHIẾU GIAO HÀNG ${pre}</h3>
  <div class="meta"><span>Người nhận: <b>${esc(cu.name||'')}</b><br>SĐT: <b>${esc(cu.phone||'')}</b><br>Địa chỉ: <b>${esc(cu.address||'')}</b></span><span>Ngày: ${dmy(ED.date)}</span></div>
  ${ED.note?`<div style="margin:0 0 10px;padding:8px 10px;background:#f4f6f5;border-radius:4px"><b>Ghi chú:</b> ${esc(ED.note)}</div>`:''}
  <table><thead><tr><th class="num">#</th><th>Quy cách hàng</th><th class="num">Chiều dài</th><th class="num">Số lượng</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="cod">${bal>0?`<div><div style="font-weight:700">THU CỦA KHÁCH</div><div class="amt">${money(bal)}</div><div style="color:#444;margin-top:4px">Nội dung: ${payNote(ED)}<br>STK ${esc(DB.settings.acc)} · ${esc(DB.settings.accName)}</div></div>${qrImg(vietqr(bal,payNote(ED)),250)}`:`<div><div style="font-weight:700">KHÔNG THU THÊM</div><div class="amt">0đ</div><div style="color:#444;margin-top:4px">Khách đã thanh toán đủ.</div></div>`}</div>
  <div style="margin-top:16px;padding:12px 14px;border:1px solid #888;border-radius:6px;line-height:2">
    <b>XÁC NHẬN GIAO HÀNG THÀNH CÔNG</b><br>${box}Hàng đẹp, không xước, không vỡ<br>${box}Đầy đủ số lượng như phiếu giao</div>
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px">${sig('Người giao hàng (lái xe)')}${sig('Người nhận hàng')}${sig('Người mua hàng')}</div>`;
}
function qrCard(id,title,amount,content){
  if(amount<=0)return `<div class="qrcard" id="${id}"><div class="shop">${esc(DB.settings.shop)}</div><div class="ttl">${title}</div><div class="amt" style="font-size:20px">Không còn khoản cần thu</div></div>`;
  return `<div class="qrcard" id="${id}"><div class="shop">${esc(DB.settings.shop)}</div><div class="ttl">${title} · ${ED.no}</div><div class="amt">${money(amount)}</div>${qrImg(vietqr(amount,content),260)}<div class="info">Nội dung: <b>${content}</b><br>STK <b>${esc(DB.settings.acc)}</b><br>${esc(DB.settings.accName)}</div></div>`;
}
function renderOut(c){
  $$('#outTabs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===OUT));
  const body=$('#outBody');
  if(OUT==='khach')body.innerHTML=`<div class="row" style="margin-bottom:8px"><span class="hint">Có phụ thu giao hàng, tạm ứng, còn phải thu và hai mã QR.</span><button type="button" class="primary" data-act="exp" data-id="sheetK">Xuất ảnh</button></div><div class="sheetwrap"><div class="sheet" id="sheetK">${sheetKhach(c)}</div></div>`;
  else if(OUT==='van')body.innerHTML=`<div class="row" style="margin-bottom:8px"><span class="hint">Không có đơn giá và thành tiền. Có địa chỉ, mã hàng, số lượng, còn phải thu và QR lớn.</span><button type="button" class="primary" data-act="exp" data-id="sheetV">Xuất ảnh</button></div><div class="sheetwrap"><div class="sheet" id="sheetV">${sheetVan(c)}</div></div>`;
  else{
    const pre=ED.no,bal=Math.max(0,c.bal);
    body.innerHTML=`<div class="qrs"><div><div class="row" style="margin-bottom:8px"><b>Tạm ứng cắt hàng</b><button type="button" class="primary" data-act="exp" data-id="qrA">Xuất ảnh</button></div>${qrCard('qrA','TẠM ỨNG CẮT HÀNG',c.advDue,payNote(ED))}</div><div><div class="row" style="margin-bottom:8px"><b>Còn phải thu</b><button type="button" class="primary" data-act="exp" data-id="qrB">Xuất ảnh</button></div>${qrCard('qrB','CÒN PHẢI THU',bal,payNote(ED))}</div></div>
    <p class="hint" style="margin:8px 0 0">Sau khi ghi nhận tạm ứng thực thu, QR tạm ứng biến mất và còn phải thu đã trừ số đó. Số tài khoản trong Cài đặt là ví dụ.</p>`;
  }
}

/* ================= Mã hàng ================= */
function allItems(){
  return DB.items.map(i=>{
    const key=ITEMKEY[i.id];
    if(i.kind==='tam'){const t=tamOf(i.product_id)||{name:'?'};return {key,code:i.code,title:t.name,sub:dec(i.ly)+' ly',kind:'tam',stt:i.stt}}
    return {key,code:i.code,title:i.name,sub:'đơn vị: '+i.unit,kind:'pk',stt:i.stt};
  });
}
function pmTable(){
  const q=norm(PM.q.trim());
  const items=allItems().filter(it=>{
    if(PM.kind&&it.kind!==PM.kind)return false;
    const m=DB.costs[it.key]||{};
    if(PM.sup&&!m[PM.sup])return false;
    if(!q)return true;
    return norm([it.code,it.title,it.sub].concat(Object.keys(m).map(supName)).join(' ')).includes(q);
  });
  const out=items.map(it=>{
    const m=DB.costs[it.key]||{};
    const ids=Object.keys(m).filter(id=>!PM.sup||id===PM.sup).sort((a,b)=>lastOf(m[a]).p-lastOf(m[b]).p);
    const rows=[];
    ids.forEach((sid,idx)=>{
      const h=m[sid],c=lastOf(h),ek=it.key+'@'+sid;
      rows.push(`<td class="num"><b>${money(c.p)}</b>${idx===0&&ids.length>1?' <span class="pill good">Rẻ nhất</span>':''}</td><td>${esc(supName(sid))}</td><td>${dmy(c.d)}</td><td><button type="button" class="ghost sm" data-act="costhist" data-key="${it.key}" data-sup="${sid}">Lịch sử (${h.length})</button></td><td><button type="button" class="sm" data-act="pm-edit" data-key="${it.key}" data-sup="${sid}">Đổi giá</button></td>`);
      if(PME[ek])rows.push(`<td colspan="5" class="histrow"><div class="row" data-key="${it.key}" data-sup="${sid}">Giá nhập mới từ ${dmy(TODAY)}: <input type="number" step="1000" class="newp s" placeholder="Giá mới" style="width:120px"><button type="button" class="primary sm" data-act="setcost">Lưu</button><button type="button" class="ghost sm" data-act="pm-edit">Hủy</button></div></td>`);
      if(PXH[ek])rows.push(`<td colspan="5" class="histrow">${h.slice().reverse().map((x,i,a)=>{const pv=a[i+1],dl=pv?x.p-pv.p:0;return `${dmy(x.d)}: <b>${money(x.p)}</b>${pv?` <span class="${dl>0?'bad':'good'}">(${dl>0?'+':''}${money(dl)})</span>`:''}`}).join(' · ')}</td>`);
    });
    if(!ids.length)rows.push('<td colspan="5" class="hint">Chưa có giá nhập từ NCC nào.</td>');
    if(PMA[it.key]){
      const free=DB.suppliers.filter(s=>!m[s.id]);
      rows.push(`<td colspan="5" class="histrow">${free.length?`<div class="row" data-key="${it.key}"><select class="addsup" style="width:auto">${free.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><input type="number" step="1000" class="addp s" placeholder="Giá nhập" style="width:120px"><button type="button" class="primary sm" data-act="addsup">Thêm</button><button type="button" class="ghost sm" data-act="pm-addsup" data-key="${it.key}">Hủy</button></div>`:'Đã có đủ các NCC cho mã này.'}</td>`);
    }
    const n=rows.length;
    return rows.map((cells,i)=>`<tr${i===0?' class="grp"':''}>${i===0?`<td class="num" rowspan="${n}">${it.stt}</td><td rowspan="${n}" style="min-width:200px"><b>${it.code}</b><br><span class="hint">${esc(it.title)} · ${esc(it.sub)}</span><br><button type="button" class="ghost sm" data-act="pm-addsup" data-key="${it.key}">+ NCC</button></td>`:''}${cells}</tr>`).join('');
  }).join('');
  return `<div class="tw"><table><thead><tr><th class="num">#</th><th>Mã hàng (tên)</th><th class="num">Giá hiện tại</th><th>Nhà cung cấp</th><th>Hiệu lực</th><th>Lịch sử</th><th></th></tr></thead><tbody>${out||'<tr><td colspan="7" class="empty">Không có mã hàng nào khớp.</td></tr>'}</tbody></table></div>`;
}
function viewMahang(){
  const tabs=`<div class="seg"><button type="button" data-act="pmtab" data-v="bang" aria-pressed="${PM.tab==='bang'}">Bảng giá nhập</button><button type="button" data-act="pmtab" data-v="danhmuc" aria-pressed="${PM.tab==='danhmuc'}">Danh mục hàng</button></div>`;
  if(PM.tab==='bang'){
    $('#main').innerHTML=`<div class="top"><h1>Mã hàng</h1>${tabs}</div>
    <section class="card"><div class="fields" style="margin-bottom:12px;max-width:760px">
      <div class="f" style="grid-column:span 2"><label for="pmQ">Tìm mã hàng, tên, độ ly hoặc NCC</label><input id="pmQ" type="search" placeholder="VD: PCD-20, đặc ruột, An Phát"></div>
      <div class="f"><label for="pmKind">Loại</label><select id="pmKind"></select></div>
      <div class="f"><label for="pmSup">Nhà cung cấp</label><select id="pmSup"></select></div></div>
      <div id="pmTable"></div>
      <p class="hint" style="margin:8px 0 0">Một mã hàng có nhiều dòng khi lấy của nhiều nhà cung cấp. Đổi giá sẽ thêm một dòng lịch sử, giá cũ vẫn giữ nguyên.</p></section>`;
    $('#pmQ').value=PM.q;
    fill($('#pmKind'),[{v:'',t:'Tất cả'},{v:'tam',t:'Tấm nhựa'},{v:'pk',t:'Phụ kiện'}],PM.kind);
    fill($('#pmSup'),[{v:'',t:'Tất cả NCC'}].concat(DB.suppliers.map(s=>({v:s.id,t:s.name}))),PM.sup);
    $('#pmTable').innerHTML=pmTable();
    const upd=()=>{$('#pmTable').innerHTML=pmTable()};
    $('#pmQ').addEventListener('input',e=>{PM.q=e.target.value;upd()});
    $('#pmKind').addEventListener('input',e=>{PM.kind=e.target.value;upd()});
    $('#pmSup').addEventListener('input',e=>{PM.sup=e.target.value;upd()});
    return;
  }
  const tamCards=DB.tam.map(t=>`<section class="card" data-pid="${t.id}"><h2>${esc(t.name)} <span class="pill acc">${t.code}</span></h2>
    <div class="row" style="margin-bottom:10px"><span class="hint">Màu (không ảnh hưởng giá):</span>${t.colors.map(c=>`<span class="tag">${esc(c)}<button type="button" class="x" data-act="delcolor" data-c="${esc(c)}" aria-label="Xóa màu">×</button></span>`).join('')}
      <input class="s newcolor" placeholder="Màu mới" style="width:110px"><button type="button" class="sm" data-act="addcolor">Thêm màu</button></div>
    <div class="row"><span class="hint">Độ ly:</span>${t.lys.map(ly=>`<span class="pill acc">${maTam(t.id,ly)} · ${dec(ly)} ly</span>`).join('')}
      <input class="s newly" type="number" step="0.1" placeholder="Độ ly mới"><button type="button" class="sm" data-act="addly">Thêm độ ly</button></div></section>`).join('');
  $('#main').innerHTML=`<div class="top"><h1>Mã hàng</h1>${tabs}</div><div class="col">
  <section class="card"><h2>Khổ rộng có sẵn</h2><div class="row">${DB.widths.map(w=>`<span class="tag">${dec(w)} m<button type="button" class="x" data-act="delwidth" data-w="${w}" aria-label="Xóa khổ">×</button></span>`).join('')}
    <input id="newW" class="s" type="number" step="0.01" placeholder="Khổ mới (m)"><button type="button" class="sm" data-act="addwidth">Thêm khổ</button></div>
    <p class="hint" style="margin:8px 0 0">Khổ chỉ dùng để tính số m² trên đơn, không ảnh hưởng giá. Thêm khổ mới chỉ làm ở đây.</p></section>
  ${tamCards}
  <section class="card"><h2>Thêm tên hàng tấm mới</h2><div class="row"><input id="npName" placeholder="Tên hàng" style="width:220px"><input id="npCode" class="s" placeholder="Mã (VD: PCT)"><input id="npLy" class="s" type="number" step="0.1" placeholder="Độ ly đầu tiên"><button type="button" data-act="addprod">Thêm tên hàng</button></div></section>
  <section class="card"><h2>Phụ kiện</h2><div class="row" style="margin-bottom:10px">${DB.pk.map(a=>`<span class="pill acc">${a.code} · ${esc(a.name)} (${esc(a.unit)})</span>`).join('')}</div>
    <div class="row"><input id="npkName" placeholder="Tên phụ kiện" style="width:200px"><input id="npkUnit" class="s" placeholder="Đơn vị (cây, bộ...)"><input id="npkCode" class="s" placeholder="Mã"><button type="button" data-act="addpk">Thêm phụ kiện</button></div></section>
  <p class="hint">Mã hàng mới chưa có giá nhập. Sang tab Bảng giá nhập, bấm + NCC ở mã đó để thêm giá.</p></div>`;
}

/* ================= Khách hàng, NCC, Môi giới ================= */
function ordersFor(coll,id){
  return repOrders('').filter(o=>coll==='customers'?o.cust===id:coll==='brokers'?o.broker===id:o.lines.some(l=>l.sup===id));
}
const CFG={
 customers:{title:'Khách hàng',fields:[['code','Mã KH (3 số, để trống để tự đánh)'],['name','Tên khách hàng'],['phone','Số điện thoại'],['address','Địa chỉ giao hàng'],['note','Ghi chú']],
  heads:[['Mã'],['Tên'],['SĐT'],['Địa chỉ'],['Số đơn',1],['Doanh thu',1],['Lợi nhuận',1],['Chưa thu',1],['Số dư có',1]],
  cells:r=>{const L=ordersFor('customers',r.id).map(o=>oCalc(o));return [esc(r.code),`<b>${esc(r.name)}</b>`,esc(r.phone),esc(r.address),L.length,money(sum(L,'total')),money(sum(L,'profit')),money(sum(L,'remain')),DB.balance[r.id]>0?`<b class="good">${money(DB.balance[r.id])}</b>`:'-']},
  detail:'Đơn của '},
 suppliers:{title:'Nhà cung cấp',fields:[['name','Tên nhà cung cấp'],['phone','Số điện thoại'],['note','Ghi chú']],
  heads:[['Tên'],['SĐT'],['Ghi chú'],['Mã hàng có giá',1],['Số đơn đã nhập',1],['Tổng giá nhập',1]],
  cells:r=>{const os=ordersFor('suppliers',r.id);let cost=0;os.forEach(o=>o.lines.forEach(l=>{if(l.sup===r.id&&l.pin!=null)cost+=lineQty(l)*l.pin}));
    return [`<b>${esc(r.name)}</b>`,esc(r.phone),esc(r.note),Object.values(DB.costs).filter(m=>m[r.id]).length,os.length,money(cost)]},
  detail:'Đơn có hàng của '},
 brokers:{title:'Môi giới',fields:[['name','Tên môi giới'],['phone','Số điện thoại'],['pct','% hoa hồng hay dùng']],
  heads:[['Tên'],['SĐT'],['% hay dùng',1],['Số đơn',1],['Doanh thu',1],['Hoa hồng phải trả',1]],
  cells:r=>{const L=ordersFor('brokers',r.id).map(o=>oCalc(o));return [`<b>${esc(r.name)}</b>`,esc(r.phone),dec(r.pct)+'%',L.length,money(sum(L,'total')),money(sum(L,'comm'))]},
  detail:'Đơn của môi giới '}
};
function viewCrud(coll){
  const cfg=CFG[coll],edit=CR.edit&&CR.edit.coll===coll?CR.edit:null,sel=CR.sel[coll];
  const rows=DB[coll].map(r=>`<tr data-act="crud-sel" data-id="${r.id}" class="${sel===r.id?'sel':''}" tabindex="0">${cfg.cells(r).map((c,i)=>`<td class="${cfg.heads[i][1]?'num':''}">${c}</td>`).join('')}<td style="white-space:nowrap"><button type="button" class="ghost sm" data-act="crud-edit" data-id="${r.id}">Sửa</button><button type="button" class="x" data-act="crud-del" data-id="${r.id}" aria-label="Xóa">×</button></td></tr>`).join('');
  let detail='';
  if(sel){
    const row=DB[coll].find(r=>r.id===sel),os=ordersFor(coll,sel).sort((a,b)=>b.date.localeCompare(a.date));
    detail=`<section class="card"><h2>${cfg.detail}${esc(row.name)}</h2><div class="tw"><table><thead><tr><th>Số phiếu</th><th>Ngày</th><th>Trạng thái</th><th class="num">Tổng đơn</th><th class="num">Chưa thu</th><th class="num">Lợi nhuận</th>${coll==='brokers'?'<th class="num">Hoa hồng</th>':''}</tr></thead><tbody>`+
      (os.map(o=>{const c=oCalc(o);return `<tr><td><b>${o.no}</b></td><td>${dmy(o.date)}</td><td><span class="pill ${STAT_CLASS[o.status]}">${o.status}</span></td><td class="num">${money(c.total)}</td><td class="num">${money(Math.max(0,c.remain))}</td><td class="num ${c.profit<0?'bad':'good'}">${money(c.profit)}</td>${coll==='brokers'?`<td class="num">${money(c.comm)} (${dec(o.brokerPct)}%)</td>`:''}</tr>`}).join('')||'<tr><td colspan="7" class="empty">Chưa có đơn.</td></tr>')+'</tbody></table></div></section>';
  }
  $('#main').innerHTML=`<div class="top"><h1>${cfg.title}</h1></div><div class="col">
  <section class="card"><h2>${edit&&edit.id?'Sửa':'Thêm mới'}</h2><div class="fields">${cfg.fields.map(([k,l])=>`<div class="f"><label for="cr-${k}">${l}</label><input id="cr-${k}" ${k==='pct'?'type="number" step="0.5"':''}></div>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button type="button" class="primary" data-act="crud-save" data-coll="${coll}">${edit&&edit.id?'Lưu thay đổi':'Thêm'}</button>${edit&&edit.id?'<button type="button" class="ghost" data-act="crud-cancel">Hủy</button>':''}</div></section>
  <section class="card"><div class="tw"><table><thead><tr>${cfg.heads.map(h=>`<th class="${h[1]?'num':''}">${h[0]}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint" style="margin:8px 0 0">Bấm vào một dòng để xem các đơn liên quan. Số liệu tính trên đơn hàng đã chốt trở lên.</p></section>${detail}</div>`;
  if(edit&&edit.id){const r=DB[coll].find(x=>x.id===edit.id);cfg.fields.forEach(([k])=>{$('#cr-'+k).value=r[k]==null?'':r[k]});}
}

/* ================= Lợi nhuận ================= */
function sumOrders(list){const s={n:list.length,total:0,cost:0,shipCost:0,comm:0,profit:0,remain:0,gross:0};list.forEach(o=>{const c=oCalc(o);s.total+=c.total;s.cost+=c.cost;s.shipCost+=c.shipCost;s.comm+=c.comm;s.profit+=c.profit;s.remain+=c.remain;s.gross+=c.gross});return s}
const pct=(a,b)=>b>0?(a/b*100).toFixed(1)+'%':'-';
function tbl(heads,rows){return `<div class="tw"><table><thead><tr>${heads.map(h=>`<th class="${h[1]?'num':''}">${h[0]}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${heads[i][1]?'num':''}">${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}" class="empty">Chưa có dữ liệu.</td></tr>`}</tbody></table></div>`}
function viewProfit(){
  const all=repOrders(''),months=[...new Set(all.map(o=>ym(o.date)))].sort();
  const list=repOrders(PR.month),T=sumOrders(list);
  const tabs=[['thang','Theo tháng'],['khach','Theo khách'],['moigioi','Theo môi giới'],['ncc','Theo NCC'],['mahang','Theo mã hàng'],['chua','Chưa thu đủ']];
  let body='';
  if(PR.tab==='thang'){
    const rows=months.map(m=>({m,s:sumOrders(all.filter(o=>ym(o.date)===m))}));
    const mx=Math.max(1,...rows.map(r=>Math.abs(r.s.profit)));
    body=tbl([['Tháng'],['Số đơn',1],['Doanh thu',1],['Giá nhập',1],['Chi phí giao',1],['Hoa hồng',1],['Lợi nhuận',1],['% lãi',1],['']],
      rows.map(({m,s})=>[mlabel(m),s.n,money(s.total),money(s.cost),money(s.shipCost),money(s.comm),`<b class="${s.profit<0?'bad':'good'}">${money(s.profit)}</b>`,pct(s.profit,s.total),`<div class="bar"><i class="${s.profit<0?'neg':''}" style="width:${Math.abs(s.profit)/mx*100}%"></i></div>`]));
  }else if(PR.tab==='khach'){
    body=tbl([['Khách'],['Số đơn',1],['Doanh thu',1],['Lợi nhuận',1],['% lãi',1]],
      DB.customers.map(c=>({c,s:sumOrders(list.filter(o=>o.cust===c.id))})).filter(x=>x.s.n).sort((a,b)=>b.s.total-a.s.total).map(({c,s})=>[esc(c.name),s.n,money(s.total),`<b class="${s.profit<0?'bad':'good'}">${money(s.profit)}</b>`,pct(s.profit,s.total)]));
  }else if(PR.tab==='moigioi'){
    body=tbl([['Môi giới'],['Số đơn',1],['Doanh thu',1],['Cơ sở tính (bán − nhập)',1],['Hoa hồng phải trả',1]],
      DB.brokers.map(b=>({b,s:sumOrders(list.filter(o=>o.broker===b.id))})).filter(x=>x.s.n).map(({b,s})=>[esc(b.name),s.n,money(s.total),money(s.gross),`<b>${money(s.comm)}</b>`]))+'<p class="hint" style="margin:8px 0 0">Hoa hồng không bị trừ giảm giá cả đơn, phụ thu hay phí giao hàng.</p>';
  }else if(PR.tab==='ncc'){
    const m={};list.forEach(o=>o.lines.forEach(l=>{const x=m[l.sup]=m[l.sup]||{n:new Set(),cost:0,rev:0};x.n.add(o.id);const q=lineQty(l);x.rev+=q*nz(l.pout);if(l.pin!=null)x.cost+=q*l.pin;}));
    body=tbl([['Nhà cung cấp'],['Số đơn',1],['Tổng giá nhập',1],['Doanh thu dòng hàng',1],['Lãi gộp',1]],
      Object.entries(m).sort((a,b)=>b[1].cost-a[1].cost).map(([id,x])=>[esc(supName(id)),x.n.size,money(x.cost),money(x.rev),money(x.rev-x.cost)]));
  }else if(PR.tab==='mahang'){
    const m={};list.forEach(o=>o.lines.forEach(l=>{const k=maOf(l),x=m[k]=m[k]||{q:0,u:unitOf(l),cost:0,rev:0};const q=lineQty(l);x.q+=q;x.rev+=q*nz(l.pout);if(l.pin!=null)x.cost+=q*l.pin;}));
    body=tbl([['Mã hàng'],['Đã bán',1],['Doanh thu',1],['Giá nhập',1],['Lãi gộp',1]],
      Object.entries(m).sort((a,b)=>b[1].rev-a[1].rev).map(([k,x])=>[`<b>${k}</b>`,dec(x.q)+' '+x.u,money(x.rev),money(x.cost),money(x.rev-x.cost)]))+'<p class="hint" style="margin:8px 0 0">Doanh thu theo dòng, chưa trừ giảm giá cả đơn.</p>';
  }else{
    body=tbl([['Số phiếu'],['Ngày'],['Khách'],['Trạng thái'],['Tổng đơn',1],['Đã thu',1],['Chưa thu',1]],
      all.filter(o=>oCalc(o).remain>0).sort((a,b)=>a.date.localeCompare(b.date)).map(o=>{const c=oCalc(o);return [`<b>${o.no}</b>`,dmy(o.date),esc((custOf(o.cust)||{}).name),`<span class="pill ${STAT_CLASS[o.status]}">${o.status}</span>`,money(c.total),money(c.paid),`<b class="bad">${money(c.remain)}</b>`]}));
  }
  $('#main').innerHTML=`<div class="top"><h1>Lợi nhuận</h1><div class="f" style="min-width:200px"><label for="prMonth">Kỳ báo cáo</label><select id="prMonth"></select></div></div>
  <div class="kpis"><div class="kpi"><small>Lợi nhuận</small><b class="${T.profit<0?'bad':'good'}">${money(T.profit)}</b></div><div class="kpi"><small>Doanh thu</small><b>${money(T.total)}</b></div><div class="kpi"><small>Giá nhập</small><b>${money(T.cost)}</b></div><div class="kpi"><small>Chi phí giao</small><b>${money(T.shipCost)}</b></div><div class="kpi"><small>Hoa hồng môi giới</small><b>${money(T.comm)}</b></div><div class="kpi"><small>% lãi</small><b>${pct(T.profit,T.total)}</b></div></div>
  <section class="card"><div class="seg" style="margin-bottom:12px;flex-wrap:wrap">${tabs.map(([k,t])=>`<button type="button" data-act="prtab" data-v="${k}" aria-pressed="${PR.tab===k}">${t}</button>`).join('')}</div>${body}
  <p class="hint" style="margin:8px 0 0">Tính trên đơn hàng đã chốt trở lên, không gồm báo giá và đơn nháp. Lợi nhuận = tổng đơn − giá nhập − chi phí giao thực tế − hoa hồng.</p></section>`;
  fill($('#prMonth'),[{v:'',t:'Tất cả các tháng'}].concat(months.slice().reverse().map(m=>({v:m,t:mlabel(m)}))),PR.month);
  $('#prMonth').onchange=e=>{PR.month=e.target.value;viewProfit()};
}

/* ================= Cài đặt ================= */
function viewSettings(){
  const S=DB.settings;
  $('#main').innerHTML=`<div class="top"><h1>Cài đặt</h1></div><section class="card"><div class="fields">
   <div class="f" style="grid-column:1/-1"><label for="s-shop">Tên cửa hàng (hiện trên phiếu và ảnh QR)</label><input id="s-shop"></div>
   <div class="f"><label for="s-markup">Giá bán gợi ý = giá nhập + (đ)</label><input id="s-markup" type="number" step="1000"></div>
   <div class="f"><label for="s-advPct">Tạm ứng cắt hàng (% tổng đơn)</label><input id="s-advPct" type="number"></div>
   <div class="f"><label for="s-bank">Ngân hàng nhận tiền</label><select id="s-bank"><option value="970436">Vietcombank</option><option value="970422">MB (Quân đội)</option><option value="970415">VietinBank</option><option value="970407">Techcombank</option><option value="970418">BIDV</option><option value="">Ngân hàng khác (nhập BIN)</option></select></div>
   <div class="f"><label for="s-bin">Mã ngân hàng (BIN)</label><input id="s-bin"></div>
   <div class="f"><label for="s-acc">Số tài khoản nhận tiền</label><input id="s-acc"></div>
   <div class="f"><label for="s-accName">Tên chủ tài khoản</label><input id="s-accName"></div></div>
   <div class="row" style="margin-top:12px"><button type="button" class="primary" data-act="set-save">Lưu cài đặt</button></div>
   <p class="hint" style="margin:10px 0 0">Số tài khoản phải đúng tài khoản nhận tiền: SePay chỉ ghi nhận giao dịch vào tài khoản này, và mã QR trên phiếu dùng tài khoản này. BIN: 970422 MB, 970436 Vietcombank, 970415 VietinBank, 970407 Techcombank, 970418 BIDV.</p></section>`;
  ['shop','markup','advPct','bin','acc','accName'].forEach(k=>{const el=$('#s-'+k);el.value=S[k];el.addEventListener('input',()=>{S[k]=['markup','advPct'].includes(k)?nz(el.value):el.value});});
  const bk=$('#s-bank');bk.value=[...bk.options].some(o=>o.value===S.bin)?S.bin:'';
  bk.addEventListener('input',()=>{if(bk.value){S.bin=bk.value;$('#s-bin').value=bk.value}});
  $('#s-bin').addEventListener('input',()=>{const v=$('#s-bin').value.trim();bk.value=[...bk.options].some(o=>o.value===v)?v:''});
}
/* ================= Giao dịch ngân hàng ================= */
const TXS={unmatched:'Chưa đối soát',matched:'Đã ghép đơn',ignored:'Bỏ qua'};
function viewTx(){
  const orderNo=id=>{const o=DB.orders.find(x=>x.id===id);return o?o.no:''};
  const open=DB.orders.filter(o=>oCalc(o).remain>0).sort((a,b)=>b.date.localeCompare(a.date));
  const opts=`<option value="">Chọn đơn...</option>`+open.map(o=>`<option value="${o.id}">${o.no} · ${esc((custOf(o.cust)||{}).name||'')} · còn ${money(oCalc(o).remain)}</option>`).join('');
  const un=DB.txs.filter(t=>t.status==='unmatched'),rest=DB.txs.filter(t=>t.status!=='unmatched');
  const when=t=>{const d=new Date(t.transaction_date||t.created_at);return d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})};
  const unRows=un.map(t=>`<tr data-tx="${t.id}"><td>${when(t)}</td><td class="num"><b>${money(t.amount)}</b></td><td>${esc(t.content)}</td><td><select class="txorder" style="max-width:280px">${opts}</select></td><td style="white-space:nowrap"><button type="button" class="primary sm" data-act="txassign">Gán vào đơn</button> <button type="button" class="ghost sm" data-act="txignore">Bỏ qua</button></td></tr>`).join('');
  const restRows=rest.slice(0,100).map(t=>`<tr><td>${when(t)}</td><td class="num">${money(t.amount)}</td><td>${esc(t.content)}</td><td><span class="pill ${t.status==='matched'?'good':''}">${TXS[t.status]}</span></td><td>${t.status==='matched'?`<b>${esc(orderNo(t.order_id))}</b>${t.excess>0?` · dư ${money(t.excess)} vào số dư có`:''}`:esc(t.note)}</td></tr>`).join('');
  $('#main').innerHTML=`<div class="top"><h1>Giao dịch ngân hàng</h1><button type="button" data-act="reload">Tải lại</button></div><div class="col">
  <section class="card"><h2>Chưa đối soát <span class="hint">${un.length} giao dịch</span></h2>
   <div class="tw"><table><thead><tr><th>Thời gian</th><th class="num">Số tiền</th><th>Nội dung chuyển khoản</th><th>Đơn</th><th></th></tr></thead><tbody>${unRows||'<tr><td colspan="5" class="empty">Không có giao dịch nào chờ xử lý.</td></tr>'}</tbody></table></div>
   <p class="hint" style="margin:8px 0 0">Tiền chuyển vào mà nội dung không có mã đơn sẽ nằm ở đây. Gán vào đơn thì tự ghi khoản thu; phần dư (nếu có) thành số dư có của khách.</p></section>
  <section class="card"><h2>Đã xử lý gần đây</h2><div class="tw"><table><thead><tr><th>Thời gian</th><th class="num">Số tiền</th><th>Nội dung</th><th>Trạng thái</th><th>Kết quả</th></tr></thead><tbody>${restRows||'<tr><td colspan="5" class="empty">Chưa có giao dịch.</td></tr>'}</tbody></table></div>
   <p class="hint" style="margin:8px 0 0">Giao dịch từ SePay chỉ xuất hiện sau khi bước kết nối webhook được cài (làm ở bước sau).</p></section></div>`;
}
const VIEW={tongquan:viewDash,don:viewOrders,khach:()=>viewCrud('customers'),mahang:viewMahang,ncc:()=>viewCrud('suppliers'),moigioi:()=>viewCrud('brokers'),loinhuan:viewProfit,giaodich:viewTx,caidat:viewSettings};

/* ================= Sự kiện (ủy quyền) ================= */
function CRcoll(){return view==='khach'?'customers':view==='ncc'?'suppliers':'brokers'}
const keepScroll=fn=>{const y=window.scrollY;fn();window.scrollTo(0,y)};
let BUSY=false;
/* chạy một thao tác ghi: khóa giao diện, bắt lỗi, báo cho người dùng */
async function work(fn){
  if(BUSY)return false;
  BUSY=true;document.body.classList.add('busy');
  try{await fn();return true}
  catch(e){console.error(e);toast(errText(e));return false}
  finally{BUSY=false;document.body.classList.remove('busy')}
}
/* ghi xong thì tải lại dữ liệu và vẽ lại màn hình hiện tại, giữ vị trí cuộn */
async function mut(fn,msg){
  return work(async()=>{await fn();await loadAll();const y=window.scrollY;if(ED&&view==='don')editor();else VIEW[view]();window.scrollTo(0,y);renderNav();if(msg)toast(msg)});
}
const sameLine=(a,b)=>['sup','pin','pout','color','w','dai','n','qty'].every(k=>String(a[k]==null?'':a[k])===String(b[k]==null?'':b[k]));
/* lưu đơn đang sửa: thông tin đơn, các dòng (chỉ dòng đổi), khoản thu, rồi trạng thái */
async function persistED(){
  const o=ED,orig=DB.orders.find(x=>x.id===o.id)||{lines:[],pays:[]};
  await Q(sb.from('orders').update(orderRow(o)).eq('id',o.id));
  const keep=new Set(o.lines.filter(l=>l.id).map(l=>l.id));
  const del=orig.lines.filter(l=>!keep.has(l.id)).map(l=>l.id);
  if(del.length)await Q(sb.from('order_lines').delete().in('id',del));
  const olds={};orig.lines.forEach(l=>olds[l.id]=l);
  const adds=[];
  for(let i=0;i<o.lines.length;i++){
    const l=o.lines[i];
    if(!l.id){adds.push(lineRow(l,i,o.id));continue}
    const was=olds[l.id],pos=orig.lines.indexOf(was);
    if(!was||pos!==i||!sameLine(l,was))await Q(sb.from('order_lines').update(lineRow(l,i,o.id)).eq('id',l.id));
  }
  if(adds.length)await Q(sb.from('order_lines').insert(adds));
  const keepP=new Set(o.pays.filter(p=>p.id).map(p=>p.id));
  for(const p of orig.pays.filter(p=>!keepP.has(p.id)))await Q(sb.from('payments').delete().eq('id',p.id));
  const newP=o.pays.filter(p=>!p.id).map(p=>({order_id:o.id,kind:p.kind,amount:Math.round(p.amt),paid_on:p.d,source:'manual',note:p.note||''}));
  if(newP.length)await Q(sb.from('payments').insert(newP));
  const cur=await Q(sb.from('orders').select('status').eq('id',o.id).single());
  const want=STC[o.status];
  if(want&&want!==cur.status)await Q(sb.from('orders').update({status:want}).eq('id',o.id));
}
async function dropDraft(){
  if(ED&&EDnew){try{await Q(sb.from('orders').delete().eq('id',ED.id))}catch(e){console.error(e)}}
}
const ACT={
  nav:b=>go(b.dataset.v),
  logout:async()=>{await sb.auth.signOut();ED=null;showLogin()},
  reload:()=>mut(async()=>{}),
  'dash-stat':b=>{F.stat=b.dataset.s;F.cust='';ED=null;go('don')},
  new:()=>{
    if(!DB.customers.length){toast('Hãy thêm khách hàng trước');go('khach');return}
    if(!DB.items.length){toast('Hãy thêm mã hàng trước');go('mahang');return}
    work(async()=>{
      const d=await Q(sb.from('orders').insert({customer_id:DB.customers[0].id,order_date:vnToday(),doc_type:'DH'}).select('id').single());
      await loadAll();openEditor(DB.orders.find(o=>o.id===d.id),true);
    });
  },
  open:b=>{const o=DB.orders.find(o=>o.id===b.dataset.id);if(o)openEditor(o,false)},
  back:async()=>{await dropDraft();ED=null;await work(async()=>{await loadAll()});viewOrders();renderNav()},
  cancel:async()=>{await dropDraft();ED=null;await work(async()=>{await loadAll()});viewOrders();renderNav();toast('Đã hủy thay đổi')},
  delorder:async()=>{
    if(!confirm('Xóa đơn nháp này?'))return;
    await work(async()=>{await Q(sb.from('orders').delete().eq('id',ED.id));ED=null;await loadAll()});
    if(!ED){viewOrders();renderNav();toast('Đã xóa đơn')}
  },
  save:()=>work(async()=>{await persistED();ED=null;await loadAll();viewOrders();renderNav();toast('Đã lưu')}),
  credit:()=>{
    const amt=Math.round(nz($('#creditAmt').value));
    if(amt<=0){toast('Nhập số tiền áp dụng');return}
    work(async()=>{
      await persistED();
      await Q(sb.rpc('apply_credit',{p_order:ED.id,p_amount:amt}));
      await loadAll();ED=clone(DB.orders.find(x=>x.id===ED.id));editor();toast('Đã áp dụng '+money(amt)+' từ số dư có');
    });
  },
  doctype:b=>{ED.type=b.dataset.v;calc()},
  kind:b=>setKind(b.dataset.v),
  out:b=>{OUT=b.dataset.v;calc()},
  addline:()=>{
    readDraft();
    const mkl=D.k==='tam'?{k:'tam',pid:D.pid,color:D.color,ly:D.ly,w:D.w,dai:D.dai,n:D.n}:{k:'pk',aid:D.aid,qty:D.qty};
    if(lineQty(mkl)<=0){toast('Nhập chiều dài, số tấm hoặc số lượng');return}
    if(!ITEM[keyOf(mkl)]){toast('Chưa có mã hàng này, thêm ở mục Mã hàng');return}
    mkl.sup=cheapestSup(keyOf(mkl));mkl.pin=costAt(keyOf(mkl),mkl.sup,ED.date);
    mkl.pout=mkl.pin!=null?mkl.pin+nz(DB.settings.markup):0;mkl.manual=false;
    ED.lines.push(mkl);renderLines();
  },
  delline:b=>{ED.lines.splice(+b.dataset.i,1);renderLines()},
  linepanel:b=>{const l=ED.lines[+b.dataset.i];l.open=l.open===b.dataset.v?null:b.dataset.v;renderLines()},
  linesup:b=>{const l=ED.lines[+b.dataset.i];l.sup=b.dataset.s;l.pin=costAt(keyOf(l),l.sup,ED.date);if(!l.manual&&l.pin!=null)l.pout=l.pin+nz(DB.settings.markup);renderLines()},
  linereset:b=>{const l=ED.lines[+b.dataset.i];if(l.pin==null){toast('NCC này chưa có giá nhập');return}l.pout=l.pin+nz(DB.settings.markup);l.manual=false;renderLines()},
  linepick:b=>{const l=ED.lines[+b.dataset.i];l.pout=+b.dataset.p;l.manual=true;renderLines();toast('Đã dùng giá '+money(+b.dataset.p))},
  advauto:()=>{ED.advManual=false;calc()},
  payadd:()=>{const a=nz($('#payAmt').value);if(a<=0){toast('Nhập số tiền thực thu');return}recordPay(a,$('#payKind').value);$('#payAmt').value=''},
  payquick:()=>{if(nz(ED.advance)>0)recordPay(nz(ED.advance),'adv')},
  paydel:b=>{
    ED.pays.splice(+b.dataset.i,1);
    const ap=ED.pays.filter(p=>p.kind==='adv').reduce((s,p)=>s+p.amt,0);
    if(ap>0)ED.advance=ap;else ED.advManual=false;
    $('#e-advance').value=ED.advance;autoComplete();calc();
  },
  exp:b=>exportImg(b.dataset.id),
  /* giao dịch ngân hàng */
  txassign:b=>{
    const tr=b.closest('[data-tx]'),oid=$('.txorder',tr).value;
    if(!oid){toast('Chọn đơn cần gán');return}
    mut(async()=>{const r=await Q(sb.rpc('assign_bank_tx',{p_tx:tr.dataset.tx,p_order:oid}));toast('Đã ghi nhận '+money(r.applied)+(r.excess>0?', dư '+money(r.excess)+' vào số dư có':''))});
  },
  txignore:b=>{const tr=b.closest('[data-tx]');mut(async()=>{await Q(sb.rpc('ignore_bank_tx',{p_tx:tr.dataset.tx,p_note:'Bỏ qua thủ công'}))},'Đã bỏ qua giao dịch')},
  /* mã hàng */
  pmtab:b=>{PM.tab=b.dataset.v;viewMahang()},
  'pm-edit':b=>{const e=b.closest('[data-key]'),k=e.dataset.key+'@'+e.dataset.sup;PME[k]=!PME[k];keepScroll(viewMahang)},
  costhist:b=>{const k=b.dataset.key+'@'+b.dataset.sup;PXH[k]=!PXH[k];keepScroll(viewMahang)},
  'pm-addsup':b=>{const k=b.closest('[data-key]').dataset.key;PMA[k]=!PMA[k];keepScroll(viewMahang)},
  setcost:b=>{
    const box=b.closest('[data-key]'),v=Math.round(nz($('.newp',box).value)),h=DB.costs[box.dataset.key][box.dataset.sup],last=lastOf(h);
    if(v<=0){toast('Nhập giá mới');return}
    if(v===last.p){toast('Giá không đổi');return}
    const key=box.dataset.key,sup=box.dataset.sup;
    mut(async()=>{await Q(sb.rpc('set_cost_price',{p_item:ITEM[key],p_supplier:sup,p_price:v}));PME[key+'@'+sup]=false},'Đã lưu giá mới, giá cũ giữ trong lịch sử');
  },
  addsup:b=>{
    const box=b.closest('[data-key]'),v=Math.round(nz($('.addp',box).value)),key=box.dataset.key,sup=$('.addsup',box).value;
    if(v<=0){toast('Nhập giá nhập');return}
    mut(async()=>{await Q(sb.rpc('set_cost_price',{p_item:ITEM[key],p_supplier:sup,p_price:v}));PMA[key]=false},'Đã thêm giá nhập');
  },
  addly:b=>{
    const sec=b.closest('[data-pid]'),v=nz($('.newly',sec).value),t=tamOf(sec.dataset.pid);
    if(v<=0){toast('Nhập độ ly');return}
    if(t.lys.includes(v)){toast('Độ ly này đã có');return}
    mut(async()=>{await Q(sb.from('items').insert({kind:'tam',product_id:t.id,ly:v,code:''}))},'Đã thêm độ ly. Sang Bảng giá nhập để thêm giá cho mã mới');
  },
  addcolor:b=>{
    const sec=b.closest('[data-pid]'),v=$('.newcolor',sec).value.trim(),t=tamOf(sec.dataset.pid);
    if(v&&!t.colors.includes(v))mut(async()=>{await Q(sb.from('products').update({colors:t.colors.concat([v])}).eq('id',t.id))});
  },
  delcolor:b=>{const t=tamOf(b.closest('[data-pid]').dataset.pid);mut(async()=>{await Q(sb.from('products').update({colors:t.colors.filter(c=>c!==b.dataset.c)}).eq('id',t.id))})},
  addwidth:()=>{
    const v=+String($('#newW').value).replace(',','.');
    if(!(v>0)||v>=1000){toast('Nhập khổ rộng bằng mét, ví dụ 1.22');return}
    if(DB.widths.includes(Math.round(v*100)/100)){toast('Khổ này đã có');return}
    mut(async()=>{await Q(sb.from('widths').insert({value:v}))},'Đã thêm khổ '+dec(v)+'m');
  },
  delwidth:b=>{mut(async()=>{await Q(sb.from('widths').delete().eq('value',+b.dataset.w))})},
  addprod:()=>{
    const name=$('#npName').value.trim(),code=$('#npCode').value.trim().toUpperCase(),ly=nz($('#npLy').value);
    if(!name||!code){toast('Nhập tên hàng và mã');return}
    mut(async()=>{
      const p=await Q(sb.from('products').insert({code,name,colors:['Trong suốt']}).select('id').single());
      if(ly>0)await Q(sb.from('items').insert({kind:'tam',product_id:p.id,ly,code:''}));
    },'Đã thêm tên hàng');
  },
  addpk:()=>{
    const name=$('#npkName').value.trim(),unit=$('#npkUnit').value.trim(),code=$('#npkCode').value.trim().toUpperCase();
    if(!name||!unit){toast('Nhập tên và đơn vị');return}
    mut(async()=>{await Q(sb.from('items').insert({kind:'pk',code:code||name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]/g,'').slice(0,4).toUpperCase(),name,unit}))},'Đã thêm phụ kiện');
  },
  /* khách, NCC, môi giới */
  'crud-save':b=>{
    const coll=b.dataset.coll,cfg=CFG[coll],row={},id=CR.edit&&CR.edit.id;
    cfg.fields.forEach(([k])=>{row[k]=k==='pct'?nz($('#cr-'+k).value):$('#cr-'+k).value.trim()});
    if(!row.name){toast('Nhập tên');return}
    if(coll==='customers'){
      let code=String(row.code||'').replace(/\D/g,'').slice(0,3);
      if(code)code=code.padStart(3,'0');
      if(code&&DB.customers.some(c=>c.id!==id&&c.code===code)){toast('Mã KH '+code+' đã có, chọn mã khác');return}
      if(code)row.code=code;else if(id)delete row.code;else row.code='';
    }
    mut(async()=>{
      if(id)await Q(sb.from(coll).update(row).eq('id',id));else await Q(sb.from(coll).insert(row));
      CR.edit=null;
    },'Đã lưu');
  },
  'crud-edit':b=>{CR.edit={coll:CRcoll(),id:b.dataset.id};VIEW[view]();window.scrollTo(0,0)},
  'crud-cancel':()=>{CR.edit=null;VIEW[view]()},
  'crud-del':b=>{
    const coll=CRcoll(),id=b.dataset.id;
    if(!confirm('Xóa mục này?'))return;
    mut(async()=>{await Q(sb.from(coll).delete().eq('id',id))},'Đã xóa');
  },
  'crud-sel':b=>{const coll=CRcoll();CR.sel[coll]=CR.sel[coll]===b.dataset.id?null:b.dataset.id;VIEW[view]()},
  prtab:b=>{PR.tab=b.dataset.v;viewProfit()},
  'set-save':()=>{
    const S=DB.settings;
    mut(async()=>{await Q(sb.from('settings').update({shop_name:S.shop,markup:Math.round(nz(S.markup)),advance_pct:nz(S.advPct),bank_bin:String(S.bin).trim(),bank_account:String(S.acc).trim(),bank_account_name:String(S.accName).trim()}).eq('id',true))},'Đã lưu cài đặt');
  }
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');
  if(!b||!ACT[b.dataset.act])return;
  ACT[b.dataset.act](b);
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(!ED||t.dataset.i==null||!t.dataset.f)return;
  const l=ED.lines[+t.dataset.i],f=t.dataset.f;
  if(f==='sup'){l.sup=t.value;l.pin=costAt(keyOf(l),l.sup,ED.date);if(!l.manual&&l.pin!=null)l.pout=l.pin+nz(DB.settings.markup);renderLines();return}
  l[f]=nz(t.value);if(f==='pout')l.manual=true;calc();
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;
  const r=e.target.closest&&e.target.closest('tr[data-act]');
  if(r&&ACT[r.dataset.act])ACT[r.dataset.act](r);
});

/* ================= Đăng nhập và khởi động ================= */
function renderNav(){
  if(!$('#nav').innerHTML)return;
  const unm=DB.txs.filter(t=>t.status==='unmatched').length;
  const b=$('#nav [data-v="giaodich"]');
  if(b)b.innerHTML='Giao dịch'+(unm?`<span class="badge">${unm}</span>`:'');
}
function showLogin(msg){
  $('#nav').innerHTML='';
  $('#main').innerHTML=`<div class="login"><form class="card" id="loginForm" autocomplete="on"><h1>Lên đơn</h1><p class="hint" style="margin:0">Đăng nhập để xem đơn hàng, giá nhập và lợi nhuận.</p>
    <div class="f"><label for="lgEmail">Email</label><input id="lgEmail" type="email" autocomplete="username" required></div>
    <div class="f"><label for="lgPass">Mật khẩu</label><input id="lgPass" type="password" autocomplete="current-password" required></div>
    <div class="err" id="lgErr" role="alert">${esc(msg||'')}</div>
    <button class="primary" type="submit" id="lgBtn">Đăng nhập</button></form></div>`;
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('#lgBtn');btn.disabled=true;$('#lgErr').textContent='';
    const {error}=await sb.auth.signInWithPassword({email:$('#lgEmail').value.trim(),password:$('#lgPass').value});
    if(error){$('#lgErr').textContent=/invalid/i.test(error.message)?'Sai email hoặc mật khẩu':errText(error);btn.disabled=false;return}
    boot();
  });
}
function showFatal(title,text,withLogout){
  $('#nav').innerHTML='';
  $('#main').innerHTML=`<div class="login"><div class="card"><h1>${esc(title)}</h1><p>${esc(text)}</p><div class="row"><button type="button" class="primary" id="retry">Thử lại</button>${withLogout?'<button type="button" id="outBtn">Đăng xuất</button>':''}</div></div></div>`;
  $('#retry').onclick=boot;
  if(withLogout)$('#outBtn').onclick=async()=>{await sb.auth.signOut();showLogin()};
}
let LAST_LOAD=0;
async function boot(){
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session){showLogin();return}
    $('#main').innerHTML='<div class="empty">Đang tải dữ liệu...</div>';
    TODAY=vnToday();await loadAll();LAST_LOAD=Date.now();
  }catch(e){
    if(e&&e.message==='NOT_OWNER')showFatal('Tài khoản này chưa được cấp quyền','Dữ liệu chỉ mở cho tài khoản chủ. Kiểm tra lại bước gán chủ sở hữu trong hướng dẫn cài đặt, hoặc đăng nhập bằng đúng tài khoản.',true);
    else showFatal('Không tải được dữ liệu',errText(e),true);
    return;
  }
  const h=location.hash.slice(1);if(VIEWS.some(x=>x[0]===h))view=h;
  ED=null;render();
}
/* tự cập nhật khi quay lại tab hoặc mỗi phút, chỉ ở các màn hình chỉ xem để không mất dữ liệu đang nhập */
async function softRefresh(){
  if(BUSY||ED||document.hidden||!LAST_LOAD||Date.now()-LAST_LOAD<20000)return;
  if(!['tongquan','giaodich','don'].includes(view))return;
  if(document.activeElement&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;
  try{await loadAll();LAST_LOAD=Date.now();VIEW[view]();renderNav()}catch(e){console.error(e)}
}
window.addEventListener('focus',softRefresh);
document.addEventListener('visibilitychange',softRefresh);
setInterval(softRefresh,60000);
sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'&&!$('#loginForm')){ED=null;showLogin()}});
boot();

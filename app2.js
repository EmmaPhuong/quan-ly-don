/* =====================================================================
   Danh mục + Thuộc tính, Mua hàng (trả NCC), Doanh thu + Quỹ, Phiếu & QR,
   Giao dịch ngân hàng, tìm kiếm chung và liên kết giữa các màn hình.
   Nạp sau app.js (xem loader.js).
   ===================================================================== */
const byId=(a,id)=>a.find(x=>x.id===id);
const catName=id=>(byId(DB.cats,id)||{}).name||'Chưa phân nhóm';
const attrName=(k,id)=>(byId(DB.attrs[k]||[],id)||{}).name||'';
const orderById=id=>DB.orders.find(o=>o.id===id);
const oLink=o=>o?`<a href="#" class="lnk" data-act="goto-order" data-id="${o.id}"><b>${esc(o.no)}</b></a>`:'';
const cLink=id=>{const c=custOf(id);return c?`<a href="#" class="lnk" data-act="goto-cust" data-id="${c.id}">${esc(c.name)}</a>`:''};
const sLink=id=>`<a href="#" class="lnk" data-act="goto-sup" data-id="${id}">${esc(supName(id))}</a>`;
const rLink=r=>r?`<a href="#" class="lnk" data-act="goto-tx" data-ref="${esc(r)}"><b>${esc(r)}</b></a>`:'';
const vnDate=iso=>iso?new Date(iso).toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}):'';
const vnTime=iso=>iso?new Date(iso).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const FUND={cash:'Tiền mặt',bank:'Ngân hàng'};
const CAT={form:null,q:''}, ATT={add:{}}, PUR={sup:'',method:'own'}, REP={tab:'ngay',month:''}, DOCS={q:'',stat:'',id:null,tab:'khach'}, TXF={q:''};
PM.tab='danhmuc';
const btn=(label,act,data,cls)=>`<button type="button" class="${cls||'ghost sm'}" data-act="${act}"${Object.entries(data||{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')}>${label}</button>`;
const xbtn=(act,data)=>`<button type="button" class="x" data-act="${act}"${Object.entries(data||{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('')} aria-label="Xóa">×</button>`;
const supCostOf=(o,sup)=>o.lines.reduce((s,l)=>s+(l.sup===sup&&l.pin!=null?Math.round(lineQty(l)*l.pin):0),0);

/* ================= Danh mục hàng ================= */
function catHead(){
  return `<div class="top"><h1>Danh mục hàng</h1><div class="seg">${[['danhmuc','Danh mục'],['bang','Bảng giá nhập'],['thuoctinh','Thuộc tính']].map(([k,t])=>`<button type="button" data-act="pmtab" data-v="${k}" aria-pressed="${PM.tab===k}">${t}</button>`).join('')}</div></div>`;
}
function viewCatalog(){
  if(PM.tab==='bang')return priceTab();
  if(PM.tab==='thuoctinh')return attrTab();
  return catalogTab();
}
function priceTab(){
  $('#main').innerHTML=`${catHead()}
  <section class="card"><div class="fields" style="margin-bottom:12px;max-width:760px">
    <div class="f" style="grid-column:span 2"><label for="pmQ">Tìm mã hàng, tên, độ ly hoặc NCC</label><input id="pmQ" type="search" placeholder="VD: PCD-20, đặc ruột, An Phát"></div>
    <div class="f"><label for="pmKind">Loại</label><select id="pmKind"></select></div>
    <div class="f"><label for="pmSup">Nhà cung cấp</label><select id="pmSup"></select></div></div>
    <div id="pmTable"></div>
    <p class="hint" style="margin:8px 0 0">Một mã hàng có nhiều dòng khi lấy của nhiều nhà cung cấp. Đổi giá sẽ thêm một dòng lịch sử, giá cũ vẫn giữ nguyên. Giá bán chỉ phụ thuộc tên hàng và độ ly.</p></section>`;
  $('#pmQ').value=PM.q;
  fill($('#pmKind'),[{v:'',t:'Tất cả'},{v:'tam',t:'Tấm nhựa'},{v:'pk',t:'Phụ kiện'}],PM.kind);
  fill($('#pmSup'),[{v:'',t:'Tất cả NCC'}].concat(DB.suppliers.map(s=>({v:s.id,t:s.name}))),PM.sup);
  const upd=()=>{$('#pmTable').innerHTML=pmTable()};upd();
  $('#pmQ').addEventListener('input',e=>{PM.q=e.target.value;upd()});
  $('#pmKind').addEventListener('input',e=>{PM.kind=e.target.value;upd()});
  $('#pmSup').addEventListener('input',e=>{PM.sup=e.target.value;upd()});
}
function catalogTab(){
  const q=norm(CAT.q.trim());
  const match=(...a)=>!q||norm(a.join(' ')).includes(q);
  const groups=DB.cats.slice();
  if(DB.tam.some(t=>!t.cat)||DB.pk.some(a=>!a.cat))groups.push({id:'',name:'Chưa phân nhóm',description:'Bấm Sửa ở từng dòng để chọn nhóm cho hàng này.',virtual:true});
  let body='';
  groups.forEach(g=>{
    const prods=DB.tam.filter(t=>t.cat===g.id&&match(t.code,t.name,t.desc,attrName('brand',t.brand),attrName('material',t.material)));
    const pks=DB.pk.filter(a=>a.cat===g.id&&match(a.code,a.name,a.desc));
    if(q&&!prods.length&&!pks.length)return;
    body+=`<tr class="grp"><td colspan="5"><div class="row" style="justify-content:space-between"><span><b>${esc(g.name)}</b> <span class="hint">${esc(g.description||'')}</span></span>${g.virtual?'':`<span class="row">${btn('+ Sản phẩm tấm','cat-form',{t:'prod',cat:g.id})}${btn('+ Phụ kiện','cat-form',{t:'pk',cat:g.id})}${btn('Sửa nhóm','cat-form',{t:'cat',id:g.id})}${xbtn('cat-del',{id:g.id})}</span>`}</div></td></tr>`;
    prods.forEach(t=>{
      body+=`<tr><td><b>${esc(t.code)}</b></td><td><b>${esc(t.name)}</b><br><span class="hint">${esc(t.desc)}</span></td>
        <td>${[attrName('brand',t.brand),attrName('material',t.material)].filter(Boolean).map(esc).join(' · ')||'<span class="hint">—</span>'}</td>
        <td><div class="row" style="gap:4px">${t.colors.map(c=>`<span class="tag" style="padding-right:10px">${esc(c)}</span>`).join('')||'<span class="hint">Chưa chọn màu</span>'}</div>
          <div class="row" style="gap:4px;margin-top:6px">${t.lys.map(ly=>`<span class="pill acc">${esc(maTam(t.id,ly))} · ${dec(ly)} ly ${xbtn('ly-del',{pid:t.id,ly})}</span>`).join('')}${btn('+ Độ ly','cat-form',{t:'ly',pid:t.id})}</div></td>
        <td style="white-space:nowrap">${btn('Sửa','cat-form',{t:'prod',id:t.id})}${xbtn('prod-del',{id:t.id})}</td></tr>`;
    });
    pks.forEach(a=>{
      body+=`<tr><td><b>${esc(a.code)}</b></td><td><b>${esc(a.name)}</b><br><span class="hint">${esc(a.desc)}</span></td><td>Đơn vị: ${esc(a.unit)}</td><td><span class="hint">Phụ kiện, không có màu/độ ly</span></td>
        <td style="white-space:nowrap">${btn('Sửa','cat-form',{t:'pk',id:a.id})}${xbtn('pk-del',{id:a.id})}</td></tr>`;
    });
    if(!prods.length&&!pks.length)body+='<tr><td colspan="5" class="hint">Chưa có hàng trong nhóm này. Bấm + Sản phẩm tấm hoặc + Phụ kiện ở trên.</td></tr>';
  });
  $('#main').innerHTML=`${catHead()}<div class="col">${catForm()}
  <section class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="f" style="min-width:260px"><label for="catQ">Tìm trong danh mục</label><input id="catQ" type="search" placeholder="Mã, tên, thương hiệu..."></div>${btn('+ Nhóm hàng','cat-form',{t:'cat'},'primary')}</div>
   <div class="tw"><table><thead><tr><th>Mã</th><th>Tên và mô tả</th><th>Thương hiệu · Chất liệu</th><th>Biến thể: màu và độ ly</th><th></th></tr></thead><tbody>${body||'<tr><td colspan="5" class="empty">Chưa có nhóm hàng nào. Bấm + Nhóm hàng.</td></tr>'}</tbody></table></div>
   <p class="hint" style="margin:8px 0 0">Mỗi độ ly của một sản phẩm là một mã hàng (SKU) có giá riêng. Màu và khổ rộng chỉ để chọn trên đơn, không đổi giá. Giá nhập từng NCC nhập ở tab Bảng giá nhập.</p></section></div>`;
  $('#catQ').value=CAT.q;
  $('#catQ').addEventListener('input',e=>{CAT.q=e.target.value;const p=e.target.selectionStart;catalogTab();const el=$('#catQ');el.focus();try{el.setSelectionRange(p,p)}catch(x){}});
  catFormFill();
}
function catForm(){
  const f=CAT.form;if(!f)return '';
  const catOpts=DB.cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const attrOpts=k=>'<option value="">(không chọn)</option>'+DB.attrs[k].map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
  let title='',fields='';
  if(f.t==='cat'){
    title=f.id?'Sửa nhóm hàng':'Thêm nhóm hàng';
    fields=`<div class="f"><label for="cf-name">Tên nhóm</label><input id="cf-name"></div><div class="f" style="grid-column:1/-1"><label for="cf-desc">Mô tả ngắn</label><input id="cf-desc"></div>`;
  }else if(f.t==='prod'){
    title=f.id?'Sửa sản phẩm tấm':'Thêm sản phẩm tấm';
    fields=`<div class="f"><label for="cf-cat">Nhóm hàng</label><select id="cf-cat"><option value="">(chưa phân nhóm)</option>${catOpts}</select></div>
      <div class="f"><label for="cf-code">Mã sản phẩm (VD: PCD)</label><input id="cf-code" ${f.id?'disabled':''}></div>
      <div class="f"><label for="cf-name">Tên sản phẩm</label><input id="cf-name"></div>
      <div class="f"><label for="cf-brand">Thương hiệu</label><select id="cf-brand">${attrOpts('brand')}</select></div>
      <div class="f"><label for="cf-material">Chất liệu</label><select id="cf-material">${attrOpts('material')}</select></div>
      ${f.id?'':'<div class="f"><label for="cf-ly">Độ ly đầu tiên (không bắt buộc)</label><input id="cf-ly" type="number" step="0.1"></div>'}
      <div class="f" style="grid-column:1/-1"><label for="cf-desc">Mô tả ngắn</label><input id="cf-desc"></div>
      <div class="f" style="grid-column:1/-1"><span class="lbl">Màu có thể chọn trên đơn (không đổi giá)</span><div class="row" style="gap:6px">${DB.attrs.color.map(a=>`<label class="tag" style="padding-right:10px"><input type="checkbox" class="cf-color" value="${esc(a.name)}"> ${esc(a.name)}</label>`).join('')||'<span class="hint">Chưa có màu. Thêm ở tab Thuộc tính.</span>'}</div></div>`;
  }else if(f.t==='pk'){
    title=f.id?'Sửa phụ kiện':'Thêm phụ kiện';
    fields=`<div class="f"><label for="cf-cat">Nhóm hàng</label><select id="cf-cat"><option value="">(chưa phân nhóm)</option>${catOpts}</select></div>
      <div class="f"><label for="cf-code">Mã (VD: NEP)</label><input id="cf-code" ${f.id?'disabled':''}></div>
      <div class="f"><label for="cf-name">Tên phụ kiện</label><input id="cf-name"></div>
      <div class="f"><label for="cf-unit">Đơn vị tính</label><select id="cf-unit">${DB.attrs.unit.filter(u=>u.name!=='m²').map(a=>`<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('')}</select></div>
      <div class="f" style="grid-column:1/-1"><label for="cf-desc">Mô tả ngắn</label><input id="cf-desc"></div>`;
  }else if(f.t==='ly'){
    const t=tamOf(f.pid)||{name:''};
    title='Thêm độ ly cho '+t.name;
    fields=`<div class="f"><label for="cf-ly">Độ ly</label><input id="cf-ly" type="number" step="0.1"></div>`;
  }
  return `<section class="card" id="catForm"><h2>${esc(title)}</h2><div class="fields">${fields}</div><div class="row" style="margin-top:10px"><button type="button" class="primary" data-act="cat-save">${f.id?'Lưu thay đổi':'Thêm'}</button><button type="button" class="ghost" data-act="cat-cancel">Hủy</button></div></section>`;
}
function catFormFill(){
  const f=CAT.form;if(!f)return;
  const set=(id,v)=>{const el=$('#cf-'+id);if(!el)return;if(v==null){if(el.tagName!=='SELECT')el.value='';return}el.value=v};
  if(f.t==='cat'){const c=f.id?byId(DB.cats,f.id):{};set('name',c.name);set('desc',c.description)}
  else if(f.t==='prod'){
    const t=f.id?tamOf(f.id):{cat:f.cat||'',colors:[]};
    set('cat',t.cat);set('code',t.code);set('name',t.name);set('brand',t.brand);set('material',t.material);set('desc',t.desc);
    $$('.cf-color').forEach(c=>{c.checked=(t.colors||[]).includes(c.value)});
  }else if(f.t==='pk'){
    const a=f.id?pkOf(f.id):{cat:f.cat||''};
    set('cat',a.cat);set('code',a.code);set('name',a.name);set('unit',a.unit);set('desc',a.desc);
  }
  const el=$('#catForm');if(el)el.scrollIntoView({block:'nearest'});
}

/* ================= Thuộc tính ================= */
const ATTR_META={brand:['Thương hiệu','Hãng, nhà sản xuất'],material:['Chất liệu','VD: Polycarbonate, PVC, nhôm'],color:['Màu sắc','Màu không ảnh hưởng giá'],unit:['Đơn vị tính','VD: m², cây, gói, chai']};
function attrUsage(k,a){
  if(k==='brand')return DB.tam.filter(t=>t.brand===a.id).length;
  if(k==='material')return DB.tam.filter(t=>t.material===a.id).length;
  if(k==='color')return DB.tam.filter(t=>t.colors.includes(a.name)).length;
  return DB.pk.filter(p=>p.unit===a.name).length;
}
function attrSection(k){
  const [title,hint]=ATTR_META[k];
  const rows=DB.attrs[k].map(a=>`<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.note)}</td><td class="num">${attrUsage(k,a)}</td><td>${xbtn('attr-del',{k,id:a.id})}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Chưa có.</td></tr>';
  const add=ATT.add[k]?`<div class="row" style="margin-bottom:10px"><input id="at-name-${k}" placeholder="Tên ${title.toLowerCase()}" style="width:200px"><input id="at-note-${k}" placeholder="Ghi chú (không bắt buộc)" style="width:220px">${btn('Thêm','attr-save',{k},'primary sm')}${btn('Hủy','attr-toggle',{k})}</div>`:'';
  return `<section class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h2 style="margin:0">${title} <span class="hint">${hint}</span></h2>${btn('+ Thêm','attr-toggle',{k},'sm')}</div>${add}<div class="tw"><table><thead><tr><th>Tên</th><th>Ghi chú</th><th class="num">Đang dùng</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function attrTab(){
  const usedW=w=>DB.orders.reduce((n,o)=>n+o.lines.filter(l=>l.k==='tam'&&+l.w===+w).length,0);
  const wrows=DB.widths.map(w=>`<tr><td><b>${dec(w)} m</b></td><td></td><td class="num">${usedW(w)}</td><td>${xbtn('delwidth',{w})}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Chưa có khổ rộng nào.</td></tr>';
  const wadd=ATT.add.width?`<div class="row" style="margin-bottom:10px"><input id="newW" type="number" step="0.01" placeholder="Khổ rộng (m), VD 1.22" style="width:200px">${btn('Thêm','addwidth',{},'primary sm')}${btn('Hủy','attr-toggle',{k:'width'})}</div>`:'';
  $('#main').innerHTML=`${catHead()}<div class="col">
  ${['brand','material','color','unit'].map(attrSection).join('')}
  <section class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h2 style="margin:0">Khổ rộng <span class="hint">Chỉ để tính m² trên đơn, không đổi giá</span></h2>${btn('+ Thêm','attr-toggle',{k:'width'},'sm')}</div>${wadd}<div class="tw"><table><thead><tr><th>Khổ</th><th></th><th class="num">Đã dùng trên đơn</th><th></th></tr></thead><tbody>${wrows}</tbody></table></div></section>
  <p class="hint">Các bảng này là dữ liệu gốc: khi tạo sản phẩm, bạn chọn từ đây nên không gõ tay trùng hoặc sai chính tả. Mục đang được dùng thì không xóa được.</p></div>`;
  const first=$('#main input[id^="at-name-"],#newW');if(first)first.focus();
}

/* ================= Mua hàng (trả NCC) ================= */
function supStats(){
  const m={};
  DB.suppliers.forEach(s=>m[s.id]={cost:0,own:0,direct:0,orders:{}});
  repOrders('').forEach(o=>{
    DB.suppliers.forEach(s=>{const c=supCostOf(o,s.id);if(c>0){m[s.id].cost+=c;m[s.id].orders[o.id]=c}});
  });
  DB.sp.forEach(p=>{const x=m[p.sup];if(!x)return;if(p.method==='own')x.own+=p.amt;else x.direct+=p.amt});
  return m;
}
function viewPurchase(){
  const st=supStats();
  const rows=DB.suppliers.map(s=>{const x=st[s.id],debt=x.cost-x.own-x.direct;return `<tr class="${PUR.sup===s.id?'sel':''}"><td><b>${esc(s.name)}</b><br><span class="hint">${esc(s.payment_terms||'')}</span></td><td class="num">${money(x.cost)}</td><td class="num">${money(x.own)}</td><td class="num">${money(x.direct)}</td><td class="num"><b class="${debt>0?'bad':debt<0?'good':''}">${money(debt)}</b></td><td style="white-space:nowrap">${btn(PUR.sup===s.id?'Bỏ lọc':'Xem chi tiết','pur-sel',{id:s.id})}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Chưa có nhà cung cấp. Thêm ở mục Nhà cung cấp.</td></tr>';
  const tot=DB.suppliers.reduce((a,s)=>{const x=st[s.id];a.cost+=x.cost;a.paid+=x.own+x.direct;return a},{cost:0,paid:0});
  let detail='';
  if(PUR.sup&&st[PUR.sup]){
    const x=st[PUR.sup];
    const ors=Object.keys(x.orders).map(id=>orderById(id)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
    const drows=ors.map(o=>{const c=x.orders[o.id],paid=DB.sp.filter(p=>p.sup===PUR.sup&&p.order===o.id).reduce((s,p)=>s+p.amt,0);return `<tr><td>${oLink(o)}</td><td>${dmy(o.date)}</td><td>${cLink(o.cust)}</td><td class="num">${money(c)}</td><td class="num">${money(paid)}</td><td class="num">${money(c-paid)}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Chưa có đơn đã chốt nào lấy hàng của NCC này.</td></tr>';
    detail=`<section class="card"><h2>Đơn có hàng của ${esc(supName(PUR.sup))}</h2><div class="tw"><table><thead><tr><th>Số phiếu</th><th>Ngày</th><th>Khách</th><th class="num">Giá nhập</th><th class="num">Đã trả gắn đơn</th><th class="num">Chưa trả</th></tr></thead><tbody>${drows}</tbody></table></div><p class="hint" style="margin:8px 0 0">Các khoản trả không gắn đơn nào chỉ tính vào công nợ chung của NCC, không nằm ở bảng này.</p></section>`;
  }
  const hist=DB.sp.filter(p=>!PUR.sup||p.sup===PUR.sup).map(p=>{const o=orderById(p.order);return `<tr><td>${dmy(p.d)}</td><td>${sLink(p.sup)}</td><td class="num"><b>${money(p.amt)}</b></td><td>${p.method==='own'?'<span class="pill">Tôi tự chuyển</span>':'<span class="pill acc">Khách chuyển thẳng</span>'}</td><td>${p.method==='own'?FUND[p.fund]||'':'—'}</td><td>${oLink(o)}</td><td>${rLink(p.ref)}</td><td>${esc(p.note)}</td><td>${xbtn('pur-del',{id:p.id})}</td></tr>`}).join('')||'<tr><td colspan="9" class="empty">Chưa có khoản trả nào.</td></tr>';
  $('#main').innerHTML=`<div class="top"><h1>Mua hàng</h1></div><div class="col">
  <div class="kpis"><div class="kpi"><small>Tổng giá nhập (đơn đã chốt)</small><b>${money(tot.cost)}</b></div><div class="kpi"><small>Đã trả NCC (gồm khách trả thẳng)</small><b>${money(tot.paid)}</b></div><div class="kpi"><small>Còn nợ NCC</small><b class="${tot.cost-tot.paid>0?'bad':''}">${money(tot.cost-tot.paid)}</b></div></div>
  <section class="card"><h2>Công nợ phải trả nhà cung cấp</h2><div class="tw"><table><thead><tr><th>Nhà cung cấp</th><th class="num">Giá nhập các đơn</th><th class="num">Tôi đã trả</th><th class="num">Khách trả thẳng</th><th class="num">Còn nợ</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
   <p class="hint" style="margin:8px 0 0">Giá nhập lấy từ các dòng hàng của đơn đã chốt trở lên (báo giá và đơn nháp không tính). Còn nợ = giá nhập − đã trả.</p></section>
  ${detail}
  <section class="card"><h2>Ghi nhận tiền trả NCC</h2>${DB.suppliers.length?`<div class="fields">
    <div class="f"><label for="pf-sup">Nhà cung cấp</label><select id="pf-sup"></select></div>
    <div class="f"><label for="pf-date">Ngày</label><input id="pf-date" type="date"></div>
    <div class="f"><label for="pf-amt">Số tiền</label><input id="pf-amt" type="number" step="1000"></div>
    <div class="f"><label for="pf-method">Hình thức</label><select id="pf-method"></select></div>
    <div class="f" id="pf-fundrow"><label for="pf-fund">Tiền trả từ</label><select id="pf-fund"></select></div>
    <div class="f"><label for="pf-order">Đơn liên quan</label><select id="pf-order"></select></div>
    <div class="f"><label for="pf-ref">Mã giao dịch ngân hàng (nếu có)</label><input id="pf-ref"></div>
    <div class="f"><label for="pf-note">Ghi chú</label><input id="pf-note"></div></div>
    <p class="hint" id="pf-hint" style="margin:8px 0 0"></p>
    <div class="row" style="margin-top:10px"><button type="button" class="primary" data-act="pur-save">Ghi nhận</button></div>`:'<p class="hint">Thêm nhà cung cấp trước.</p>'}</section>
  <section class="card"><h2>Lịch sử trả NCC ${PUR.sup?`<span class="hint">đang lọc: ${esc(supName(PUR.sup))}</span>`:''}</h2><div class="tw"><table><thead><tr><th>Ngày</th><th>NCC</th><th class="num">Số tiền</th><th>Hình thức</th><th>Nguồn tiền</th><th>Đơn</th><th>Mã GD</th><th>Ghi chú</th><th></th></tr></thead><tbody>${hist}</tbody></table></div></section></div>`;
  if(DB.suppliers.length)pfInit();
}
function pfInit(){
  fill($('#pf-sup'),DB.suppliers.map(s=>({v:s.id,t:s.name})),PUR.sup||'');
  $('#pf-date').value=TODAY;
  fill($('#pf-method'),[{v:'own',t:'Tôi tự chuyển cho NCC'},{v:'customer_direct',t:'Khách chuyển thẳng cho NCC'}],PUR.method);
  fill($('#pf-fund'),[{v:'bank',t:'Tài khoản ngân hàng'},{v:'cash',t:'Tiền mặt'}],'bank');
  const refresh=()=>{
    const m=$('#pf-method').value,sup=$('#pf-sup').value;
    PUR.method=m;
    const os=DB.orders.filter(o=>o.type==='DH'&&o.lines.some(l=>l.sup===sup)).sort((a,b)=>b.date.localeCompare(a.date));
    const items=[{v:'',t:m==='own'?'(Không gắn đơn nào)':'Chọn đơn của khách...'}].concat(os.map(o=>({v:o.id,t:`${o.no} · ${(custOf(o.cust)||{}).name||''} · giá nhập ${money(supCostOf(o,sup))}`})));
    fill($('#pf-order'),items,$('#pf-order').value);
    $('#pf-fundrow').classList.toggle('hide',m!=='own');
    $('#pf-hint').textContent=m==='own'
      ?'Bạn tự chuyển tiền cho NCC: ghi vào công nợ NCC và vào quỹ chi. Chọn đơn nếu muốn gắn khoản này với một đơn để dễ kiểm tra.'
      :'Khách chuyển thẳng cho NCC: app ghi vào đơn như khách đã trả thêm số tiền này (giảm còn phải thu của khách) và đồng thời giảm công nợ NCC. Tiền không qua tài khoản của bạn nên không tính vào quỹ.';
  };
  $('#pf-method').addEventListener('input',refresh);
  $('#pf-sup').addEventListener('input',refresh);
  refresh();
}

/* ================= Doanh thu và quỹ ================= */
function revSum(list){
  const s={n:list.length,goods:0,disc:0,ship:0,total:0,paid:0,remain:0};
  list.forEach(o=>{const c=oCalc(o);s.goods+=c.goods;s.disc+=c.disc;s.ship+=c.ship;s.total+=c.total;s.paid+=Math.min(c.paid,c.total);s.remain+=Math.max(0,c.remain)});
  return s;
}
function fundRows(month){
  const rows=[],inM=d=>!month||ym(d)===month;
  DB.orders.forEach(o=>{
    o.pays.forEach(p=>{if(p.id&&(p.m==='bank'||p.m==='cash')&&inM(p.d))rows.push({d:p.d,t:'in',text:`Khách ${(custOf(o.cust)||{}).name||''}: ${p.note}`,fund:p.m,amt:p.amt,order:o,ref:p.ref})});
    if(o.type==='DH'&&o.status!=='Nháp'&&o.shipCost>0&&inM(o.date))rows.push({d:o.date,t:'out',text:'Chi phí giao hàng thực tế',fund:'',amt:o.shipCost,order:o,ref:''});
  });
  DB.txs.forEach(t=>{
    const d=vnDate(t.transaction_date||t.created_at);if(!inM(d))return;
    if(t.status==='unmatched')rows.push({d,t:'in',text:'Tiền về chưa đối soát: '+(t.content||'').slice(0,70),fund:'bank',amt:t.amount,order:null,ref:t.bank_ref});
    else if(t.status==='matched'&&t.excess>0)rows.push({d,t:'in',text:'Khách chuyển dư (vào số dư có)',fund:'bank',amt:t.excess,order:orderById(t.order_id),ref:t.bank_ref});
  });
  DB.sp.forEach(p=>{
    if(!inM(p.d))return;
    if(p.method==='own')rows.push({d:p.d,t:'out',text:'Trả NCC '+supName(p.sup)+(p.note?' · '+p.note:''),fund:p.fund,amt:p.amt,order:orderById(p.order),ref:p.ref});
    else rows.push({d:p.d,t:'info',text:'Khách trả thẳng NCC '+supName(p.sup)+' (không qua quỹ)',fund:'',amt:p.amt,order:orderById(p.order),ref:p.ref});
  });
  return rows.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:0);
}
function viewRevenue(){
  const all=repOrders(''),months=[...new Set(all.map(o=>ym(o.date)))].sort();
  const list=repOrders(REP.month),T=revSum(list);
  const tabs=[['ngay','Theo ngày'],['thang','Theo tháng'],['quy','Quỹ thu – chi']];
  let body='';
  const revTable=(groups,label)=>{
    const rows=groups.map(([k,os])=>{const s=revSum(os);return [label(k),s.n,money(s.goods),s.disc?'− '+money(s.disc):'-',money(s.ship),`<b>${money(s.total)}</b>`,money(s.paid),s.remain>0?`<b class="bad">${money(s.remain)}</b>`:'-']});
    const t=revSum(groups.flatMap(g=>g[1]));
    rows.push([`<b>Tổng</b>`,t.n,`<b>${money(t.goods)}</b>`,t.disc?'− '+money(t.disc):'-',`<b>${money(t.ship)}</b>`,`<b>${money(t.total)}</b>`,`<b>${money(t.paid)}</b>`,`<b>${money(t.remain)}</b>`]);
    return tbl([['Kỳ'],['Số đơn',1],['Tiền hàng',1],['Giảm giá',1],['Phụ thu giao',1],['Doanh thu',1],['Đã thu',1],['Còn phải thu',1]],rows)+'<p class="hint" style="margin:8px 0 0">Doanh thu = tiền hàng − giảm giá + phụ thu giao hàng, tính theo ngày lên đơn, của các đơn đã chốt trở lên. "Đã thu" là tiền đã nhận cho các đơn đó đến hôm nay; tiền thực nhận theo ngày xem ở tab Quỹ.</p>';
  };
  if(REP.tab==='ngay'){
    const m={};list.forEach(o=>(m[o.date]=m[o.date]||[]).push(o));
    body=revTable(Object.entries(m).sort((a,b)=>a[0]<b[0]?1:-1),k=>dmy(k));
  }else if(REP.tab==='thang'){
    const m={};all.forEach(o=>(m[ym(o.date)]=m[ym(o.date)]||[]).push(o));
    body=revTable(Object.entries(m).sort((a,b)=>a[0]<b[0]?1:-1),k=>mlabel(k));
  }else{
    const rows=fundRows(REP.month),sumBy=(f,t)=>rows.filter(r=>r.t===t&&(f==='all'||r.fund===f)).reduce((s,r)=>s+r.amt,0);
    const tin=sumBy('all','in'),tout=sumBy('all','out'),direct=rows.filter(r=>r.t==='info').reduce((s,r)=>s+r.amt,0);
    const net=f=>sumBy(f,'in')-sumBy(f,'out');
    body=`<div class="kpis"><div class="kpi"><small>Tổng thu</small><b class="good">${money(tin)}</b></div><div class="kpi"><small>Tổng chi</small><b class="bad">${money(tout)}</b></div><div class="kpi"><small>Chênh lệch</small><b class="${tin-tout<0?'bad':'good'}">${money(tin-tout)}</b></div><div class="kpi"><small>Ngân hàng (thu − chi)</small><b>${money(net('bank'))}</b></div><div class="kpi"><small>Tiền mặt (thu − chi)</small><b>${money(net('cash'))}</b></div><div class="kpi"><small>Khách trả thẳng NCC</small><b>${money(direct)}</b></div></div>`+
      tbl([['Ngày'],['Loại'],['Nội dung'],['Quỹ'],['Số tiền',1],['Đơn'],['Mã GD']],
        rows.map(r=>[dmy(r.d),r.t==='in'?'<span class="pill good">Thu</span>':r.t==='out'?'<span class="pill bad">Chi</span>':'<span class="pill">Không qua quỹ</span>',esc(r.text),FUND[r.fund]||'—',`<b class="${r.t==='in'?'good':r.t==='out'?'bad':''}">${r.t==='out'?'− ':r.t==='in'?'+ ':''}${money(r.amt)}</b>`,oLink(r.order),rLink(r.ref)]))+
      '<p class="hint" style="margin:8px 0 0">Thu: tiền khách trả bằng tiền mặt hoặc chuyển khoản (kể cả tiền về chưa đối soát và phần khách chuyển dư). Chi: tiền bạn tự trả NCC và chi phí giao hàng thực tế (chưa rõ chi bằng quỹ nào nên không cộng vào ngân hàng hay tiền mặt). Khách chuyển thẳng cho NCC không qua quỹ của bạn. Tiền hoa hồng môi giới chưa có ghi nhận chi.</p>';
  }
  $('#main').innerHTML=`<div class="top"><h1>Doanh thu</h1><div class="f" style="min-width:200px"><label for="rpMonth">Kỳ</label><select id="rpMonth"></select></div></div>
  <div class="kpis"><div class="kpi"><small>Doanh thu</small><b>${money(T.total)}</b></div><div class="kpi"><small>Đã thu</small><b>${money(T.paid)}</b></div><div class="kpi"><small>Còn phải thu</small><b class="${T.remain>0?'bad':''}">${money(T.remain)}</b></div><div class="kpi"><small>Số đơn</small><b>${T.n}</b></div><div class="kpi"><small>Trung bình mỗi đơn</small><b>${T.n?money(T.total/T.n):'-'}</b></div></div>
  <section class="card"><div class="seg" style="margin-bottom:12px;flex-wrap:wrap">${tabs.map(([k,t])=>`<button type="button" data-act="rptab" data-v="${k}" aria-pressed="${REP.tab===k}">${t}</button>`).join('')}</div>${body}</section>`;
  fill($('#rpMonth'),[{v:'',t:'Tất cả các tháng'}].concat(months.slice().reverse().map(m=>({v:m,t:mlabel(m)}))),REP.month);
  $('#rpMonth').onchange=e=>{REP.month=e.target.value;viewRevenue()};
}

/* ================= Phiếu & QR ================= */
function viewDocs(){
  if(DOCS.id){const o=orderById(DOCS.id);if(o)return docDetail(o);DOCS.id=null}
  const q=norm(DOCS.q.trim());
  let list=DB.orders.slice().sort((a,b)=>(b.date+b.no).localeCompare(a.date+a.no));
  if(DOCS.stat)list=list.filter(o=>o.status===DOCS.stat);
  if(q)list=list.filter(o=>norm([o.no,(custOf(o.cust)||{}).name,(custOf(o.cust)||{}).phone,o.note].join(' ')).includes(q));
  const rows=list.slice(0,200).map(o=>{const c=oCalc(o);return `<tr><td><b>${esc(o.no)}</b>${o.type==='BG'?' <span class="pill">Báo giá</span>':''}</td><td>${dmy(o.date)}</td><td>${cLink(o.cust)}</td><td><span class="pill ${STAT_CLASS[o.status]||''}">${o.status}</span></td><td class="num">${money(c.total)}</td><td class="num ${c.bal>0?'bad':''}">${money(Math.max(0,c.bal))}</td><td style="white-space:nowrap">${btn('Phiếu khách','doc-open',{id:o.id,t:'khach'},'sm')} ${btn('Phiếu giao hàng','doc-open',{id:o.id,t:'van'},'sm')} ${btn('QR thu tiền','doc-open',{id:o.id,t:'qr'},'sm')}</td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Không có đơn nào.</td></tr>';
  $('#main').innerHTML=`<div class="top"><h1>Phiếu & QR</h1></div><section class="card"><div class="fields" style="margin-bottom:12px;max-width:520px"><div class="f"><label for="dcQ">Tìm đơn</label><input id="dcQ" type="search" placeholder="Số phiếu, tên khách, SĐT"></div><div class="f"><label for="dcStat">Trạng thái</label><select id="dcStat"></select></div></div>
  <div class="tw"><table><thead><tr><th>Số phiếu</th><th>Ngày</th><th>Khách</th><th>Trạng thái</th><th class="num">Tổng đơn</th><th class="num">Còn phải thu</th><th>Mở phiếu</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="hint" style="margin:8px 0 0">Mở phiếu khách, phiếu giao hàng và mã QR của bất kỳ đơn nào mà không cần vào màn sửa đơn. Số tiền lấy theo đơn đã lưu.</p></section>`;
  $('#dcQ').value=DOCS.q;fill($('#dcStat'),[{v:'',t:'Tất cả'}].concat(STATS.map(s=>({v:s,t:s}))),DOCS.stat);
  $('#dcQ').addEventListener('input',e=>{DOCS.q=e.target.value;const p=e.target.selectionStart;viewDocs();const el=$('#dcQ');el.focus();try{el.setSelectionRange(p,p)}catch(x){}});
  $('#dcStat').onchange=e=>{DOCS.stat=e.target.value;viewDocs()};
}
function docDetail(o){
  const cu=custOf(o.cust)||{};
  $('#main').innerHTML=`<div class="top"><h1>Phiếu ${esc(o.no)} <span class="hint">${esc(cu.name||'')}</span></h1><div class="row">${btn('← Danh sách','doc-back',{})}${btn('Sửa đơn','goto-order',{id:o.id})}</div></div>
  <section class="card"><div class="seg" id="outTabs">${[['khach','Phiếu khách'],['van','Phiếu giao hàng'],['qr','QR thu tiền']].map(([k,t])=>`<button type="button" data-act="doc-tab" data-v="${k}">${t}</button>`).join('')}</div><div id="outBody" style="margin-top:12px"></div></section>`;
  const savedED=ED,savedOUT=OUT;
  ED=clone(o);OUT=DOCS.tab;
  try{renderOut(oCalc(ED))}finally{ED=savedED;OUT=savedOUT}
}

/* ================= Giao dịch ngân hàng ================= */
const TXS={unmatched:'Chưa đối soát',matched:'Đã ghép đơn',ignored:'Bỏ qua'};
function txTables(){
  const q=norm(TXF.q.trim()),digits=TXF.q.replace(/\D/g,'');
  const ok=t=>!q||norm([t.content,t.bank_ref,t.note,(orderById(t.order_id)||{}).no].join(' ')).includes(q)||(digits.length>=4&&String(t.amount)===digits);
  const open=DB.orders.filter(o=>oCalc(o).remain>0).sort((a,b)=>b.date.localeCompare(a.date));
  const opts=`<option value="">Chọn đơn...</option>`+open.map(o=>`<option value="${o.id}">${esc(o.no)} · ${esc((custOf(o.cust)||{}).name||'')} · còn ${money(oCalc(o).remain)}</option>`).join('');
  const un=DB.txs.filter(t=>t.status==='unmatched'&&ok(t)),rest=DB.txs.filter(t=>t.status!=='unmatched'&&ok(t));
  const unRows=un.map(t=>`<tr data-tx="${t.id}"><td>${vnTime(t.transaction_date||t.created_at)}</td><td class="num"><b>${money(t.amount)}</b></td><td>${rLink(t.bank_ref)}</td><td>${esc(t.content)}</td><td><select class="txorder" style="max-width:260px">${opts}</select></td><td style="white-space:nowrap"><button type="button" class="primary sm" data-act="txassign">Gán vào đơn</button> <button type="button" class="ghost sm" data-act="txignore">Bỏ qua</button></td></tr>`).join('');
  const restRows=rest.slice(0,150).map(t=>`<tr><td>${vnTime(t.transaction_date||t.created_at)}</td><td class="num">${money(t.amount)}</td><td>${rLink(t.bank_ref)}</td><td>${esc(t.content)}</td><td><span class="pill ${t.status==='matched'?'good':''}">${TXS[t.status]}</span></td><td>${t.status==='matched'?`${oLink(orderById(t.order_id))}${t.excess>0?` · dư ${money(t.excess)} vào số dư có`:''}`:esc(t.note)}</td></tr>`).join('');
  return `<section class="card"><h2>Chưa đối soát <span class="hint">${un.length} giao dịch</span></h2><div class="tw"><table><thead><tr><th>Thời gian</th><th class="num">Số tiền</th><th>Mã GD</th><th>Nội dung chuyển khoản</th><th>Đơn</th><th></th></tr></thead><tbody>${unRows||'<tr><td colspan="6" class="empty">Không có giao dịch nào chờ xử lý.</td></tr>'}</tbody></table></div>
   <p class="hint" style="margin:8px 0 0">Tiền chuyển vào mà nội dung không có mã đơn sẽ nằm ở đây. Gán vào đơn thì tự ghi khoản thu; phần dư (nếu có) thành số dư có của khách.</p></section>
  <section class="card"><h2>Đã xử lý gần đây</h2><div class="tw"><table><thead><tr><th>Thời gian</th><th class="num">Số tiền</th><th>Mã GD</th><th>Nội dung</th><th>Trạng thái</th><th>Kết quả</th></tr></thead><tbody>${restRows||'<tr><td colspan="6" class="empty">Chưa có giao dịch.</td></tr>'}</tbody></table></div></section>`;
}
function viewTx(){
  $('#main').innerHTML=`<div class="top"><h1>Giao dịch ngân hàng</h1><button type="button" data-act="reload">Tải lại</button></div><div class="col">
  <section class="card"><div class="f" style="max-width:420px"><label for="txq">Tìm theo mã GD, nội dung, số tiền hoặc số phiếu</label><input id="txq" type="search" placeholder="VD: ug336044"></div></section><div id="txTables" class="col"></div></div>`;
  $('#txq').value=TXF.q;
  const upd=()=>{$('#txTables').innerHTML=txTables()};upd();
  $('#txq').addEventListener('input',e=>{TXF.q=e.target.value;upd()});
}

/* ================= Tìm kiếm chung ================= */
const GS={res:[]};
function gsSearch(raw){
  const s=norm(raw.trim());if(s.length<2)return [];
  const digits=raw.replace(/\D/g,''),res=[];
  const add=(arr,cap)=>arr.slice(0,cap).forEach(x=>res.push(x));
  add(DB.orders.filter(o=>{const cu=custOf(o.cust)||{};return norm([o.no,cu.name,cu.phone,o.note].join(' ')).includes(s)}).map(o=>({k:'Đơn',t:`${o.no} · ${(custOf(o.cust)||{}).name||''} · ${money(oCalc(o).total)}`,act:'goto-order',id:o.id})),6);
  add(DB.customers.filter(c=>norm([c.name,c.phone,c.code].join(' ')).includes(s)).map(c=>({k:'Khách',t:`${c.name}${c.phone?' · '+c.phone:''}`,act:'goto-cust',id:c.id})),5);
  add(DB.txs.filter(t=>norm([t.content,t.bank_ref].join(' ')).includes(s)||(digits.length>=4&&String(t.amount)===digits)).map(t=>({k:'Giao dịch',t:`${money(t.amount)} · ${t.bank_ref||''} · ${(t.content||'').slice(0,50)}`,act:'goto-tx',ref:t.bank_ref||String(t.amount)})),5);
  add(DB.sp.filter(p=>norm([p.ref,p.note,supName(p.sup)].join(' ')).includes(s)||(digits.length>=4&&String(p.amt)===digits)).map(p=>({k:'Trả NCC',t:`${dmy(p.d)} · ${supName(p.sup)} · ${money(p.amt)}`,act:'goto-sup',id:p.sup})),4);
  add(DB.suppliers.filter(x=>norm(x.name).includes(s)).map(x=>({k:'NCC',t:x.name,act:'goto-sup',id:x.id})),3);
  add(allItems().filter(i=>norm([i.code,i.title].join(' ')).includes(s)).map(i=>({k:'Mã hàng',t:`${i.code} · ${i.title} ${i.sub}`,act:'goto-item',code:i.code})),4);
  return res;
}
function gsRender(){
  let p=$('#gsr');
  if(!p){p=document.createElement('div');p.id='gsr';p.className='gsr';document.body.appendChild(p)}
  const q=($('#gs')||{}).value||'';
  if(!q.trim()){p.classList.add('hide');return}
  GS.res=gsSearch(q);
  p.classList.remove('hide');
  p.innerHTML=GS.res.length?GS.res.map((r,i)=>`<button type="button" data-act="gs-pick" data-i="${i}"><span class="pill">${r.k}</span> ${esc(r.t)}</button>`).join(''):'<div class="empty">Không thấy kết quả</div>';
}
document.addEventListener('input',e=>{if(e.target&&e.target.id==='gs')gsRender()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=$('#gsr');if(p)p.classList.add('hide')}});
document.addEventListener('click',e=>{if(!e.target.closest('#gsr')&&e.target.id!=='gs'){const p=$('#gsr');if(p)p.classList.add('hide')}});

/* ================= Sự kiện của các màn hình trên ================= */
function safeOpen(o){
  if(ED&&ED.id!==o.id){
    if(!confirm('Đang sửa dở đơn '+ED.no+'. Bỏ thay đổi chưa lưu của đơn đó?'))return;
    dropDraft();
  }
  if(ED&&ED.id===o.id){EDOPEN=true;go('don');return}
  openEditor(o,false);
}
Object.assign(VIEW,{mahang:viewCatalog,muahang:viewPurchase,doanhthu:viewRevenue,phieu:viewDocs,giaodich:viewTx});
Object.assign(ACT,{
  open:b=>{const o=orderById(b.dataset.id);if(o)safeOpen(o)},
  'goto-order':b=>{const o=orderById(b.dataset.id);if(o)safeOpen(o)},
  'goto-cust':b=>{CR.sel.customers=b.dataset.id;CR.edit=null;go('khach')},
  'goto-sup':b=>{PUR.sup=b.dataset.id;go('muahang')},
  'goto-tx':b=>{TXF.q=b.dataset.ref||'';go('giaodich')},
  'goto-item':b=>{PM.tab='bang';PM.q=b.dataset.code;PM.kind='';PM.sup='';go('mahang')},
  'gs-pick':b=>{const r=GS.res[+b.dataset.i];const p=$('#gsr');if(p)p.classList.add('hide');if(!r)return;const fake={dataset:{id:r.id||'',ref:r.ref||'',code:r.code||''}};ACT[r.act](fake)},
  pmtab:b=>{PM.tab=b.dataset.v;viewCatalog()},
  'cat-form':b=>{const d=b.dataset;CAT.form={t:d.t,id:d.id||'',cat:d.cat||'',pid:d.pid||''};viewCatalog()},
  'cat-cancel':()=>{CAT.form=null;viewCatalog()},
  'cat-save':()=>{
    const f=CAT.form,v=id=>($('#cf-'+id)?$('#cf-'+id).value.trim():'');
    if(f.t==='cat'){
      const name=v('name');if(!name){toast('Nhập tên nhóm');return}
      mut(async()=>{
        if(f.id)await Q(sb.from('categories').update({name,description:v('desc')}).eq('id',f.id));
        else await Q(sb.from('categories').insert({name,description:v('desc'),sort:DB.cats.reduce((m,c)=>Math.max(m,c.sort),0)+1}));
        CAT.form=null;
      },'Đã lưu nhóm hàng');
    }else if(f.t==='prod'){
      const name=v('name'),code=v('code').toUpperCase(),ly=nz(v('ly'));
      if(!name||(!f.id&&!code)){toast('Nhập mã và tên sản phẩm');return}
      const row={name,category_id:v('cat')||null,brand_id:v('brand')||null,material_id:v('material')||null,description:v('desc'),colors:$$('.cf-color').filter(c=>c.checked).map(c=>c.value)};
      mut(async()=>{
        if(f.id)await Q(sb.from('products').update(row).eq('id',f.id));
        else{
          const p=await Q(sb.from('products').insert(Object.assign({code},row)).select('id').single());
          if(ly>0)await Q(sb.from('items').insert({kind:'tam',product_id:p.id,ly,code:''}));
        }
        CAT.form=null;
      },'Đã lưu sản phẩm. Sang Bảng giá nhập để thêm giá nhập cho mã mới');
    }else if(f.t==='pk'){
      const name=v('name'),unit=v('unit');let code=v('code').toUpperCase();
      if(!name||!unit){toast('Nhập tên và chọn đơn vị');return}
      if(!f.id&&!code)code=name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]/g,'').slice(0,4).toUpperCase();
      mut(async()=>{
        const row={name,unit,category_id:v('cat')||null,description:v('desc')};
        if(f.id)await Q(sb.from('items').update(row).eq('id',f.id));
        else await Q(sb.from('items').insert(Object.assign({kind:'pk',code},row)));
        CAT.form=null;
      },'Đã lưu phụ kiện');
    }else if(f.t==='ly'){
      const ly=nz(v('ly')),t=tamOf(f.pid);
      if(ly<=0){toast('Nhập độ ly');return}
      if(t.lys.includes(ly)){toast('Độ ly này đã có');return}
      mut(async()=>{await Q(sb.from('items').insert({kind:'tam',product_id:t.id,ly,code:''}));CAT.form=null},'Đã thêm độ ly. Sang Bảng giá nhập để thêm giá cho mã mới');
    }
  },
  'cat-del':b=>{if(confirm('Xóa nhóm hàng này? Chỉ xóa được khi không còn hàng thuộc nhóm.'))mut(async()=>{await Q(sb.from('categories').delete().eq('id',b.dataset.id))},'Đã xóa nhóm')},
  'prod-del':b=>{if(confirm('Xóa sản phẩm này cùng các độ ly của nó? Không xóa được nếu đã có giá nhập hoặc đơn dùng.'))mut(async()=>{await Q(sb.from('items').delete().eq('product_id',b.dataset.id));await Q(sb.from('products').delete().eq('id',b.dataset.id))},'Đã xóa sản phẩm')},
  'pk-del':b=>{if(confirm('Xóa phụ kiện này?'))mut(async()=>{await Q(sb.from('items').delete().eq('id',b.dataset.id))},'Đã xóa phụ kiện')},
  'ly-del':b=>{const id=ITEM[b.dataset.pid+'|'+(+b.dataset.ly)];if(id&&confirm('Xóa độ ly này? Không xóa được nếu đã có giá nhập hoặc đơn dùng.'))mut(async()=>{await Q(sb.from('items').delete().eq('id',id))},'Đã xóa độ ly')},
  'attr-toggle':b=>{const k=b.dataset.k;ATT.add[k]=!ATT.add[k];attrTab()},
  'attr-save':b=>{
    const k=b.dataset.k,name=($('#at-name-'+k).value||'').trim(),note=($('#at-note-'+k).value||'').trim();
    if(!name){toast('Nhập tên');return}
    if(DB.attrs[k].some(a=>a.name.toLowerCase()===name.toLowerCase())){toast('Đã có mục này');return}
    mut(async()=>{await Q(sb.from('attributes').insert({kind:k,name,note}));ATT.add[k]=false},'Đã thêm');
  },
  'attr-del':b=>{
    const k=b.dataset.k,a=byId(DB.attrs[k],b.dataset.id);if(!a)return;
    if(attrUsage(k,a)>0){toast('Mục này đang được dùng, không xóa được');return}
    mut(async()=>{await Q(sb.from('attributes').delete().eq('id',a.id))},'Đã xóa');
  },
  addwidth:()=>{
    const v=Math.round(+String($('#newW').value).replace(',','.')*100)/100;
    if(!(v>0)||v>=1000){toast('Nhập khổ rộng bằng mét, ví dụ 1.22');return}
    if(DB.widths.includes(v)){toast('Khổ này đã có');return}
    mut(async()=>{await Q(sb.from('widths').insert({value:v}));ATT.add.width=false},'Đã thêm khổ '+dec(v)+'m');
  },
  delwidth:b=>{mut(async()=>{await Q(sb.from('widths').delete().eq('value',+b.dataset.w))},'Đã xóa khổ')},
  'pur-sel':b=>{PUR.sup=PUR.sup===b.dataset.id?'':b.dataset.id;viewPurchase()},
  'pur-save':()=>{
    const sup=$('#pf-sup').value,amt=Math.round(nz($('#pf-amt').value)),m=$('#pf-method').value,order=$('#pf-order').value;
    if(!sup){toast('Chọn nhà cung cấp');return}
    if(amt<=0){toast('Nhập số tiền');return}
    if(m==='customer_direct'&&!order){toast('Chọn đơn của khách đã chuyển thẳng cho NCC');return}
    mut(async()=>{
      await Q(sb.from('supplier_payments').insert({supplier_id:sup,paid_on:$('#pf-date').value||TODAY,amount:amt,method:m,fund:m==='own'?$('#pf-fund').value:'bank',order_id:order||null,bank_ref:$('#pf-ref').value.trim(),note:$('#pf-note').value.trim()}));
      PUR.sup=sup;
    },'Đã ghi nhận');
  },
  'pur-del':b=>{
    const p=byId(DB.sp,b.dataset.id);if(!p)return;
    const extra=p.method==='customer_direct'?' Khoản khách đã trả tương ứng trong đơn cũng bị xóa.':'';
    if(confirm('Xóa khoản trả '+money(p.amt)+' cho '+supName(p.sup)+'?'+extra))mut(async()=>{await Q(sb.from('supplier_payments').delete().eq('id',p.id))},'Đã xóa');
  },
  rptab:b=>{REP.tab=b.dataset.v;viewRevenue()},
  'doc-open':b=>{DOCS.id=b.dataset.id;DOCS.tab=b.dataset.t;viewDocs();window.scrollTo(0,0)},
  'doc-tab':b=>{DOCS.tab=b.dataset.v;viewDocs()},
  'doc-back':()=>{DOCS.id=null;viewDocs()}
});

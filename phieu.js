/* =====================================================================
   Phiếu khách, phiếu giao hàng, QR thu tiền, xuất ảnh PNG, in / lưu PDF.
   Nạp sau app2.js (xem loader.js). File này ghi đè các hàm cùng tên trong app.js:
   qrImg, exportImg, sheetKhach, sheetVan, qrCard, renderOut.
   Không dùng thư viện ngoài: QR và xuất ảnh đều tự làm.
   ===================================================================== */

/* ---------- Giao diện phiếu ---------- */
/* CSS của phiếu nằm trong phieu.css (nạp bởi loader.js) */

/* ---------- Mã QR: tự viết (chế độ byte, mức sửa lỗi M, phiên bản 1-14) ---------- */
const PQ_ECC_M=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24];
const PQ_BLK_M=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9];
function pqRaw(v){let r=(16*v+128)*v+64;if(v>=2){const a=Math.floor(v/7)+2;r-=(25*a-10)*a-55;if(v>=7)r-=36}return r}
function pqMul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z}
function pqDiv(deg){const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;for(let i=0;i<deg;i++){for(let j=0;j<deg;j++){r[j]=pqMul(r[j],root);if(j+1<deg)r[j]^=r[j+1]}root=pqMul(root,2)}return r}
function pqRem(data,div){const r=new Array(div.length).fill(0);for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>{r[i]^=pqMul(c,f)})}return r}
function pqPenalty(m,size){
  let p=0,dark=0;
  const A=[1,0,1,1,1,0,1,0,0,0,0],B=[0,0,0,0,1,0,1,1,1,0,1];
  for(let a=0;a<size;a++){
    for(const horiz of [true,false]){
      const g=b=>(horiz?m[a][b]:m[b][a])?1:0;
      let run=1;
      for(let b=1;b<size;b++){if(g(b)===g(b-1))run++;else{if(run>=5)p+=run-2;run=1}}
      if(run>=5)p+=run-2;
      for(let b=0;b+11<=size;b++){
        let ma=true,mb=true;
        for(let k=0;k<11;k++){const v=g(b+k);if(v!==A[k])ma=false;if(v!==B[k])mb=false}
        if(ma)p+=40;if(mb)p+=40;
      }
    }
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    if(m[y][x])dark++;
    if(x+1<size&&y+1<size&&m[y][x]===m[y][x+1]&&m[y][x]===m[y+1][x]&&m[y][x]===m[y+1][x+1])p+=3;
  }
  const tot=size*size,k=Math.ceil(Math.abs(dark*20-tot*10)/tot)-1;
  return p+Math.max(0,k)*10;
}
function pqEncode(text){
  const bytes=Array.from(new TextEncoder().encode(text));
  let ver=1,cap=0;
  for(;ver<=14;ver++){
    cap=Math.floor(pqRaw(ver)/8)-PQ_ECC_M[ver]*PQ_BLK_M[ver];
    if(4+(ver<10?8:16)+bytes.length*8<=cap*8)break;
  }
  if(ver>14)throw new Error('Nội dung QR quá dài');
  const bits=[],put=(v,n)=>{for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1)};
  put(4,4);put(bytes.length,ver<10?8:16);bytes.forEach(b=>put(b,8));
  put(0,Math.min(4,cap*8-bits.length));
  while(bits.length%8)bits.push(0);
  for(let p=0xEC;bits.length<cap*8;p^=0xEC^0x11)put(p,8);
  const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=b<<1|bits[i+j];data.push(b)}
  const nb=PQ_BLK_M[ver],el=PQ_ECC_M[ver],raw=Math.floor(pqRaw(ver)/8),ns=nb-raw%nb,sl=Math.floor(raw/nb),div=pqDiv(el),blocks=[];
  for(let i=0,k=0;i<nb;i++){
    const dl=sl-el+(i<ns?0:1),dat=data.slice(k,k+dl);k+=dl;
    const ecc=pqRem(dat,div);if(i<ns)dat.push(0);blocks.push(dat.concat(ecc));
  }
  const all=[];
  for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==sl-el||j>=ns)all.push(b[i])});
  const size=ver*4+17,m=[],fn=[];
  for(let y=0;y<size;y++){m.push(new Array(size).fill(false));fn.push(new Array(size).fill(false))}
  const setF=(x,y,d)=>{m[y][x]=d;fn[y][x]=true};
  for(let i=0;i<size;i++){setF(6,i,i%2===0);setF(i,6,i%2===0)}
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;if(x>=0&&x<size&&y>=0&&y<size)setF(x,y,d!==2&&d!==4)}};
  finder(3,3);finder(size-4,3);finder(3,size-4);
  if(ver>1){
    const na=Math.floor(ver/7)+2,step=Math.ceil((ver*4+4)/(na*2-2))*2,pos=[6];
    for(let p=size-7;pos.length<na;p-=step)pos.splice(1,0,p);
    for(let i=0;i<na;i++)for(let j=0;j<na;j++){
      if((i===0&&j===0)||(i===0&&j===na-1)||(i===na-1&&j===0))continue;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)setF(pos[i]+dx,pos[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    }
  }
  const drawFmt=mask=>{
    const d=mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);
    const bits15=((d<<10)|r)^0x5412,bit=i=>((bits15>>>i)&1)===1;
    for(let i=0;i<=5;i++)setF(8,i,bit(i));
    setF(8,7,bit(6));setF(8,8,bit(7));setF(7,8,bit(8));
    for(let i=9;i<15;i++)setF(14-i,8,bit(i));
    for(let i=0;i<8;i++)setF(size-1-i,8,bit(i));
    for(let i=8;i<15;i++)setF(8,size-15+i,bit(i));
    setF(8,size-8,true);
  };
  drawFmt(0);
  if(ver>=7){
    let r=ver;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);
    const vb=(ver<<12)|r;
    for(let i=0;i<18;i++){const bt=((vb>>>i)&1)===1,a=size-11+i%3,b=Math.floor(i/3);setF(a,b,bt);setF(b,a,bt)}
  }
  let bi=0;const total=all.length*8;
  for(let right=size-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){
      const x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;
      if(!fn[y][x]&&bi<total){m[y][x]=((all[bi>>>3]>>>(7-(bi&7)))&1)===1;bi++}
    }
  }
  const MF=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  const applyMask=k=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fn[y][x]&&MF[k](x,y))m[y][x]=!m[y][x]};
  let best=0,bestP=Infinity;
  for(let k=0;k<8;k++){applyMask(k);drawFmt(k);const p=pqPenalty(m,size);if(p<bestP){bestP=p;best=k}applyMask(k)}
  applyMask(best);drawFmt(best);
  return {size,m,ver,mask:best};
}
const PQ_CACHE=new Map();
function qrImg(text,size){
  try{
    const key=text+'|'+size;
    if(PQ_CACHE.has(key))return PQ_CACHE.get(key);
    const q=pqEncode(String(text)),quiet=4,N=q.size+quiet*2,s=Math.max(3,Math.ceil(size*2/N));
    const cv=document.createElement('canvas');cv.width=cv.height=N*s;
    const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.fillStyle='#000';
    for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.m[y][x])cx.fillRect((x+quiet)*s,(y+quiet)*s,s,s);
    const html=`<img class="qrpng" alt="Mã QR chuyển khoản" width="${size}" height="${size}" src="${cv.toDataURL('image/png')}">`;
    if(PQ_CACHE.size>40)PQ_CACHE.clear();
    PQ_CACHE.set(key,html);
    return html;
  }catch(e){console.error(e);return '<div class="empty">Không tạo được QR</div>'}
}

/* ---------- Tiện ích cho phiếu ---------- */
function pqCo(){
  const s=String(DB.settings.shop||'').trim();
  return (!s||/CỬA HÀNG TẤM NHỰA/i.test(s))?'CÔNG TY SẢN XUẤT NHỰA LẤY SÁNG':s.toLocaleUpperCase('vi');
}
const pqN=n=>Math.round(n).toLocaleString('vi-VN');
const pqNgay=d=>{const p=String(d).split('-');return `Ngày ${+p[2]} tháng ${+p[1]} năm ${p[0]}`};
const pqUnit=l=>l.k==='tam'?'tấm':(pkOf(l.aid)||{unit:''}).unit;
function pqLyTxt(){const m={};ED.lines.forEach(l=>{if(l.k==='tam')m[l.ly]=(m[l.ly]||0)+lineQty(l)});const k=Object.keys(m).sort((a,b)=>a-b);
  return k.length>1?k.map(x=>`${dec(x)} ly: ${dec(Math.round(m[x]*100)/100)} m²`).join(' · '):''}
const pqM2=()=>{let s=0;ED.lines.forEach(l=>{if(l.k==='tam')s+=lineQty(l)});return Math.round(s*100)/100};
function pqDocSo(n){
  n=Math.round(n);if(n<=0)return 'Không đồng.';
  const d=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
  const ba=(x,full)=>{
    const tr=Math.floor(x/100),ch=Math.floor(x%100/10),dv=x%10;let s='';
    if(tr>0||full)s+=d[tr]+' trăm';
    if(ch>1){s+=(s?' ':'')+d[ch]+' mươi';if(dv===1)s+=' mốt';else if(dv===5)s+=' lăm';else if(dv>0)s+=' '+d[dv]}
    else if(ch===1){s+=(s?' ':'')+'mười';if(dv===5)s+=' lăm';else if(dv>0)s+=' '+d[dv]}
    else if(dv>0)s+=(s?' lẻ ':'')+d[dv];
    return s;
  };
  const names=['','nghìn','triệu','tỷ','nghìn tỷ','triệu tỷ'],g=[];
  while(n>0){g.push(n%1000);n=Math.floor(n/1000)}
  const out=[];
  for(let i=g.length-1;i>=0;i--){if(g[i]===0)continue;out.push(ba(g[i],i<g.length-1)+(names[i]?' '+names[i]:''))}
  const s=out.join(' ');
  return s.charAt(0).toUpperCase()+s.slice(1)+' đồng.';
}
const PQ_NOTE='<div class="note2"><b>GHI CHÚ:</b> Tiền hàng chưa bao gồm VAT<br>Người vận chuyển: Cuộn có thể gãy vỡ, chú ý nhẹ tay, không để vật nặng, sắc nhọn lên sản phẩm. Xin Cảm ơn</div>';
function pqBankInfo(){
  const S=DB.settings,bank=(typeof BANKS!=='undefined'&&BANKS[String(S.bin).trim()])||'';
  return `${bank?`Ngân hàng: <b>${esc(bank)}</b><br>`:''}Số tài khoản: <b>${esc(S.acc)}</b><br>Chủ tài khoản: <b>${esc(S.accName)}</b><br>Nội dung: <b>${esc(payNote(ED))}</b>`;
}
function pqHead(title,c){
  return `<div class="co">${esc(pqCo())}</div><div class="ttl">${title}</div><div class="sub">Số phiếu: <b>${esc(ED.no)}</b> &nbsp;·&nbsp; ${pqNgay(ED.date)}</div>`;
}
const pqTH=(t,cls)=>`<th${cls?` class="${cls}"`:''}>${t}</th>`;

/* ---------- Phiếu khách ---------- */
function sheetKhach(c){
  const cu=custOf(ED.cust)||{},other=c.paid-c.advPaid,bal=Math.max(0,c.bal),m2=pqM2(),hasTam=ED.lines.some(l=>l.k==='tam');
  const rows=ED.lines.map((l,i)=>{
    const tam=l.k==='tam',q=lineQty(l),u=pqUnit(l);
    const spec=tam?`<b>${esc(lineName(l))}</b><br><span class="mu">Mã ${esc(maOf(l))} · ${[l.color,dec(l.ly)+' ly'].filter(Boolean).map(esc).join(' · ')}</span>`
                  :`<b>${esc(lineName(l))}</b><br><span class="mu">Mã ${esc(maOf(l))}</span>`;
    return `<tr><td class="c">${i+1}</td><td>${spec}</td><td class="r">${tam?dec(l.w):''}</td><td class="r">${tam?dec(l.dai):''}</td><td class="r">${tam?l.n:dec(l.qty)} ${esc(u)}</td><td class="r">${tam?dec(q):''}</td><td class="r">${pqN(nz(l.pout))}<span class="mu">/${tam?'m²':esc(u)}</span></td><td class="r"><b>${pqN(Math.round(q*nz(l.pout)))}</b></td></tr>`;
  }).join('')||'<tr><td colspan="8" class="c mu">Chưa có dòng hàng</td></tr>';
  const tot=hasTam?`<tr class="tot"><td colspan="5" class="r">TỔNG CỘNG${pqLyTxt()?`<br><span class="mu">${pqLyTxt()}</span>`:''}</td><td class="r">${dec(m2)} m²</td><td colspan="2"></td></tr>`:'';
  const qr=[];
  if(c.advDue>0)qr.push(`<div class="qri">${qrImg(vietqr(c.advDue,payNote(ED)),170)}<div class="qt">Tạm ứng cắt hàng</div><div class="qa">${money(c.advDue)}</div></div>`);
  if(bal>0)qr.push(`<div class="qri">${qrImg(vietqr(bal,payNote(ED)),170)}<div class="qt">Còn phải thu</div><div class="qa">${money(bal)}</div></div>`);
  return `${pqHead(ED.type==='BG'?'BÁO GIÁ':'PHIẾU XUẤT HÀNG',c)}
  <div class="kv"><span>Khách hàng:</span><b>${esc(cu.name||'')}</b>${cu.phone?`<span>Điện thoại:</span><b>${esc(cu.phone)}</b>`:''}${cu.address?`<span>Địa chỉ:</span><b>${esc(cu.address)}</b>`:''}</div>
  <p class="intro">Theo yêu cầu của Quý Khách hàng, chúng tôi xin gửi đến Quý Khách hàng đơn đặt hàng chi tiết như sau:</p>
  <table class="pq"><thead><tr>${pqTH('STT')}${pqTH('Quy cách')}${pqTH('Khổ (m)')}${pqTH('Dài (m)')}${pqTH('Số lượng')}${pqTH('Số m²')}${pqTH('Đơn giá (đ)')}${pqTH('Thành tiền (đ)')}</tr></thead><tbody>${rows}${tot}</tbody></table>
  <div class="sum2"><div><span>Tiền hàng</span><span>${money(c.goods)}</span></div>${c.disc?`<div><span>Giảm giá</span><span>− ${money(c.disc)}</span></div>`:''}<div><span>Phụ thu giao hàng</span><span>${money(c.ship)}</span></div><div class="st"><span>Tổng thanh toán</span><span>${money(c.total)}</span></div><div><span>Tạm ứng cắt hàng${c.advPaid>0?' (đã nhận)':''}</span><span>${money(c.advEff)}</span></div>${other>0?`<div><span>Đã thanh toán thêm</span><span>${money(other)}</span></div>`:''}<div class="due"><span>Còn phải thu</span><span>${money(bal)}</span></div></div>
  <div class="words">Bằng chữ: <i>${pqDocSo(c.total)}</i></div>
  ${PQ_NOTE}
  <div class="pay2">${qr.join('')}<div class="bank2"><b>THÔNG TIN CHUYỂN KHOẢN</b><br>${pqBankInfo()}${qr.length?'<br><span class="mu">Quét mã QR bằng ứng dụng ngân hàng, nội dung đã điền sẵn.</span>':''}</div></div>
  <div class="foot">Xin cảm ơn Quý Khách hàng!</div>`;
}

/* ---------- Phiếu giao hàng ---------- */
function sheetVan(c){
  const cu=custOf(ED.cust)||{},bal=Math.max(0,c.bal),m2=pqM2(),hasTam=ED.lines.some(l=>l.k==='tam');
  const rows=ED.lines.map((l,i)=>{
    const tam=l.k==='tam',u=pqUnit(l);
    const spec=tam?`<b>${esc(lineName(l))}</b><br><span class="mu">Mã ${esc(maOf(l))} · ${[l.color,dec(l.ly)+' ly'].filter(Boolean).map(esc).join(' · ')}</span>`
                  :`<b>${esc(lineName(l))}</b><br><span class="mu">Mã ${esc(maOf(l))}</span>`;
    return `<tr><td class="c">${i+1}</td><td>${spec}</td><td class="r">${tam?dec(l.w):''}</td><td class="r">${tam?dec(l.dai):''}</td><td class="r"><b>${tam?l.n:dec(l.qty)} ${esc(u)}</b></td><td class="r">${tam?dec(lineQty(l)):''}</td></tr>`;
  }).join('')||'<tr><td colspan="6" class="c mu">Chưa có dòng hàng</td></tr>';
  const tot=hasTam?`<tr class="tot"><td colspan="5" class="r">TỔNG CỘNG${pqLyTxt()?`<br><span class="mu">${pqLyTxt()}</span>`:''}</td><td class="r">${dec(m2)} m²</td></tr>`:'';
  const sig=t=>`<div><b>${t}</b><div class="mu">(Ký, ghi rõ họ tên)</div><div class="sp"></div></div>`;
  const box='<span class="box"></span>';
  return `${pqHead('PHIẾU GIAO HÀNG',c)}
  <div class="kv"><span>Người nhận:</span><b>${esc(cu.name||'')}</b><span>Điện thoại:</span><b>${esc(cu.phone||'')}</b><span>Địa chỉ:</span><b>${esc(cu.address||'')}</b></div>
  ${ED.note?`<div class="note2 ship"><b>Ghi chú giao hàng:</b> ${esc(ED.note)}</div>`:''}
  <table class="pq"><thead><tr>${pqTH('STT')}${pqTH('Quy cách hàng')}${pqTH('Khổ (m)')}${pqTH('Dài (m)')}${pqTH('Số lượng')}${pqTH('Số m²')}</tr></thead><tbody>${rows}${tot}</tbody></table>
  ${PQ_NOTE}
  <div class="cod">${bal>0?`<div><div style="font-weight:700">THU CỦA KHÁCH</div><div class="amt">${money(bal)}</div><div style="color:#444;margin-top:4px;line-height:1.6">${pqBankInfo()}</div></div>${qrImg(vietqr(bal,payNote(ED)),250)}`:`<div><div style="font-weight:700">KHÔNG THU THÊM</div><div class="amt">0đ</div><div style="color:#444;margin-top:4px">Khách đã thanh toán đủ.</div></div>`}</div>
  <div style="margin-top:16px;padding:12px 14px;border:1px solid #888;border-radius:6px;line-height:2"><b>XÁC NHẬN GIAO HÀNG THÀNH CÔNG</b><br>${box}Hàng đẹp, không xước, không vỡ<br>${box}Đầy đủ số lượng như phiếu giao</div>
  <div class="sigs">${sig('Người giao hàng (lái xe)')}${sig('Người nhận hàng')}${sig('Người mua hàng')}</div>`;
}

/* ---------- QR thu tiền ---------- */
function qrCard(id,title,amount,content,fname){
  const name=`${ED.no}-${fname||'qr'}`;
  if(amount<=0)return `<div class="qrcard" id="${id}" data-name="${esc(name)}"><div class="shop">${esc(pqCo())}</div><div class="ttl">${title}</div><div class="amt" style="font-size:18px">Không còn khoản cần thu</div></div>`;
  return `<div class="qrcard" id="${id}" data-name="${esc(name)}"><div class="shop">${esc(pqCo())}</div><div class="ttl">${title} · ${esc(ED.no)}</div><div class="amt">${money(amount)}</div>${qrImg(vietqr(amount,content),260)}<div class="info">${pqBankInfo()}</div><div class="hintq">Quét mã bằng ứng dụng ngân hàng, nội dung đã điền sẵn.</div></div>`;
}
function pqBtns(id){return `<span class="row"><button type="button" class="primary" data-act="exp" data-id="${id}">Tải ảnh</button><button type="button" data-act="pdf" data-id="${id}">In / Lưu PDF</button></span>`}
function renderOut(c){
  $$('#outTabs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===OUT));
  const body=$('#outBody'),tip='<span class="hint">Gửi Zalo cho khách: dùng <b>Tải ảnh</b>. In ra giấy hoặc lưu hồ sơ: dùng <b>In / Lưu PDF</b>.</span>';
  if(OUT==='khach')body.innerHTML=`<div class="row" style="margin-bottom:8px;justify-content:space-between">${tip}${pqBtns('sheetK')}</div><div class="sheetwrap"><div class="sheet" id="sheetK" data-name="${esc(ED.no)}-phieu-khach">${sheetKhach(c)}</div></div>`;
  else if(OUT==='van')body.innerHTML=`<div class="row" style="margin-bottom:8px;justify-content:space-between">${tip}${pqBtns('sheetV')}</div><div class="sheetwrap"><div class="sheet" id="sheetV" data-name="${esc(ED.no)}-phieu-giao-hang">${sheetVan(c)}</div></div>`;
  else{
    const bal=Math.max(0,c.bal);
    body.innerHTML=`<div class="qrs"><div><div class="row" style="margin-bottom:8px"><b>Tạm ứng cắt hàng</b>${pqBtns('qrA')}</div>${qrCard('qrA','TẠM ỨNG CẮT HÀNG',c.advDue,payNote(ED),'qr-tam-ung')}</div><div><div class="row" style="margin-bottom:8px"><b>Còn phải thu</b>${pqBtns('qrB')}</div>${qrCard('qrB','CÒN PHẢI THU',bal,payNote(ED),'qr-con-phai-thu')}</div></div>
    <p class="hint" style="margin:8px 0 0">Sau khi ghi nhận tạm ứng thực thu, QR tạm ứng biến mất và còn phải thu đã trừ số đó. Số tài khoản lấy từ mục Cài đặt.</p>`;
  }
}

/* ---------- Xuất ảnh PNG (không cần thư viện ngoài) ---------- */
function pqInline(src){
  const dst=src.cloneNode(true),a=[src].concat(Array.from(src.querySelectorAll('*'))),b=[dst].concat(Array.from(dst.querySelectorAll('*')));
  a.forEach((s,i)=>{
    const cs=getComputedStyle(s);let t='';
    for(let k=0;k<cs.length;k++){const p=cs[k];t+=p+':'+cs.getPropertyValue(p)+';'}
    b[i].setAttribute('style',t);b[i].removeAttribute('id');b[i].removeAttribute('class');
  });
  return dst;
}
async function pqToCanvas(el,scale){
  const r=el.getBoundingClientRect(),w=Math.ceil(r.width),h=Math.ceil(r.height);
  const clone=pqInline(el);clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const xml=new XMLSerializer().serializeToString(clone);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">${xml}</foreignObject></svg>`;
  const img=new Image();
  await new Promise((ok,fail)=>{img.onload=ok;img.onerror=()=>fail(new Error('Không dựng được ảnh'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
  const cv=document.createElement('canvas');cv.width=w*scale;cv.height=h*scale;
  const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.scale(scale,scale);cx.drawImage(img,0,0);
  return cv;
}
async function exportImg(id){
  const el=document.getElementById(id);if(!el)return;
  const name=(el.dataset.name||'phieu')+'.png';
  toast('Đang tạo ảnh...');
  let cv=null;
  try{cv=await pqToCanvas(el,2)}catch(e){
    console.error(e);
    if(window.html2canvas){try{cv=await html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true})}catch(x){console.error(x)}}
  }
  if(!cv){toast('Trình duyệt này không tạo được ảnh. Hãy dùng In / Lưu PDF');return}
  let url,blob;
  try{url=cv.toDataURL('image/png');blob=await new Promise(r=>cv.toBlob(r,'image/png'))}
  catch(e){console.error(e);toast('Trình duyệt chặn xuất ảnh. Hãy dùng In / Lưu PDF');return}
  const file=blob?new File([blob],name,{type:'image/png'}):null;
  const canShare=!!(file&&navigator.canShare&&navigator.canShare({files:[file]}));
  const ov=document.createElement('div');ov.className='ov';
  ov.innerHTML=`<div class="panel"><div class="row" style="justify-content:space-between"><b>Ảnh đã tạo</b><span class="row"><button type="button" class="primary" id="ovDl">Tải ảnh về</button>${canShare?'<button type="button" id="ovSh">Chia sẻ (Zalo...)</button>':''}<button type="button" id="ovCopy">Sao chép ảnh</button><button type="button" id="ovClose">Đóng</button></span></div><p class="hint" style="margin:6px 0 0">Trên điện thoại có thể bấm giữ vào ảnh để lưu.</p><img alt="Ảnh phiếu" src="${url}"></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  $('#ovClose',ov).onclick=close;
  ov.addEventListener('click',e=>{if(e.target===ov)close()});
  $('#ovDl',ov).onclick=()=>{const a=document.createElement('a');a.download=name;a.href=blob?URL.createObjectURL(blob):url;document.body.appendChild(a);a.click();a.remove()};
  if(canShare)$('#ovSh',ov).onclick=()=>navigator.share({files:[file],title:name}).catch(()=>{});
  $('#ovCopy',ov).onclick=()=>{
    try{navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(()=>toast('Đã sao chép ảnh'),()=>toast('Trình duyệt không cho sao chép, hãy tải ảnh về'))}
    catch(e){toast('Trình duyệt không cho sao chép, hãy tải ảnh về')}
  };
}

/* ---------- In / Lưu PDF: dùng hộp thoại in của trình duyệt, chọn "Lưu dưới dạng PDF" ---------- */
function pqPrint(id){
  const el=document.getElementById(id);if(!el)return;
  const old=document.getElementById('printHost');if(old)old.remove();
  const host=document.createElement('div');host.id='printHost';host.appendChild(el.cloneNode(true));
  document.body.appendChild(host);document.body.classList.add('printing');
  const title=document.title;document.title=el.dataset.name||'phieu';
  const done=()=>{document.body.classList.remove('printing');host.remove();document.title=title;window.removeEventListener('afterprint',done)};
  window.addEventListener('afterprint',done);
  setTimeout(()=>{try{window.print()}catch(e){done();toast('Trình duyệt không mở được hộp thoại in')}},60);
}
ACT.pdf=b=>pqPrint(b.dataset.id);

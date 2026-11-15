/* Tải thư viện Supabase (thử hai nguồn), rồi chạy app.js, app2.js, phieu.js */
(function(){
  var LIB='@supabase/supabase-js@2.110.1/dist/umd/supabase.js';
  var V='20261115c'; /* đổi chuỗi này mỗi lần sửa file để trình duyệt không dùng bản cũ */
  function load(src){return new Promise(function(ok,fail){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=function(){fail(new Error('Không tải được '+src))};document.head.appendChild(s)})}
  (async function(){
    var urls=['https://cdn.jsdelivr.net/npm/'+LIB,'https://unpkg.com/'+LIB];
    for(var i=0;i<urls.length&&!window.supabase;i++){try{await load(urls[i])}catch(e){}}
    if(!window.supabase){document.getElementById('main').innerHTML='<div class="empty">Không tải được thư viện kết nối. Kiểm tra mạng rồi tải lại trang.</div>';return}
    var lk=document.createElement('link');lk.rel='stylesheet';lk.href='phieu.css?v='+V;document.head.appendChild(lk);
    try{
      await load('app.js?v='+V);
      await load('app2.js?v='+V);
      await load('phieu.js?v='+V);
    }catch(e){
      document.getElementById('main').innerHTML='<div class="empty">'+e.message+'. Kiểm tra file này đã nằm cùng thư mục với index.html trên GitHub chưa.</div>';return;
    }
    boot();
  })();
})();

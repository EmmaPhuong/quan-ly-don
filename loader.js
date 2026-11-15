/* Tải thư viện Supabase (thử hai nguồn), rồi chạy app.js */
(function(){
  var LIB='@supabase/supabase-js@2.110.1/dist/umd/supabase.js';
  function load(src){return new Promise(function(ok,fail){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=fail;document.head.appendChild(s)})}
  (async function(){
    var urls=['https://cdn.jsdelivr.net/npm/'+LIB,'https://unpkg.com/'+LIB];
    for(var i=0;i<urls.length&&!window.supabase;i++){try{await load(urls[i])}catch(e){}}
    if(!window.supabase){document.getElementById('main').innerHTML='<div class="empty">Không tải được thư viện kết nối. Kiểm tra mạng rồi tải lại trang.</div>';return}
    await load('app.js');
    await load('app2.js');
    boot();
  })();
})();

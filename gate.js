/* ===== Apocalypto — KUNCI MASA PENGEMBANGAN =====
   Pengunjung umum hanya melihat layar "Segera Hadir".
   Pemilik membuka sekali:  https://apocalypto.id/?dev=KODE  -> browser diingat.
   Keluar / kunci lagi   :  https://apocalypto.id/?dev=off
   Saat rilis resmi: ubah DEV_LOCK menjadi false.
   Catatan: ini penutup tampilan, bukan pengaman server. */
(function(){
  var DEV_LOCK = true;
  var HASH = "4aad0e1d5f9594810657b77a03120726b60475f93e47eb63ded0ea08e2d8cacd";              // sha256 dari kode dev (kode asli tidak disimpan di sini)
  var KEY = "apx_dev";
  if(!DEV_LOCK) return;
  var d = document.documentElement;
  function get(){ try{ return localStorage.getItem(KEY); }catch(_){ return null; } }
  function set(v){ try{ if(v) localStorage.setItem(KEY,v); else localStorage.removeItem(KEY); }catch(_){} }
  function clean(){ var u=new URL(location.href); u.searchParams.delete("dev"); history.replaceState(null,"",u.pathname+u.search+u.hash); }

  var p = new URLSearchParams(location.search).get("dev");
  if(p === "off"){ set(null); clean(); }
  if(get() === HASH) return;                         // pemilik: tampilkan situs penuh

  d.classList.add("apx-locked");
  var st=document.createElement("style");
  st.textContent="html.apx-locked body>*:not(.apx-soon){display:none!important}html.apx-locked body{overflow:hidden}"+
    ".apx-soon{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;"+
    "background:radial-gradient(1000px 600px at 50% -10%,#15325f,transparent 60%),linear-gradient(180deg,#0a1730,#050a17);color:#eaf0fb;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;z-index:9999}"+
    ".apx-soon img{width:84px;height:84px;margin-bottom:18px;filter:drop-shadow(0 6px 16px rgba(0,0,0,.5))}"+
    ".apx-soon h1{margin:0;font-size:clamp(36px,8vw,60px);font-weight:900;letter-spacing:-.01em}"+
    ".apx-soon .sub{margin-top:8px;font-size:clamp(17px,3.6vw,24px);font-weight:800}"+
    ".apx-soon .sub b{background:linear-gradient(180deg,#f3dd93,#b0821c);-webkit-background-clip:text;background-clip:text;color:transparent}"+
    ".apx-soon .tag{margin-top:26px;display:inline-block;font-size:12px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:#e7c766;border:1px solid rgba(231,199,102,.3);border-radius:999px;padding:8px 16px}";
  (document.head||d).appendChild(st);

  if(p){
    // cek kode dev (async) -> bila cocok, simpan & tampilkan situs
    try{
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(p)).then(function(b){
        var h=[].map.call(new Uint8Array(b),function(x){return ("0"+x.toString(16)).slice(-2);}).join("");
        if(h===HASH){ set(HASH); clean(); location.reload(); }
      });
    }catch(_){}
  }

  function show(){
    if(document.querySelector(".apx-soon")) return;
    var s=document.createElement("div"); s.className="apx-soon";
    s.innerHTML='<img src="logo.svg" alt="Apocalypto"><h1>Apocalypto</h1><div class="sub"><b>Jurnal Trading</b> &amp; Berbagi</div><div class="tag">Segera Hadir</div>';
    document.body.appendChild(s);
  }
  if(document.body) show(); else document.addEventListener("DOMContentLoaded", show);
})();

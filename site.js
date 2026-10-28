/* ===== Apocalypto — shared header/footer (edit MENU/links di sini saja) ===== */
(function(){
  var WA   = "https://wa.me/6281296855550";
  var GRUP = "https://chat.whatsapp.com/E8rZ29XGZa6I0a1KdksMm6";
  var YT   = "#";            // TODO: isi URL channel YouTube resmi
  var EMAIL= "admin@apocalypto.id";

  // Tambah menu baru cukup di sini -> otomatis muncul di semua halaman.
  var MENU = [
    { href:"index.html",   label:"Beranda",      key:"beranda" },
    { href:"layanan.html", label:"Layanan",      key:"layanan" },
    { href:"edukasi.html", label:"Edukasi",      key:"edukasi" },
    { href:"youtube.html", label:"YouTube",      key:"youtube" },
    { href:"voucher.html", label:"TANGKAS",      key:"voucher" }
  ];

  var cur = document.body.getAttribute("data-page") || "";

  // Menu atas sengaja ringkas: Beranda + tombol Gabung. Halaman lain tetap ada di footer.
  var NAV = [ { href:"index.html", label:"Beranda", key:"beranda" } ];
  var navItems = NAV.map(function(m){
    return '<a href="'+m.href+'"'+(m.key===cur?' class="active"':'')+'>'+m.label+'</a>';
  }).join("");

  var header =
    '<div class="topline"></div>'+
    '<header class="site-head"><div class="container bar">'+
      '<a class="brand" href="index.html"><img class="logo" src="logo.svg" alt="Apocalypto logo">'+
        '<span class="wm"><b>APOCALYPTO</b></span></a>'+
      '<span class="nav-spacer"></span>'+
      '<button class="nav-toggle" id="navToggle" aria-label="Buka menu" aria-expanded="false">'+
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>'+
      '<nav class="nav-links" id="navLinks">'+navItems+
        '<a class="nav-cta" href="layanan.html"'+(cur==="layanan"?' style="filter:brightness(1.08)"':'')+'>Gabung</a></nav>'+
    '</div></header>';

  var footLinks = MENU.map(function(m){ return '<a href="'+m.href+'">'+m.label+'</a>'; }).join("");

  var footer =
    '<footer class="site-foot"><div class="container">'+
      '<div class="foot-grid foot-1">'+
        '<div class="foot-col"><h4>Kontak</h4>'+
          '<a href="'+WA+'" target="_blank" rel="noopener">Hubungi Admin (WhatsApp)</a>'+
          '<a href="'+GRUP+'" target="_blank" rel="noopener">Grup Komunitas</a>'+
        '</div>'+
      '</div>'+
      '<div class="foot-bottom">&copy; <span id="yr"></span> Apocalypto</div>'+
    '</div></footer>';

  var h = document.getElementById("siteHeader");
  var f = document.getElementById("siteFooter");
  if(h) h.innerHTML = header;
  if(f) f.innerHTML = footer;

  var yr = document.getElementById("yr"); if(yr) yr.textContent = new Date().getFullYear();

  var tgl = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if(tgl && links){
    tgl.addEventListener("click", function(){
      var open = links.classList.toggle("open");
      tgl.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function(e){ if(e.target.tagName==="A") links.classList.remove("open"); });
  }

  // ================== REGISTRASI MEMBER (gerbang kartu) ==================
  // Pengunjung baru wajib registrasi singkat (nama panggilan, email, WhatsApp)
  // sebelum membuka halaman layanan. Data lain diminta di halaman layanan masing-masing.
  var SCRIPT_URL = "__SCRIPT_URL__";   // backend Apps Script (sama dengan daftar.html)
  var REG_KEY    = "__REG_KEY__";      // kunci registrasi publik (BUKAN kunci admin EA)
  var MKEY = "apx_member";
  // Halaman yang wajib registrasi dulu. Tambah file baru di sini untuk kartu berikutnya.
  var GATED = ["layanan.html","daftar.html","voucher.html"];
  var memMem = null;

  function getMember(){
    try{ var s=localStorage.getItem(MKEY); if(s) return JSON.parse(s); }catch(_){}
    return memMem;
  }
  function saveMember(m){ memMem=m; try{ localStorage.setItem(MKEY, JSON.stringify(m)); }catch(_){} }
  function backendReady(){ return SCRIPT_URL.indexOf("http")===0; }
  function sendMember(m){
    if(!backendReady()) return Promise.resolve(false);
    var d=new FormData();
    d.append("action","member"); d.append("nama",m.nama); d.append("email",m.email); d.append("wa",m.wa);
    d.append("halaman",m.halaman||""); d.append("key",REG_KEY);
    return fetch(SCRIPT_URL,{method:"POST",mode:"no-cors",body:d}).then(function(){ return true; }).catch(function(){ return false; });
  }
  // registrasi yang tersimpan sebelum backend tersambung -> kirim ulang otomatis
  (function(){ var m=getMember(); if(m && !m.sent && backendReady()){ sendMember(m).then(function(ok){ if(ok){ m.sent=true; saveMember(m); } }); } })();

  function pageOf(href){ try{ var u=new URL(href, location.href); if(u.origin!==location.origin) return ""; return (u.pathname.split("/").pop()||"index.html"); }catch(_){ return ""; } }
  function isGated(href){ return GATED.indexOf(pageOf(href))>=0; }

  var modal=null;
  function buildModal(){
    if(modal) return modal;
    modal=document.createElement("div");
    modal.className="mreg-wrap"; modal.setAttribute("role","dialog"); modal.setAttribute("aria-modal","true"); modal.setAttribute("aria-labelledby","mregTitle");
    modal.innerHTML=
      '<div class="mreg card">'+
        '<button type="button" class="mreg-x" aria-label="Tutup">&times;</button>'+
        '<div class="mreg-ic"><img src="logo.svg" alt=""></div>'+
        '<h2 id="mregTitle">Registrasi Member</h2>'+
        '<p class="mreg-sub">Sekali saja, gratis. Cukup tiga data ini untuk membuka layanan Apocalypto.</p>'+
        '<form id="mregForm" novalidate>'+
          '<label for="m_nama">Nama panggilan</label>'+
          '<input id="m_nama" type="text" autocomplete="nickname" placeholder="Nama panggilan Anda" maxlength="40">'+
          '<div class="mreg-err" data-for="m_nama">Nama panggilan wajib diisi.</div>'+
          '<label for="m_email">Email</label>'+
          '<input id="m_email" type="email" autocomplete="email" placeholder="nama@email.com" maxlength="80">'+
          '<div class="mreg-err" data-for="m_email">Masukkan email yang valid.</div>'+
          '<label for="m_wa">Nomor WhatsApp</label>'+
          '<input id="m_wa" type="tel" inputmode="tel" autocomplete="tel" placeholder="Contoh: 0812xxxxxxx" maxlength="20">'+
          '<div class="mreg-err" data-for="m_wa">Masukkan nomor WhatsApp yang valid (min. 9 digit).</div>'+
          '<button type="submit" class="btn-gold mreg-btn" id="mregBtn">Daftar &amp; Lanjutkan</button>'+
          '<p class="mreg-note">Data Anda hanya dipakai untuk layanan Apocalypto. Kami tidak pernah meminta password trading.</p>'+
        '</form>'+
      '</div>';
    document.body.appendChild(modal);
    modal.querySelector(".mreg-x").addEventListener("click", closeModal);
    modal.addEventListener("click", function(e){ if(e.target===modal) closeModal(); });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape" && modal.classList.contains("show")) closeModal(); });
    ["m_nama","m_email","m_wa"].forEach(function(id){ modal.querySelector("#"+id).addEventListener("input", function(){ showE(id,false); }); });
    modal.querySelector("#mregForm").addEventListener("submit", onSubmit);
    return modal;
  }
  var target=null, forced=false;
  function showE(id,on){ var i=modal.querySelector("#"+id), m=modal.querySelector('.mreg-err[data-for="'+id+'"]'); if(i) i.classList.toggle("err",on); if(m) m.classList.toggle("show",on); }
  function openModal(href, mustStay){
    buildModal(); target=href; forced=!!mustStay;
    modal.querySelector(".mreg-x").textContent = forced ? "←" : "×";
    modal.querySelector(".mreg-x").setAttribute("aria-label", forced ? "Kembali ke beranda" : "Tutup");
    modal.classList.add("show"); document.documentElement.classList.add("mreg-lock");
    setTimeout(function(){ var n=modal.querySelector("#m_nama"); if(n) n.focus(); }, 60);
  }
  function closeModal(){
    if(forced){ location.href="index.html"; return; }
    modal.classList.remove("show"); document.documentElement.classList.remove("mreg-lock");
  }
  function onSubmit(e){
    e.preventDefault();
    var nama=modal.querySelector("#m_nama").value.trim();
    var email=modal.querySelector("#m_email").value.trim();
    var wa=modal.querySelector("#m_wa").value.replace(/[^0-9+]/g,"");
    var ok=true;
    if(!nama){ showE("m_nama",true); ok=false; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ showE("m_email",true); ok=false; }
    if(wa.replace(/\D/g,"").length<9){ showE("m_wa",true); ok=false; }
    if(!ok) return;
    var b=modal.querySelector("#mregBtn"); b.disabled=true; b.textContent="Menyimpan...";
    var m={ nama:nama, email:email, wa:wa, halaman:pageOf(target||location.href), t:new Date().toISOString(), sent:false };
    sendMember(m).then(function(sent){
      m.sent=sent; saveMember(m);
      document.documentElement.classList.remove("mreg-lock"); modal.classList.remove("show");
      document.dispatchEvent(new CustomEvent("apx:member", { detail:m }));
      if(target && pageOf(target)!==pageOf(location.href)) location.href=target;
      else if(target && target.indexOf("#")>=0){ var s=document.querySelector(target.slice(target.indexOf("#"))); if(s) s.scrollIntoView({behavior:"smooth"}); }
      b.disabled=false; b.innerHTML="Daftar &amp; Lanjutkan";
    });
  }

  // klik ke halaman berpagar -> minta registrasi dulu
  document.addEventListener("click", function(e){
    var a=e.target.closest && e.target.closest("a[href]"); if(!a) return;
    if(!getMember() && (isGated(a.href) || a.hasAttribute("data-join"))){ e.preventDefault(); openModal(a.href,false); }
  });
  // buka langsung halaman berpagar (mis. dari link yang dibagikan) -> registrasi dulu
  if(!getMember() && GATED.indexOf(pageOf(location.href))>=0){ openModal(location.href,true); }

  // ekspor untuk halaman yang butuh (mis. form)
  window.APX = { WA:WA, GRUP:GRUP, YT:YT, EMAIL:EMAIL, member:getMember };
})();

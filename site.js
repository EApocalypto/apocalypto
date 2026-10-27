/* ===== Apocalypto — shared header/footer (edit MENU/links di sini saja) ===== */
(function(){
  var WA   = "https://wa.me/6281296855550";
  var GRUP = "https://chat.whatsapp.com/E8rZ29XGZa6I0a1KdksMm6";
  var YT   = "#";            // TODO: isi URL channel YouTube resmi
  var EMAIL= "admin@apocalypto.id";

  // Tambah menu baru cukup di sini -> otomatis muncul di semua halaman.
  var MENU = [
    { href:"index.html",   label:"Beranda",      key:"beranda" },
    { href:"edukasi.html", label:"Edukasi",      key:"edukasi" },
    { href:"live.html",    label:"Live Trading", key:"live" },
    { href:"youtube.html", label:"YouTube",      key:"youtube" },
    { href:"voucher.html", label:"Voucher",      key:"voucher" }
  ];

  var cur = document.body.getAttribute("data-page") || "";

  var navItems = MENU.map(function(m){
    return '<a href="'+m.href+'"'+(m.key===cur?' class="active"':'')+'>'+m.label+'</a>';
  }).join("");

  var header =
    '<div class="topline"></div>'+
    '<header class="site-head"><div class="container bar">'+
      '<a class="brand" href="index.html"><img class="logo" src="logo.svg" alt="Apocalypto logo">'+
        '<span class="wm"><b>APOCALYPTO</b><small>Expert Advisor</small></span></a>'+
      '<span class="nav-spacer"></span>'+
      '<button class="nav-toggle" id="navToggle" aria-label="Buka menu" aria-expanded="false">'+
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>'+
      '<nav class="nav-links" id="navLinks">'+navItems+
        '<a class="nav-cta" href="daftar.html">Daftar Sekarang</a></nav>'+
    '</div></header>';

  var footLinks = MENU.map(function(m){ return '<a href="'+m.href+'">'+m.label+'</a>'; }).join("");

  var footer =
    '<footer class="site-foot"><div class="container">'+
      '<div class="foot-grid">'+
        '<div class="foot-brand">'+
          '<div class="b"><img src="logo.svg" alt="Apocalypto"><b>APOCALYPTO</b></div>'+
          '<p>Expert Advisor XAUUSD untuk MetaTrader 5. Pendaftaran & aktivasi lisensi resmi di apocalypto.id.</p>'+
        '</div>'+
        '<div class="foot-col"><h4>Menu</h4>'+footLinks+'<a href="daftar.html">Daftar</a></div>'+
        '<div class="foot-col"><h4>Kontak</h4>'+
          '<a href="'+WA+'" target="_blank" rel="noopener">Hubungi Admin (WhatsApp)</a>'+
          '<a href="'+GRUP+'" target="_blank" rel="noopener">Grup Komunitas</a>'+
          '<a href="'+YT+'" target="_blank" rel="noopener">Channel YouTube</a>'+
          '<a href="mailto:'+EMAIL+'">'+EMAIL+'</a>'+
        '</div>'+
      '</div>'+
      '<div class="foot-bottom">&copy; <span id="yr"></span> Apocalypto &middot; Situs resmi <a href="https://apocalypto.id/">apocalypto.id</a> &middot; Seluruh pendaftaran diproses melalui situs resmi ini.</div>'+
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

  // ekspor untuk halaman yang butuh (mis. form)
  window.APX = { WA:WA, GRUP:GRUP, YT:YT, EMAIL:EMAIL };
})();

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
  var MKEY = "apx_member";
  function readMember(){ try{ var m=JSON.parse(localStorage.getItem(MKEY)||"null"); return (m && m.verified) ? m : null; }catch(_){ return null; } }
  var loggedIn = !!readMember();

  // Menu atas ringkas. Belum login: Beranda + Gabung. Sudah login: hanya tombol Log Out.
  var NAV = loggedIn ? [] : [ { href:"index.html", label:"Beranda", key:"beranda" } ];
  var navItems = NAV.map(function(m){
    return '<a href="'+m.href+'"'+(m.key===cur?' class="active"':'')+'>'+m.label+'</a>';
  }).join("");
  var cta = loggedIn
    ? '<a class="nav-cta nav-out" href="#" id="apxLogout">Log Out</a>'
    : '<a class="nav-login" href="layanan.html" data-login>Masuk</a><a class="nav-cta" href="layanan.html">Gabung</a>';

  var header =
    '<div class="topline"></div>'+
    '<header class="site-head"><div class="container bar">'+
      '<a class="brand" href="index.html"><img class="logo" src="logo.svg" alt="Apocalypto logo">'+
        '<span class="wm"><b>APOCALYPTO</b></span></a>'+
      '<span class="nav-spacer"></span>'+
      '<nav class="nav-links" id="navLinks">'+navItems+cta+'</nav>'+
    '</div></header>';

  var footLinks = MENU.map(function(m){ return '<a href="'+m.href+'">'+m.label+'</a>'; }).join("");

  var footer =
    '<footer class="site-foot"><div class="container">'+
      '<div class="foot-grid foot-1">'+
        '<div class="foot-col"><h4>Kontak</h4>'+
          '<a href="'+WA+'" target="_blank" rel="noopener">Hubungi Admin</a>'+
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

  var lo = document.getElementById("apxLogout");
  if(lo) lo.addEventListener("click", function(e){
    e.preventDefault();
    try{ localStorage.removeItem(MKEY); }catch(_){}
    location.href = "index.html";
  });

  // ================== GABUNG (registrasi member + OTP email) ==================
  // Pengunjung mengisi nama panggilan, email, WhatsApp -> kode OTP dikirim ke email ->
  // setelah kode benar, member tersimpan (tab "Registrasi Web") & dianggap login di browser ini.
  var SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwVpdxUgIbZKfqbpO6pv--hPbI0sfa0-y5go0kAiv_pRHAiLxhUkiIsYHY61roVuLtw/exec";   // backend Apps Script
  var REG_KEY    = "APOX-WEB-xBd7W3Yp-aQFm5xuA";      // kunci registrasi publik (BUKAN kunci admin EA)
  // Halaman yang wajib Gabung dulu. Tambah file baru di sini untuk kartu berikutnya.
  var GATED = ["layanan.html","daftar.html","voucher.html"];
  var RESEND_SEC = 60;

  function getMember(){ return readMember(); }
  function saveMember(m){ try{ localStorage.setItem(MKEY, JSON.stringify(m)); }catch(_){} }
  function backendReady(){ return SCRIPT_URL.indexOf("http")===0; }
  function api(params){
    params.key = REG_KEY;
    return fetch(SCRIPT_URL, { method:"POST", body:new URLSearchParams(params) })
      .then(function(r){ return r.json(); });
  }
  function esc(t){ return String(t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  function pageOf(href){ try{ var u=new URL(href, location.href); if(u.origin!==location.origin) return ""; return (u.pathname.split("/").pop()||"index.html"); }catch(_){ return ""; } }
  function isGated(href){ return GATED.indexOf(pageOf(href))>=0; }

  var modal=null, target=null, forced=false, pending=null, timer=null, mode="join";
  function q(sel){ return modal.querySelector(sel); }
  function buildModal(){
    if(modal) return modal;
    modal=document.createElement("div");
    modal.className="mreg-wrap"; modal.setAttribute("role","dialog"); modal.setAttribute("aria-modal","true"); modal.setAttribute("aria-labelledby","mregTitle");
    modal.innerHTML=
      '<div class="mreg card">'+
        '<button type="button" class="mreg-x" aria-label="Tutup">&times;</button>'+
        '<div class="mreg-ic"><img src="logo.svg" alt=""></div>'+
        '<h2 id="mregTitle">Gabung</h2>'+
        '<div class="mreg-tabs" id="mregTabs" role="tablist">'+
          '<button type="button" role="tab" data-mode="join" class="on">Gabung</button>'+
          '<button type="button" role="tab" data-mode="login">Masuk</button>'+
        '</div>'+
        '<form id="mregLogin" novalidate style="display:none">'+
          '<label for="m_lemail">Email</label>'+
          '<input id="m_lemail" type="email" autocomplete="email" placeholder="nama@email.com" maxlength="80">'+
          '<div class="mreg-err" data-for="m_lemail">Masukkan email yang valid.</div>'+
          '<div class="mreg-msg" id="mregMsg3"></div>'+
          '<button type="submit" class="btn-gold mreg-btn" id="mregLBtn">Kirim Kode OTP</button>'+
        '</form>'+
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
          '<div class="mreg-msg" id="mregMsg1"></div>'+
          '<button type="submit" class="btn-gold mreg-btn" id="mregBtn">Kirim Kode OTP</button>'+
        '</form>'+
        '<form id="mregOtp" novalidate style="display:none">'+
          '<p class="mreg-info" id="mregSentTo"></p>'+
          '<label for="m_otp">Kode OTP</label>'+
          '<input id="m_otp" class="mreg-otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;">'+
          '<div class="mreg-msg" id="mregMsg2"></div>'+
          '<button type="submit" class="btn-gold mreg-btn" id="mregVerify">Verifikasi &amp; Masuk</button>'+
          '<div class="mreg-links"><button type="button" class="mreg-link" id="mregResend" disabled>Kirim ulang kode</button>'+
          '<button type="button" class="mreg-link" id="mregBack">Ganti data</button></div>'+
        '</form>'+
      '</div>';
    document.body.appendChild(modal);
    q(".mreg-x").addEventListener("click", closeModal);
    modal.addEventListener("click", function(e){ if(e.target===modal) closeModal(); });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape" && modal.classList.contains("show")) closeModal(); });
    ["m_nama","m_email","m_wa"].forEach(function(id){ q("#"+id).addEventListener("input", function(){ showE(id,false); msg(1,""); }); });
    q("#m_otp").addEventListener("input", function(){ this.value=this.value.replace(/\D/g,"").slice(0,6); msg(2,""); });
    q("#mregForm").addEventListener("submit", onSend);
    q("#mregLogin").addEventListener("submit", onLoginSend);
    q("#m_lemail").addEventListener("input", function(){ showE("m_lemail",false); msg(3,""); });
    [].forEach.call(q("#mregTabs").querySelectorAll("button"), function(b){ b.addEventListener("click", function(){ mode=b.getAttribute("data-mode"); step(1); }); });
    modal.addEventListener("click", function(e){ var sw=e.target.closest && e.target.closest("[data-switch]"); if(sw){ e.preventDefault(); mode=sw.getAttribute("data-switch"); if(sw.getAttribute("data-email") && mode==="login") q("#m_lemail").value=sw.getAttribute("data-email"); msg(1,""); msg(3,""); step(1); } });
    q("#mregOtp").addEventListener("submit", onVerify);
    q("#mregResend").addEventListener("click", function(){ if(pending) sendOtp(true); });
    q("#mregBack").addEventListener("click", function(){ step(1); });
    return modal;
  }
  function showE(id,on){ var i=q("#"+id), m=q('.mreg-err[data-for="'+id+'"]'); if(i) i.classList.toggle("err",on); if(m) m.classList.toggle("show",on); }
  function msg(n,text,ok,html){ var el=q("#mregMsg"+n); if(html) el.innerHTML=text; else el.textContent=text||""; el.className="mreg-msg"+(text?" show":"")+(ok?" ok":""); }
  function step(n){
    var login = mode==="login";
    q("#mregForm").style.display  = (n===1 && !login) ? "" : "none";
    q("#mregLogin").style.display = (n===1 &&  login) ? "" : "none";
    q("#mregOtp").style.display   = n===2 ? "" : "none";
    q("#mregTabs").style.display  = n===1 ? "" : "none";
    [].forEach.call(q("#mregTabs").querySelectorAll("button"), function(b){ var on=b.getAttribute("data-mode")===mode; b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false"); });
    q("#mregTitle").textContent = "Masukkan Kode OTP";
    q("#mregTitle").style.display = n===2 ? "" : "none";   // langkah 1: judul cukup dari tab Gabung/Masuk
    q("#mregBack").textContent  = login ? "Ganti email" : "Ganti data";
    setTimeout(function(){ var f=q(n===2 ? "#m_otp" : (login ? "#m_lemail" : "#m_nama")); if(f) f.focus(); }, 60);
  }
  function countdown(sec){
    var b=q("#mregResend"); clearInterval(timer); b.disabled=true;
    (function t(){ if(sec<=0){ clearInterval(timer); b.disabled=false; b.textContent="Kirim ulang kode"; return; }
      b.textContent="Kirim ulang kode ("+sec+"s)"; sec--; })();
    timer=setInterval(function(){ if(sec<=0){ clearInterval(timer); b.disabled=false; b.textContent="Kirim ulang kode"; return; } b.textContent="Kirim ulang kode ("+sec+"s)"; sec--; },1000);
  }
  function openModal(href, mustStay, asLogin){
    buildModal(); target=href; forced=!!mustStay;
    if(!pending) mode = asLogin ? "login" : "join";
    q(".mreg-x").textContent = forced ? "\u2190" : "\u00d7";
    q(".mreg-x").setAttribute("aria-label", forced ? "Kembali ke beranda" : "Tutup");
    step(pending ? 2 : 1);
    modal.classList.add("show"); document.documentElement.classList.add("mreg-lock");
  }
  function closeModal(){
    if(forced){ location.href="index.html"; return; }
    modal.classList.remove("show"); document.documentElement.classList.remove("mreg-lock");
  }
  function busy(id,on,label){ var b=q("#"+id); b.disabled=on; if(label) b.innerHTML=label; }

  function onSend(e){
    e.preventDefault();
    var nama=q("#m_nama").value.trim(), email=q("#m_email").value.trim().toLowerCase(), wa=q("#m_wa").value.replace(/[^0-9+]/g,"");
    var ok=true;
    if(!nama){ showE("m_nama",true); ok=false; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ showE("m_email",true); ok=false; }
    if(wa.replace(/\D/g,"").length<9){ showE("m_wa",true); ok=false; }
    if(!ok) return;
    pending={ nama:nama, email:email, wa:wa, mode:"join" };
    sendOtp(false);
  }
  function onLoginSend(e){
    e.preventDefault();
    var email=q("#m_lemail").value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ showE("m_lemail",true); return; }
    pending={ email:email, mode:"login" };
    sendOtp(false);
  }
  function sendOtp(isResend){
    if(!backendReady()){ msg(1,"Layanan belum tersambung. Silakan hubungi admin."); return; }
    var first = pending.mode==="login" ? "mregLBtn" : "mregBtn", m1 = pending.mode==="login" ? 3 : 1;
    var bid = isResend ? "mregResend" : first;
    busy(bid,true, isResend ? "Mengirim..." : "Mengirim kode...");
    api({ action:"otp_send", mode:pending.mode, nama:pending.nama||"", email:pending.email, wa:pending.wa||"", halaman:pageOf(target||location.href) })
      .then(function(res){
        busy(first,false,"Kirim Kode OTP");
        if(res && res.result==="registered"){
          var what = res.by==="wa" ? "Nomor WhatsApp ini" : res.by==="both" ? "Email dan nomor WhatsApp ini" : "Email ini";
          var em = pending.email; pending=null;
          msg(m1, what+' sudah terdaftar. Silakan <a href="#" data-switch="login" data-email="'+esc(em)+'">Masuk</a>.', false, true); return;
        }
        if(res && res.result==="not_found"){
          pending=null;
          msg(m1,'Email ini belum terdaftar. <a href="#" data-switch="join">Gabung sekarang</a>.',false,true); return;
        }
        if(res && res.result==="sent"){
          q("#mregSentTo").innerHTML = 'Kode 6 digit telah dikirim ke <b>'+esc(pending.email)+'</b>.';
          q("#m_otp").value=""; step(2); countdown(res.wait||RESEND_SEC);
          if(isResend) msg(2,"Kode baru sudah dikirim.",true);
        } else if(res && res.result==="wait"){
          step(2); countdown(res.wait||RESEND_SEC);
          msg(2,"Tunggu "+(res.wait||RESEND_SEC)+" detik sebelum meminta kode baru.");
        } else if(res && res.result==="limit"){
          msg(isResend?2:m1,"Terlalu banyak permintaan kode. Coba lagi dalam 1 jam."); if(isResend) busy("mregResend",false,"Kirim ulang kode");
        } else {
          msg(isResend?2:m1,"Kode belum bisa dikirim. Periksa data Anda lalu coba lagi."); if(isResend) busy("mregResend",false,"Kirim ulang kode");
        }
      })
      .catch(function(){
        busy(first,false,"Kirim Kode OTP"); if(isResend) busy("mregResend",false,"Kirim ulang kode");
        msg(isResend?2:m1,"Gagal terhubung. Periksa koneksi internet Anda lalu coba lagi.");
      });
  }
  function onVerify(e){
    e.preventDefault();
    var code=q("#m_otp").value.trim();
    if(!/^\d{6}$/.test(code)){ msg(2,"Masukkan 6 digit kode dari email."); return; }
    busy("mregVerify",true,"Memeriksa...");
    api({ action:"otp_verify", email:pending.email, code:code })
      .then(function(res){
        busy("mregVerify",false,"Verifikasi &amp; Masuk");
        if(res && res.result==="ok"){
          var m={ nama:res.nama||pending.nama, email:pending.email, wa:res.wa||pending.wa, verified:true, t:new Date().toISOString() };
          saveMember(m); pending=null; clearInterval(timer);
          document.documentElement.classList.remove("mreg-lock"); modal.classList.remove("show");
          if(target && pageOf(target)!==pageOf(location.href)) location.href=target; else location.reload();
        } else if(res && res.result==="wrong"){
          msg(2,"Kode salah."+(typeof res.left==="number"?" Sisa percobaan: "+res.left+".":""));
        } else if(res && res.result==="too_many"){
          msg(2,"Terlalu banyak percobaan. Silakan minta kode baru.");
        } else if(res && res.result==="expired"){
          msg(2,"Kode sudah kedaluwarsa. Silakan minta kode baru.");
        } else {
          msg(2,"Verifikasi gagal. Silakan coba lagi.");
        }
      })
      .catch(function(){ busy("mregVerify",false,"Verifikasi &amp; Masuk"); msg(2,"Gagal terhubung. Periksa koneksi internet Anda lalu coba lagi."); });
  }

  // klik ke halaman berpagar -> Gabung dulu
  document.addEventListener("click", function(e){
    var a=e.target.closest && e.target.closest("a[href]"); if(!a) return;
    if(!getMember() && (isGated(a.href) || a.hasAttribute("data-join"))){ e.preventDefault(); openModal(a.href,false,a.hasAttribute("data-login")); }
  });
  // buka langsung halaman berpagar (mis. dari link yang dibagikan) -> Gabung dulu
  if(!getMember() && GATED.indexOf(pageOf(location.href))>=0){ openModal(location.href,true); }

  // tombol "Gabung" di halaman: bila sudah login, labelnya jadi "Buka Layanan"
  if(loggedIn){ [].forEach.call(document.querySelectorAll("[data-guest-only]"), function(el){ el.style.display="none"; }); }
  if(loggedIn){ [].forEach.call(document.querySelectorAll("[data-join-label]"), function(el){ el.firstChild.nodeValue = el.getAttribute("data-join-label")+" "; }); }

  // ekspor untuk halaman yang butuh (mis. form)
  window.APX = { WA:WA, GRUP:GRUP, YT:YT, EMAIL:EMAIL, member:getMember, url:SCRIPT_URL, key:REG_KEY, ready:backendReady };
  document.dispatchEvent(new CustomEvent("apx:ready"));
})();

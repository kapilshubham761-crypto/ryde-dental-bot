/* Ryde Dental Family chat widget — paste ONE script tag on the site:
   <script src="https://YOUR-APP-URL/widget.js" defer></script>
   Incremental rendering: messages are appended, never re-drawn, so typing is never interrupted. */
(function () {
  var API = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return ""; } })();
  var SID = localStorage.getItem("rdf_sid");
  if (!SID) { SID = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem("rdf_sid", SID); }
  var LOGKEY = "rdf_log_" + SID;
  var msgs = []; try { msgs = JSON.parse(localStorage.getItem(LOGKEY) || "[]"); } catch (e) {}
  var rendered = {};   // ts -> already in the DOM
  var seen = {};       // ts -> already known (event de-dupe)
  msgs.forEach(function (m) { if (m.ts) seen[m.ts] = 1; });
  var mode = "ai", open = false, started = false, listening = false, recog = null, pollTimer = null;

  var C = { teal: "#F17A31", tealDeep: "#C56428", coral: "#F17A31", coralDeep: "#C56428",
    ink: "#38291B", mint: "#FAEFE1", line: "#ECE2D4", muted: "#8A7A68", bg: "#FBF6EF" };

  var css = "" +
    "#rdfw,#rdfw *{box-sizing:border-box;font-family:'Inter',-apple-system,Segoe UI,Roboto,sans-serif}" +
    "#rdf-btn{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;z-index:2147483000;box-shadow:0 10px 30px rgba(10,63,61,.35);background:linear-gradient(135deg," + C.teal + "," + C.tealDeep + ");display:flex;align-items:center;justify-content:center;transition:transform .2s}" +
    "#rdf-btn:hover{transform:scale(1.06)}" +
    "#rdf-panel{position:fixed;right:20px;bottom:92px;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 120px);background:" + C.bg + ";border:1px solid " + C.line + ";border-radius:22px;overflow:hidden;display:none;flex-direction:column;z-index:2147483000;box-shadow:0 24px 60px rgba(10,63,61,.25)}" +
    "#rdf-panel.on{display:flex;animation:rdfup .25s ease}" +
    "@keyframes rdfup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}" +
    "#rdf-head{padding:14px 16px;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg," + C.teal + "," + C.tealDeep + ")}" +
    "#rdf-head .av{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
    "#rdf-head .nm{color:#fff;font-weight:700;font-size:15px;line-height:1.1}" +
    "#rdf-head .st{color:#FCE3CF;font-size:12px;display:flex;align-items:center;gap:6px}" +
    "#rdf-head.human{background:linear-gradient(135deg," + C.coralDeep + ",#954B1E)}#rdf-head.human .st{color:#FFE0C8}" +
    "#rdf-book{background:none;border:none;color:#fff;cursor:pointer;padding:4px;display:flex;align-items:center;margin-left:auto}" +
    "#rdf-x{margin-left:6px;background:none;border:none;color:#fff;cursor:pointer;font-size:20px;opacity:.85}" +
    "#rdf-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}" +
    ".rdf-row{display:flex;gap:8px;align-items:flex-end;animation:rdfin .25s ease}" +
    "@keyframes rdfin{from{opacity:0;transform:translateY(6px)}to{opacity:1}}" +
    ".rdf-row.me{justify-content:flex-end}" +
    ".rdf-b{max-width:80%;padding:10px 13px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}" +
    ".rdf-b.bot{background:#fff;color:" + C.ink + ";border:1px solid " + C.line + ";border-radius:16px 16px 16px 4px}" +
    ".rdf-b.me{background:" + C.teal + ";color:#EAFBF8;border-radius:16px 16px 4px 16px}" +
    ".rdf-b.team{background:#FBE1D1;color:" + C.ink + ";border:1px solid #F3D2BC;border-top:2px solid " + C.coral + ";border-radius:16px 16px 16px 4px}" +
    ".rdf-team-l{font-size:11px;font-weight:700;color:" + C.coralDeep + ";margin:0 0 3px 2px}" +
    ".rdf-sys{align-self:center;font-size:11.5px;color:" + C.muted + ";background:#F0EADE;padding:4px 11px;border-radius:20px}" +
    ".rdf-av{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#F39A5E," + C.tealDeep + ")}" +
    "#rdf-chips{padding:8px 14px 0;display:flex;flex-wrap:wrap;gap:7px}" +
    ".rdf-chip{padding:6px 12px;font-size:13px;font-weight:500;border-radius:20px;background:#fff;color:" + C.teal + ";border:1px solid " + C.line + ";cursor:pointer}" +
    ".rdf-chip:hover{transform:translateY(-1px)}" +
    "#rdf-foot{padding:12px;display:flex;align-items:center;gap:8px;border-top:1px solid " + C.line + "}" +
    "#rdf-inwrap{flex:1;display:flex;align-items:center;gap:4px;background:#fff;border:1px solid " + C.line + ";border-radius:24px;padding:0 6px 0 14px}" +
    "#rdf-in{flex:1;border:none;outline:none;padding:11px 0;font-size:16px;background:transparent;color:" + C.ink + "}" +
    ".rdf-ic{width:30px;height:30px;border:none;background:none;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center}" +
    ".rdf-ic.on{background:#FBE1D1}" +
    "#rdf-send{width:42px;height:42px;border:none;border-radius:50%;cursor:pointer;background:" + C.teal + ";display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
    ".rdf-dot{width:6px;height:6px;border-radius:50%;background:#F39A5E;display:inline-block;animation:rdfd 1s infinite}" +
    "@keyframes rdfd{0%,60%,100%{opacity:.4;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}" +
    "#rdf-form{position:absolute;left:0;right:0;top:68px;bottom:0;background:#FBF3EA;z-index:5;display:flex;flex-direction:column;animation:rdfin .2s ease}" +
    ".rdf-fh{padding:13px 16px;font-weight:700;font-size:14px;background:#fff;border-bottom:1px solid " + C.line + ";display:flex;align-items:center;color:" + C.ink + "}" +
    ".rdf-fh button{margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:" + C.ink + ";opacity:.6}" +
    ".rdf-fb{padding:16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto}" +
    ".rdf-fi{padding:11px 12px;border:1px solid " + C.line + ";border-radius:10px;outline:none;font-size:16px;background:#fff;color:" + C.ink + "}" +
    ".rdf-seg{display:flex;gap:8px}.rdf-seg button{flex:1;padding:10px;border:1px solid " + C.line + ";background:#fff;border-radius:10px;cursor:pointer;font-size:13px;color:" + C.muted + "}.rdf-seg button.on{background:" + C.teal + ";color:#EAFBF8;border-color:" + C.teal + "}" +
    ".rdf-fbtn{padding:12px;border:none;border-radius:10px;background:" + C.coral + ";color:#fff;font-weight:700;cursor:pointer;font-size:14px}" +
    ".rdf-fn{font-size:11px;color:" + C.muted + ";text-align:center}" +
    "@keyframes rdfspin{to{transform:rotate(360deg)}}";

  var spark = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAFBF8" stroke-width="2.2"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z"/></svg>';
  var sparkSm = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EAFBF8" stroke-width="2.2"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z"/></svg>';
  var head = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 14v-2a9 9 0 0118 0v2"/><path d="M21 16a2 2 0 01-2 2h-1v-5h1a2 2 0 012 2zM3 16a2 2 0 002 2h1v-5H5a2 2 0 00-2 2z"/></svg>';
  var calI = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var micI = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A7A68" stroke-width="2"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 17v4"/></svg>';
  var clipI = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A7A68" stroke-width="2"><path d="M21 12.5l-8.5 8.5a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8.5-8.5"/></svg>';
  var sendI = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#EAFBF8" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';

  var root = document.createElement("div"); root.id = "rdfw";
  root.innerHTML =
    '<style>' + css + '</style>' +
    '<button id="rdf-btn" aria-label="Chat with us">' + spark + '</button>' +
    '<div id="rdf-panel">' +
      '<div id="rdf-head"><div class="av">' + spark + '</div><div><div class="nm">Ryde Dental Family</div>' +
        '<div class="st"><span id="rdf-dot2" style="width:7px;height:7px;border-radius:50%;background:#FFFFFF;display:inline-block"></span><span id="rdf-stt">Smily · replies instantly</span></div></div>' +
        '<button id="rdf-book" title="Book appointment">' + calI + '</button>' +
        '<button id="rdf-x" aria-label="Close">&times;</button></div>' +
      '<div id="rdf-body"></div>' +
      '<div id="rdf-chips"></div>' +
      '<div id="rdf-foot"><div id="rdf-inwrap"><input id="rdf-in" placeholder="Type a message" autocomplete="off"/>' +
        '<button class="rdf-ic" id="rdf-mic" title="Voice">' + micI + '</button>' +
        '<button class="rdf-ic" id="rdf-clip" title="Attach a file">' + clipI + '</button></div>' +
        '<button id="rdf-send">' + sendI + '</button>' +
        '<input id="rdf-file" type="file" accept="image/*,.pdf,.doc,.docx" style="display:none"/></div>' +
    '</div>';
  document.body.appendChild(root);

  var $ = function (id) { return document.getElementById(id); };
  var body = $("rdf-body"), chipsEl = $("rdf-chips");
  function persist() { try { localStorage.setItem(LOGKEY, JSON.stringify(msgs.slice(-60))); } catch (e) {} }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function buildRow(m) {
    if (m.role === "system") return el("div", "rdf-sys", esc(m.text));
    var row = el("div", "rdf-row" + (m.role === "user" ? " me" : ""));
    if (m.role !== "user") row.appendChild(el("div", "rdf-av", m.role === "team" ? head : sparkSm));
    var wrap = el("div");
    if (m.role === "team") wrap.appendChild(el("div", "rdf-team-l", "Reception team"));
    var cls = m.role === "user" ? "me" : (m.role === "team" ? "team" : "bot");
    wrap.appendChild(el("div", "rdf-b " + cls, esc(m.text)));
    row.appendChild(wrap);
    return row;
  }
  // Append ONE message to the DOM (never rebuilds existing messages, so typing is never disturbed)
  function addRow(m) {
    if (rendered[m.ts]) return;
    rendered[m.ts] = 1;
    var anchor = $("rdf-typing");
    var node = buildRow(m);
    if (anchor) body.insertBefore(node, anchor); else body.appendChild(node);
  }
  function scrollDown() { body.scrollTop = body.scrollHeight; }
  function renderChips() {
    chipsEl.innerHTML = "";
    var last = msgs[msgs.length - 1];
    if (!last || last.role !== "bot" || !last.chips) return;
    last.chips.forEach(function (c) { var b = el("button", "rdf-chip", esc(c)); b.onclick = function () { sendMsg(c); }; chipsEl.appendChild(b); });
  }
  function sync() { var added = false; msgs.forEach(function (m) { if (!rendered[m.ts]) { addRow(m); added = true; } }); if (added) { scrollDown(); renderChips(); } }

  function push(role, text, extra) {
    var m = Object.assign({ role: role, text: text, ts: Date.now() + Math.random() }, extra || {});
    msgs.push(m); seen[m.ts] = 1; persist();
    addRow(m); scrollDown(); renderChips();
  }
  function typing(on) {
    var ex = $("rdf-typing"); if (ex) ex.remove();
    if (!on) return;
    var row = el("div", "rdf-row"); row.id = "rdf-typing";
    row.appendChild(el("div", "rdf-av", sparkSm));
    row.appendChild(el("div", "rdf-b bot", '<span class="rdf-dot"></span> <span class="rdf-dot" style="animation-delay:.15s"></span> <span class="rdf-dot" style="animation-delay:.3s"></span>'));
    body.appendChild(row); scrollDown();
  }
  function setMode(m) {
    if (m === mode) return; mode = m;
    $("rdf-head").className = m === "human" ? "human" : "";
    $("rdf-stt").textContent = m === "human" ? "Reception team · online" : "Smily · replies instantly";
    $("rdf-dot2").style.background = m === "human" ? "#FFE0C8" : "#FFFFFF";
    $("rdf-head").querySelector(".av").innerHTML = m === "human" ? head : spark;
  }

  function prewarm() { try { fetch(API + "/api/ping").catch(function () {}); } catch (e) {} }

  async function sendMsg(text) {
    text = (text || "").trim(); if (!text) return;
    push("user", text);
    chipsEl.innerHTML = "";
    typing(true);
    try {
      var r = await fetch(API + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SID, message: text }) });
      var d = await r.json();
      typing(false);
      if (d.mode) setMode(d.mode);
      if (d.reply) push("bot", d.reply, { chips: d.chips || [] });
    } catch (e) { typing(false); push("bot", "Sorry, I couldn't reach the clinic just now — please call (02) 9807 9800.", { chips: [] }); }
  }

  async function poll() {
    try {
      var r = await fetch(API + "/api/poll?sessionId=" + encodeURIComponent(SID));
      var d = await r.json();
      if (d.mode) setMode(d.mode);
      var fresh = false;
      (d.events || []).forEach(function (ev) { if (seen[ev.ts]) return; seen[ev.ts] = 1; msgs.push({ role: ev.role, text: ev.text, ts: ev.ts }); fresh = true; });
      if (fresh) { persist(); sync(); }   // append ONLY the new staff/system messages
    } catch (e) {}
  }


  // --- direct booking form ---
  function closeBook() { var f = $("rdf-form"); if (f) f.remove(); }
  function openBook() {
    if ($("rdf-form")) return;
    var svcs = ["General check-up & clean", "Tooth pain / emergency", "Teeth whitening", "Invisalign", "Dental implants", "Veneers / smile makeover", "Root canal", "Children's dentist", "Something else"];
    var whens = ["As soon as possible", "This week", "Next week", "I'm flexible"];
    var f = el("div"); f.id = "rdf-form";
    f.innerHTML = '<div class="rdf-fh">Book an appointment <button id="rdf-fx" aria-label="Close">&times;</button></div>' +
      '<div class="rdf-fb">' +
      '<input class="rdf-fi" id="bk-name" placeholder="Full name *"/>' +
      '<input class="rdf-fi" id="bk-phone" placeholder="Mobile *"/>' +
      '<input class="rdf-fi" id="bk-email" placeholder="Email (optional)"/>' +
      '<select class="rdf-fi" id="bk-svc"><option value="">What do you need? *</option>' + svcs.map(function (o) { return '<option>' + o + '</option>'; }).join("") + '</select>' +
      '<select class="rdf-fi" id="bk-when"><option value="">When suits you?</option>' + whens.map(function (o) { return '<option>' + o + '</option>'; }).join("") + '</select>' +
      '<div class="rdf-seg"><button data-pt="New patient" class="on">New patient</button><button data-pt="Existing patient">Existing patient</button></div>' +
      '<button id="bk-send" class="rdf-fbtn">Send request</button>' +
      '<div class="rdf-fn">The clinic will call to confirm. Urgent? Call (02) 9807 9800.</div></div>';
    $("rdf-panel").appendChild(f);
    var pt = "New patient";
    f.querySelectorAll("[data-pt]").forEach(function (b) { b.onclick = function () { pt = b.getAttribute("data-pt"); f.querySelectorAll("[data-pt]").forEach(function (x) { x.className = ""; }); b.className = "on"; }; });
    $("rdf-fx").onclick = closeBook;
    $("bk-send").onclick = function () {
      var name = $("bk-name").value.trim(), phone = $("bk-phone").value.trim(), email = $("bk-email").value.trim(), svc = $("bk-svc").value, when = $("bk-when").value;
      if (!name || !phone || !svc) { $("bk-send").textContent = "Please add name, mobile & service"; return; }
      $("bk-send").textContent = "Sending…"; $("bk-send").disabled = true;
      fetch(API + "/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: SID, name: name, phone: phone, email: email, service: svc, when: when, patientType: pt }) })
        .then(function (r) { return r.json(); })
        .then(function () { closeBook(); push("bot", "Thanks " + name.split(" ")[0] + "! 🎉 Your booking request is in — the team will call " + phone + " to confirm a time. Anything else? 😊", { chips: ["Opening hours", "Where are you?"] }); })
        .catch(function () { $("bk-send").textContent = "Try again"; $("bk-send").disabled = false; });
    };
  }

  // --- voice ---
  function toggleMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { push("system", "Voice needs Chrome or Edge — type away instead."); return; }
    if (listening) { recog && recog.stop(); return; }
    recog = new SR(); recog.lang = "en-AU"; recog.interimResults = true;
    recog.onresult = function (e) { var s = ""; for (var i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; $("rdf-in").value = s; };
    recog.onend = function () { listening = false; $("rdf-mic").className = "rdf-ic"; };
    try { recog.start(); listening = true; $("rdf-mic").className = "rdf-ic on"; } catch (e) {}
  }

  // --- wiring ---
  $("rdf-btn").onclick = function () {
    open = !open; $("rdf-panel").className = open ? "on" : "";
    if (open) {
      prewarm();
      if (!started) {
        started = true;
        if (!msgs.length) push("bot", "Hey, welcome to Ryde Dental Family 😊 I'm Smily. Ask me anything about our treatments, costs or hours — or tell me what you need and I'll help you book in.", { chips: ["Book a visit", "Meet the dentists", "Tooth pain", "Opening hours"] });
        else sync();
      }
      poll(); pollTimer = setInterval(poll, 4000);
    } else { clearInterval(pollTimer); }
  };
  $("rdf-x").onclick = function () { open = false; $("rdf-panel").className = ""; clearInterval(pollTimer); };
  $("rdf-book").onclick = openBook;
  $("rdf-send").onclick = function () { var v = $("rdf-in").value; $("rdf-in").value = ""; sendMsg(v); };
  $("rdf-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { var v = this.value; this.value = ""; sendMsg(v); } });
  $("rdf-mic").onclick = toggleMic;
  $("rdf-clip").onclick = function () { $("rdf-file").click(); };
  $("rdf-file").onchange = function (e) { var f = e.target.files[0]; if (!f) return; e.target.value = ""; push("user", "📎 " + f.name); sendMsg("I've attached a file: " + f.name); };
  prewarm();
})();

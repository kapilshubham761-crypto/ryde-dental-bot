// Ryde Dental Family — chatbot backend (Google Gemini) + staff inbox
// Run: npm install && npm start   (after copying .env.example -> .env)
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";
const HANDBACK_MIN = parseInt(process.env.HANDBACK_MINUTES) || 5;
const RESUME_MS = HANDBACK_MIN * 60 * 1000; // Smily resumes this many minutes after the last staff reply
// --- Optional: email the chats & bookings (works on Render free; sends over HTTPS, not SMTP) ---
const NOTIFY_WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || ""; // a Google Apps Script web-app URL (emails + logs to a Sheet)
const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || "";          // OR a free Web3Forms access key (email only)
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "rdftopryde@gmail.com";
const EMAIL_AFTER_MIN = parseInt(process.env.EMAIL_AFTER_MIN) || 10; // email a chat transcript this many minutes after it goes quiet
const EMAIL_ALL_CHATS = (process.env.EMAIL_ALL_CHATS || "true") !== "false"; // false = only email bookings/callbacks
const NOTIFY_ON = !!(NOTIFY_WEBHOOK_URL || WEB3FORMS_KEY);
const DATA_FILE = path.join(__dirname, "data.json");

/* -------------------- tiny JSON store -------------------- */
let db = { sessions: {}, leads: [] };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch {}
let t = null;
const save = () => { clearTimeout(t); t = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(db), () => {}), 200); };
function getSession(id) {
  if (!db.sessions[id]) db.sessions[id] = { id, mode: "ai", resumeAt: 0, messages: [], createdAt: Date.now(), lastActivity: Date.now() };
  return db.sessions[id];
}
function maybeResume(s) {
  if (s.mode === "human" && s.resumeAt && Date.now() >= s.resumeAt) {
    s.mode = "ai"; s.resumeAt = 0;
    s.messages.push({ role: "system", text: "Smily is back online and happy to help.", ts: Date.now() });
  }
}

/* -------------------- Smily's brief (the clinic's knowledge) -------------------- */
const SYSTEM_PROMPT = `You are Smily, the warm front-desk coordinator for Ryde Dental Family, a family dental practice inside Top Ryde City Shopping Centre, Sydney. You chat with patients on the clinic website.

KEEP IT SHORT — this is the most important rule. Reply in 1-2 short sentences, never more than about 35 words. No bullet points, no lists, no headings, no preamble like "Great question". Answer warmly and get to the point, then add one short next step. If there's more to explain, OFFER to explain or to book them in — don't write a long message. (Want even shorter? lower the 35; longer, raise it.)

Sound human and friendly (contractions, the occasional emoji are good), and always help the person either get their question answered or get booked in.

You are reception, NOT a dentist: never diagnose or give clinical/treatment advice. For pain, swelling or a broken tooth, tell them to call (02) 9807 9800 now. Never invent prices, facts or names beyond what's provided here - if unsure, say the team can confirm and offer to book or take a callback.

CLINIC: Inside Top Ryde City Shopping Centre, Shop 2035, Level LG1 (lower ground), Tucker Street side, Ryde NSW 2112. Phone (02) 9807 9800, email rdftopryde@gmail.com, WhatsApp available. Open Mon-Fri 9am-5pm, Sat 9am-4pm, closed Sunday, with Thursday-evening after-hours. Payment plans available; can usually claim through private health funds. Gentle with nervous patients. Emergency care available.

TREATMENTS: check-ups & cleans, white fillings, extractions & wisdom teeth, root canals, dental implants (single, immediate, All-on-4), crowns & bridges, porcelain veneers, teeth whitening, Invisalign, dentures, gum/periodontal & LANAP laser treatment, gum lifts, night guards for grinding, children's dentistry, smile makeovers, sleep/sedation options.

TEAM:
- Dr Gary Bedi - Principal Dentist & owner (BDS, MDS). Caring and thorough; special interests in laser dentistry, gum (periodontal) treatment, implants and wisdom teeth.
- Dr Andrew Bui - Dental Surgeon, 30+ years, University of Sydney. Calm and warm, great with anxious patients; preventive care through implants, Invisalign, orthodontics.
- Dr Fay Kong - General Dentist, Doctor of Dental Medicine (USyd). Holistic approach; interests in oral surgery and orthodontics.
- Support: Sahar (Practice Manager) and dental assistants Sabrina, Vani, Pari.

PRICING: never quote a number. Say it depends and needs a quick look, mention payment plans, and offer a consult or a callback for a proper quote.

BOOKING & CALLBACKS: help the person book by collecting, conversationally and ONE thing at a time, IN THIS ORDER: 1) their name, 2) best mobile, 3) what it's for, 4) roughly when suits, 5) and finally whether they are a NEW or EXISTING patient. For a callback you only need name, mobile and the topic. Once you have all of it, set the action and reply with a short, warm THANK YOU that confirms the details back (e.g. "Thanks Sarah! 🎉 You're booked for a check-up this week and the team will call 04xx xxx xxx to confirm a time.").

ALWAYS reply with ONLY a JSON object, no markdown:
{"reply":"<your message>","chips":["<short option>"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}
- chips: 2-4 short tappable suggestions in your voice; [] if none fit.
- action: "none" normally. Set "book" once you have name + mobile + what-for + when + new/existing (fill lead, with patientType = "New patient" or "Existing patient"). Set "callback" once you have name + mobile + topic (fill lead.name, lead.phone, lead.service).

STYLE EXAMPLES — match this short length exactly:
Them: what is a root canal
You: {"reply":"It clears the infection inside a tooth and seals it, so the pain goes and you keep your natural tooth 🙂 Want me to book you in?","chips":["Book a visit","Is it painful?"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}
Them: how much is whitening
You: {"reply":"It depends on the option, so we quote after a quick look — and we do payment plans. Shall I book a consult?","chips":["Book a consult","Request a callback"],"action":"none","lead":{"name":"","phone":"","service":"","when":"","patientType":""}}`;

/* -------------------- Gemini call -------------------- */
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function geminiOnce(model, session) {
  const contents = session.messages
    .filter(m => m.role === "user" || m.role === "bot" || m.role === "team")
    .slice(-12)
    .map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 256, responseMimeType: "application/json" }, // 256 keeps answers short. Raise for longer replies.
    }),
  });
  if (!res.ok) { const err = new Error("Gemini " + res.status + ": " + (await res.text()).slice(0, 300)); err.status = res.status; throw err; }
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  return parseReply(txt);
}
// Auto-retry when Google's model is busy (503/429), then fall back to a lighter free model
async function callGemini(session) {
  const models = GEMINI_MODEL === FALLBACK_MODEL ? [GEMINI_MODEL] : [GEMINI_MODEL, FALLBACK_MODEL];
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await geminiOnce(model, session); }
      catch (e) { lastErr = e; if (e.status === 503 || e.status === 429) { await sleep(700 * (attempt + 1)); continue; } throw e; }
    }
  }
  throw lastErr;
}
function parseReply(raw) {
  let s = (raw || "").trim().replace(/```json|```/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  try {
    const o = JSON.parse(s);
    return {
      reply: o.reply || "Sorry, could you say that another way?",
      chips: Array.isArray(o.chips) ? o.chips.slice(0, 4) : [],
      action: o.action === "book" || o.action === "callback" ? o.action : "none",
      lead: o.lead && typeof o.lead === "object" ? o.lead : null,
    };
  } catch {
    return { reply: raw && raw.length < 500 ? raw : "Sorry, I had a hiccup — you can reach us on (02) 9807 9800.", chips: ["Book a visit", "Request a callback"], action: "none", lead: null };
  }
}

/* -------------------- notifications: email the chats & bookings -------------------- */
function transcriptText(s) {
  return s.messages.map(m => {
    const who = m.role === "user" ? "Patient" : m.role === "team" ? "Reception" : m.role === "system" ? "\u2014" : "Smily";
    return who + ": " + m.text;
  }).join("\n");
}
async function notify(subject, text) {
  try {
    if (WEB3FORMS_KEY) {
      await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject, from_name: "Smily \u2014 Ryde Dental Family", message: text }),
      });
    } else if (NOTIFY_WEBHOOK_URL) {
      await fetch(NOTIFY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message: text, to: NOTIFY_EMAIL }),
      });
    }
  } catch (e) { console.error("notify failed:", e.message); }
}
function emailLead(s, lead, type) {
  if (!NOTIFY_ON) return;
  const subject = (type === "Callback" ? "\ud83d\udcde New callback \u2014 " : "\ud83d\udcc5 New booking \u2014 ") + lead.name;
  const body =
    type + " request via Smily\n\n" +
    "Name: " + lead.name + "\n" +
    "Mobile: " + lead.phone + "\n" +
    (lead.email ? "Email: " + lead.email + "\n" : "") +
    "For: " + (lead.service || "General enquiry") + "\n" +
    "When: " + (lead.when || (type === "Callback" ? "Callback requested" : "Flexible")) + "\n" +
    (lead.patientType && lead.patientType !== "\u2014" ? "Patient: " + lead.patientType + "\n" : "") +
    "\n--- Conversation ---\n" + transcriptText(s);
  s.emailedCount = s.messages.length; s.leadEmailed = true;
  notify(subject, body);
}
// Lazily email a chat transcript once it has gone quiet (runs whenever any request comes in)
function sweepIdle() {
  if (!NOTIFY_ON || !EMAIL_ALL_CHATS) return;
  const now = Date.now(), cutoff = EMAIL_AFTER_MIN * 60 * 1000;
  let changed = false;
  for (const id in db.sessions) {
    const s = db.sessions[id];
    if (!s.messages.some(m => m.role === "user")) continue;          // skip empty chats
    const emailed = s.emailedCount || 0;
    if (s.messages.length <= emailed) continue;                      // nothing new since last email
    if (now - s.lastActivity < cutoff) continue;                     // still active, wait
    if (!s.messages.slice(emailed).some(m => m.role === "user")) { s.emailedCount = s.messages.length; changed = true; continue; }
    s.emailedCount = s.messages.length; changed = true;
    notify("\ud83d\udcac Chat transcript \u2014 visitor " + id.slice(-4), transcriptText(s) + (s.leadEmailed ? "" : "\n\n(No booking was made in this chat.)"));
  }
  if (changed) save();
}

/* -------------------- app -------------------- */
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.end();
  next();
});
const auth = (req, res, next) => req.get("x-admin-token") === ADMIN_TOKEN ? next() : res.status(401).json({ error: "unauthorized" });

// patient -> bot
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, attachment } = req.body || {};
  if (!sessionId || (!message && !attachment)) return res.status(400).json({ error: "missing fields" });
  const s = getSession(sessionId); s.lastActivity = Date.now();
  sweepIdle();
  if (attachment) s.messages.push({ role: "user", text: "Sent a file: " + String(attachment).slice(0, 120), ts: Date.now(), attach: true });
  if (message) s.messages.push({ role: "user", text: String(message).slice(0, 2000), ts: Date.now() });
  maybeResume(s);
  if (s.mode === "human") { save(); return res.json({ reply: null, queued: true, mode: "human" }); }
  if (!GEMINI_KEY) { save(); return res.json({ reply: "(Setup needed: add your GEMINI_API_KEY in .env) — meanwhile call us on (02) 9807 9800.", chips: [], mode: "ai" }); }
  try {
    const out = await callGemini(s);
    s.messages.push({ role: "bot", text: out.reply, ts: Date.now() });
    if ((out.action === "book" || out.action === "callback") && out.lead?.name && out.lead?.phone) {
      const type = out.action === "callback" ? "Callback" : "Booking";
      const norm = String(out.lead.phone).replace(/\D/g, "");
      const dup = db.leads.some(l => l.sessionId === sessionId && l.phone.replace(/\D/g, "") === norm);
      if (!dup) db.leads.unshift({
        id: "RDF-" + Date.now().toString().slice(-6), sessionId, type,
        name: out.lead.name, phone: out.lead.phone, email: "", service: out.lead.service || "General enquiry",
        when: type === "Callback" ? "Callback requested" : (out.lead.when || "Flexible"),
        patientType: type === "Callback" ? "—" : (out.lead.patientType || "New patient"),
        status: "New", createdAt: Date.now(),
      });
    }
    save();
    res.json({ reply: out.reply, chips: out.chips, mode: "ai" });
  } catch (e) {
    console.error("Gemini error:", e.message);
    res.json({ reply: "Sorry, I'm having a moment — you can reach our team on (02) 9807 9800. Want to leave your number for a callback?", chips: ["Request a callback"], mode: "ai" });
  }
});

// patient widget polls for staff replies / resume
app.get("/api/poll", (req, res) => {
  const s = db.sessions[req.query.sessionId];
  if (!s) return res.json({ mode: "ai", resumeAt: 0, events: [] });
  maybeResume(s); sweepIdle(); save();
  const events = s.messages.filter(m => m.role === "team" || m.role === "system").map(m => ({ role: m.role, text: m.text, ts: m.ts }));
  res.json({ mode: s.mode, resumeAt: s.resumeAt, events });
});

// staff inbox data
app.get("/api/admin/data", auth, (req, res) => {
  const sessions = Object.values(db.sessions)
    .sort((a, b) => b.lastActivity - a.lastActivity).slice(0, 40)
    .map(s => ({ id: s.id, mode: s.mode, resumeAt: s.resumeAt, lastActivity: s.lastActivity, messages: s.messages }));
  res.json({ sessions, leads: db.leads.slice(0, 200) });
});
// staff replies (this pauses the AI for that chat)
app.post("/api/staff/reply", auth, (req, res) => {
  const { sessionId, text } = req.body || {};
  if (!sessionId || !text) return res.status(400).json({ error: "missing" });
  const s = getSession(sessionId);
  s.messages.push({ role: "team", text: String(text).slice(0, 2000), ts: Date.now() });
  s.mode = "human"; s.resumeAt = Date.now() + RESUME_MS; s.lastActivity = Date.now(); save();
  res.json({ ok: true });
});
// hand a chat back to the AI immediately
app.post("/api/staff/handback", auth, (req, res) => {
  const s = db.sessions[req.body?.sessionId];
  if (s) { s.mode = "ai"; s.resumeAt = 0; s.messages.push({ role: "system", text: "Smily is back online and happy to help.", ts: Date.now() }); save(); }
  res.json({ ok: true });
});
app.post("/api/admin/lead-status", auth, (req, res) => {
  const l = db.leads.find(x => x.id === req.body?.id);
  if (l) { l.status = req.body.status; save(); }
  res.json({ ok: true });
});

// Fast wake-up ping (the widget calls this on page load so the server is awake by the time someone chats)
app.get("/api/ping", (_req, res) => res.json({ ok: true }));

// DIRECT booking form / early details capture -> saves a lead (no AI call). Merges if we already have this person.
app.post("/api/book", (req, res) => {
  const { sessionId, name, phone, email, service, when, patientType } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });
  const sid = sessionId || "direct_" + Date.now();
  const s = getSession(sid); s.lastActivity = Date.now();
  const norm = String(phone).replace(/\D/g, "");
  const existing = db.leads.find(l => l.sessionId === sid && l.phone.replace(/\D/g, "") === norm);
  if (existing) {
    existing.name = name || existing.name;
    if (email) existing.email = email;
    if (service && service !== "Website enquiry") existing.service = service;
    if (when) existing.when = when;
    if (patientType) existing.patientType = patientType;
  } else {
    db.leads.unshift({
      id: "RDF-" + Date.now().toString().slice(-6), sessionId: sid, type: "Booking",
      name, phone, email: email || "", service: service || "General enquiry", when: when || "Flexible",
      patientType: patientType || "New patient", status: "New", createdAt: Date.now(), direct: true,
    });
    s.messages.push({ role: "user", text: "[Sent details via the website]", ts: Date.now() });
  }
  emailLead(s, { name, phone, email: email || "", service: service || "General enquiry", when: when || "Flexible", patientType: patientType || "New patient" }, "Booking");
  save();
  res.json({ ok: true });
});

app.use("/", express.static(path.join(__dirname, "public")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.listen(PORT, () => {
  console.log(`\n  Ryde Dental chatbot running on http://localhost:${PORT}`);
  console.log(`  Test widget:  http://localhost:${PORT}/`);
  console.log(`  Staff inbox:  http://localhost:${PORT}/admin   (token: ${ADMIN_TOKEN})`);
  if (!GEMINI_KEY) console.log("  ⚠  No GEMINI_API_KEY set — add it to .env\n");
});

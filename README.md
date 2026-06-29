# Smily — Ryde Dental Family AI Chatbot (final build, free to run)

Smily is the website assistant. This folder has everything to put her live.

## The files
| File | What it is |
|---|---|
| `server.js` | The brain/backend. Holds the Gemini key, answers patients, stores bookings. |
| `public/widget.js` | The chat bubble. ONE line added to the website. |
| `public/admin.html` | The **staff inbox** — read chats, take over, see bookings & callbacks. |
| `public/index.html` | A test page (only for you, not the real site). |
| `.env.example` | Where your key + password go. |
| `README.md` | This guide. |

---

## What it costs: **$0 to run**
- **Gemini AI** — free tier, no credit card.
- **Hosting** — free tier.
- **Dr Bedi's domain/website/hosting** — already paid by him, nothing new.

> Honest note: free hosting "sleeps" when no one's used it for a while, so the **first** message after a quiet period can take ~30 seconds to wake up. To avoid that it's about A$5/month — optional, your call. Everything else stays free.

---

## What access you'll need (and from whom)
| To do this | You need | Whose account |
|---|---|---|
| Get the AI key | A Google login | **Yours** (free) |
| Put the backend online | A GitHub + a Render login | **Yours** (free, made in Part B) |
| Add the bubble to the site | WordPress admin login **OR** just hand the one line to whoever manages Dr Bedi's site | **Dr Bedi's** website (this is the only access to his property you need) |
| Domain / cPanel / hosting | **Not needed** | — |

So: you do the AI key + hosting under **your own** accounts. The only thing touching Dr Bedi's side is pasting **one line** into his WordPress — which you can do yourself if you have the login, or email to his web person.

---

## PART A — Get the free AI key (about 3 minutes)
1. Go to **https://aistudio.google.com**
2. Sign in with any Google account.
3. Click **Get API key** (top area) → **Create API key** → **Create API key in new project**.
4. Click **Copy**. Keep it somewhere safe for Part B. (Never paste it into a chat or the website — it only ever goes into the host's settings.)

## PART B — Put the backend online for free (about 8 minutes)

**B1. Make a GitHub account & upload the folder (no coding):**
1. Go to **https://github.com** → Sign up (free).
2. Click the **+** (top right) → **New repository** → name it `ryde-dental-bot` → **Create repository**.
3. On the new repo page click **uploading an existing file**.
4. Drag in **all the files from this folder** (server.js, package.json, the `public` folder, etc.). Wait for them to finish, then click **Commit changes**.

**B2. Deploy it on Render (free):**
1. Go to **https://render.com** → **Get Started** → sign in **with GitHub**.
2. **New +** → **Web Service** → **Build and deploy from a Git repository** → pick `ryde-dental-bot` → **Connect**.
3. Fill in:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** **Free**
4. Open **Advanced / Environment Variables** and add:
   - `GEMINI_API_KEY` = the key from Part A
   - `ADMIN_TOKEN` = a password you choose (for the staff inbox)
   - `HANDBACK_MINUTES` = `1` (or leave for 5)
5. Click **Create Web Service**. After a few minutes you get a live URL like
   **`https://ryde-dental-bot.onrender.com`** — copy it.
6. Open that URL in a browser to check the chat bubble works.

## PART C — Add the bubble to Dr Bedi's website (about 3 minutes)
Take your live URL from Part B and build this one line (swap in your URL):

```html
<script src="https://ryde-dental-bot.onrender.com/widget.js" defer></script>
```

Add it to the WordPress site (any one way):
1. **Log in** to the site's WordPress admin (`yourdomain.com/wp-admin`).
2. **Plugins → Add New** → search **WPCode** (or **Insert Headers and Footers**) → **Install** → **Activate**.
3. In WPCode: **+ Add Snippet → Add Your Custom Code (HTML)** → paste the line → set location **Site Wide Footer** → **Save & Activate**.
4. Visit the website — the chat bubble is now in the bottom-right, on every page. 🎉

(No WordPress access? Just email that one line to whoever manages Dr Bedi's site — it's a 10-second paste for them.)

## PART D — Where the staff team reads messages
Your staff inbox is your live URL + `/admin`:
```
https://ryde-dental-bot.onrender.com/admin
```
Bookmark it, share with reception. They type the `ADMIN_TOKEN` password once. There they can see every chat, **reply as reception** (which pauses Smily), and see all bookings & callbacks with a New → Contacted → Booked status.

---

## What Smily does (this build)
- **Answers** any treatment / cost / hours question in **1–2 short sentences** (no rambling).
- **Knows the team** — Dr Gary Bedi, Dr Andrew Bui, Dr Fay Kong.
- **Books people in** by chatting: asks name → mobile → what it's for → when → **new or existing patient**, then replies with a **thank-you** confirming the details.
- **Direct booking** — a 📅 button in the chat header opens a quick form (name, mobile, service, time, new/existing) for people who'd rather not chat.
- **Human takeover** — when a staff member replies from the inbox, Smily goes quiet for that chat and **comes back automatically** after the handback time if no one replies (set by `HANDBACK_MINUTES`).
- **Voice** input (mic) and **file upload** (paperclip) in the message bar.
- **Smart warm-up** — the widget wakes the (free) server the moment someone opens the page, so chats are usually instant. If it's still waking, a friendly card asks for name, mobile & email so the enquiry is captured even during the wait.

## Settings you can change (no real coding)
| Want to change | Where | How |
|---|---|---|
| How fast Smily takes a chat back | `.env` / Render env | `HANDBACK_MINUTES=1` for 1 minute |
| Answer length | `server.js` → `SYSTEM_PROMPT` | change the "35 words" / lower `maxOutputTokens` |
| Smily's wording, hours, offers, team | `server.js` → `SYSTEM_PROMPT` | edit the text, redeploy |
| Free vs Pro AI | `.env` | `GEMINI_MODEL=gemini-2.5-pro` (paid) |

After editing files: re-upload them to GitHub (drag, Commit) and Render redeploys automatically.

## Don't lose a booking
The widget now wakes the server early and captures name/mobile/email during any wait, which handles most cold-start cases. The one remaining gap: if someone fills that card and closes the tab *before* the server finishes waking, that one detail can't be delivered. The starter also saves to a file that free hosting can reset on sleep. So for a real clinic you want a permanent record. Cheapest safe options (I can add either, still free):
- **Email every booking** to `rdftopryde@gmail.com` the moment it's made, or
- Log every booking to a **Google Sheet**.

## EMAIL-SETUP — get every chat & booking in your inbox

Smily can email you each booking the moment it happens, and a transcript of every chat once it goes quiet. It sends over HTTPS (Render's free plan blocks normal email ports, so this is the way that works for free). Two options — pick one:

**Option 1 (recommended) — email + a permanent Google Sheet.** Best because it also gives you a permanent record (closing the "don't lose a booking" gap).
1. Open the file `google-apps-script.gs` in this kit and follow the short setup notes at the top (make a blank Google Sheet → Extensions → Apps Script → paste the file → Deploy as Web app → copy the URL).
2. In Render, add an environment variable: `NOTIFY_WEBHOOK_URL` = the web-app URL you copied.
3. Save. Done — every chat and booking is now emailed to the clinic and logged in that Sheet.

**Option 2 (simplest) — email only.**
1. Go to https://web3forms.com, enter the clinic's email (`rdftopryde@gmail.com`), and it sends you a free **access key**.
2. In Render, add an environment variable: `WEB3FORMS_KEY` = that key.
3. Save. Bookings and chat transcripts now arrive by email. (Web3Forms free has a monthly cap, so for a busy clinic Option 1 is sturdier.)

**Settings (both optional):**
- `EMAIL_ALL_CHATS` — `true` emails every chat transcript; set `false` to email only bookings & callbacks.
- `EMAIL_AFTER_MIN` — minutes of quiet before a chat's transcript is emailed (default 10).

**Note on timing:** transcripts are sent when the next bit of traffic hits the server, so during the day they arrive promptly; overnight (server asleep) a few may batch together the next morning. Bookings are emailed straight away whenever the server is awake.

## Privacy
On Gemini's free tier Google may use inputs to improve their models, so patient **names & numbers are handled by your backend and never sent to the AI** — only general questions reach Gemini. For full privacy, paid Gemini Flash (~A$0.0002/message) doesn't train on your data.

## Troubleshooting
- **"Setup needed" reply** → `GEMINI_API_KEY` missing in Render's env vars.
- **Inbox "Wrong password"** → `ADMIN_TOKEN` typed doesn't match Render's env var.
- **No bubble on the site** → the `<script>` URL must match your live backend and end in `/widget.js`.
- **First message very slow** → free host was asleep; it wakes after ~30s (or go always-on for ~A$5/mo).

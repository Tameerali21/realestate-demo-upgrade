# "Never Miss a Customer" — Interactive Demo (REAL ESTATE)

A fictional US real-estate brokerage website (**Lantern & Key Realty — Boutique
Brokerage, Boise, ID**; web-searched 2026-09-30 to confirm no real business by
that name exists in Boise) with an embedded AI coordinator (**Sofia**) that
demonstrates Tameer Ali's **"Never Miss a Customer"** automation system to a
brokerage owner in ~60 seconds.

**100% static. No backend, no build step, zero external requests, zero tracking.**
Works from `file://` and any static host.

Part of the multi-niche demo factory (see `~/workspace/outreach/demo-links.md`).
Sibling demos: `~/workspace/outreach/demo-dental/` (primary pattern reference),
`~/workspace/outreach/demo-legal/` (most advanced example).

## What it demonstrates (the 4 flows)

1. **Buying / selling Q&A** — home valuation ("what's my home worth?" → free
   data-backed valuation), commissions/fees (typical 5–6%, negotiable + 4.5%
   full-service listing plan), first-time buyer guidance, mortgage/pre-approval
   steps, open houses, relocation, listings, and hours/location.
2. **Home-tour booking** — interest (buying / selling / valuation / browsing) →
   name → optional text reminder → preferred day → time → confirmation card with
   booking reference (e.g. `LK-X7Q2M`).
3. **After-hours lead capture** *(the money flow)* — tap "🌙 After-hours demo":
   a notice reads *"It's 11:42 PM — the office is closed right now, but I'm
   Sofia, Lantern & Key's coordinator, and I'm still here."* Pick buying /
   selling / valuation → name + phone (validated) + details → "Saved! The
   morning team will follow up first thing" → a mini **"Saved to your
   dashboard"** card appears. Leads persist in the browser only
   (`localStorage` key `nmc_realestate_leads`) — no server, no external
   requests.
4. **Review request** — tap "⭐ Rate your experience" → tap the stars:
   - **5 stars** → "Would you share that on Google?" + Google review button.
   - **1–4 stars** → "What could we do better?" → feedback captured (saved as a
     private lead) → "Our broker will personally follow up."

Plus: graceful fallbacks for off-script input (never dead-ends), quick-reply
chips, typing indicator with realistic delays, auto-open nudge after ~8s, and
the site's "Book a home tour" buttons (plus the "What's my home worth?" hero
button → valuation Q&A) jump straight into flows.

Copy is in **buyer language** ("never miss a buyer", "after-hours",
"same-day showings") — never "AI chatbot" jargon. Widget header/footer carries
a small credit: *"Live demo by Tameer Ali · AI Automation"*. Footer:
*"Interactive demo experience — bookings and messages shown here are
simulated."*

## Personalize per prospect

Append query params — the brokerage name, tagline, city, address and phone
swap everywhere (page + widget + booking-reference prefix):

```
index.html?biz=Summit%20Home%20Group&tagline=Modern%20Brokerage&city=Denver%2C%20CO&address=900%20Grant%20St%2C%20Denver%2C%20CO%2080203&phone=%28303%29%20555-0119
```

| Param     | Default                          |
|-----------|----------------------------------|
| `biz`     | Lantern & Key Realty             |
| `tagline` | Boutique Brokerage               |
| `city`    | Boise, ID                        |
| `address` | 4812 W Harborview Ave, Boise, ID 83703 |
| `phone`   | (208) 555-0147                   |

`?fast=1` skips animation delays (used by the automated test harness).

**Outreach workflow:** for each real-estate prospect, generate their link with
`?biz=<Their Brokerage Name>` so the demo greets them as *their own*
brokerage.

## Hosting options

- **Fastest (recommended):** Netlify Drop / Vercel / Cloudflare Pages / GitHub
  Pages — drag the `demo-realestate/` folder, get a public HTTPS link in ~1
  minute.
- **Any static host** works — it's plain HTML/CSS/JS.
- **Local preview:** `python3 -m http.server` inside `demo-realestate/`.

Hosting is handled by the parent agent — this subagent builds and verifies only.

## Verification

End-to-end harness at `/tmp/verify-realestate/verify-realestate.js`
(puppeteer + bundled Chromium): walks all 4 flows, the 5-star and 3-star
review branches, bad-phone rejection (incl. the digit-less "notaphone" case),
graceful fallback, `?biz=` personalization (name swaps everywhere, ref prefix
follows), hero-CTA booking jump, valuation CTA jump, lead persistence in
localStorage, and a mobile viewport — and fails on **any** console/page
error or any external network request.

Last run: **41/41 checks passed, zero console errors, zero page errors, zero
external network requests** (2026-09-30).

## Files

- `index.html` — brokerage site (hero, listings, services, how-it-works,
  testimonials, hours/location, footer) + widget markup
- `assets/style.css` — deep emerald + warm stone + copper theme (system fonts
  only, no external requests)
- `assets/widget.js` — Sofia conversation engine (intents,
  booking/after-hours/review state machines, personalization, lead
  persistence, test hooks via `window.__maya`)

*Note: bookings, leads and reviews in this demo are simulated in the browser —
the footer says so. A real client build wires these to the brokerage's actual
scheduling/CRM/notification stack.*

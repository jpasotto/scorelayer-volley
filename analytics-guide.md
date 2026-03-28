# ScoreLayer Volley — Analytics Guide

## Overview

Two cookieless analytics tiers are active since v2.7. No consent banner is needed — no cookies, no fingerprinting, no personal data is stored.

---

## Tier 1 — Cloudflare Web Analytics

**What it tracks:** Pageviews, unique visitors, referrers, countries, devices.
**Best for:** "Is Instagram driving traffic? How many people opened the app?"

### How to access

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign in to your Cloudflare account
3. Click **Web Analytics** in the left sidebar
4. Click **jpasotto.github.io**

### Key reports

| Question | Where to look |
|---|---|
| How many visitors today? | Overview → Visits |
| Is Instagram sending traffic? | Referrers — look for `l.instagram.com` |
| iOS vs desktop? | Devices |
| Which countries? | Countries |

### Notes

- Data appears in near real-time (minutes)
- No historical limit on free plan
- Token: `7b35cfd2c4534994b637cf07d6d48614`

---

## Tier 2 — Matomo (self-hosted, cookieless)

**What it tracks:** In-app events (exports, match flow, highlights), plus pageviews.
**Best for:** "Which exports are used? Are people finishing matches? Is MP4 working?"

### How to access

1. Go to [quandopasso.com/Matomo](https://quandopasso.com/Matomo)
2. Sign in to your Matomo account
3. Make sure the site selector (top bar) shows **SCORELAYER** — not Matomo

### Key reports

| Question | Path in Matomo |
|---|---|
| How many visits? | Visitors → Overview |
| Real-time visitors | Visitors → Real-time |
| Instagram referrals | Referrers → Websites → look for `l.instagram.com` |
| iOS vs desktop | Visitors → Devices |
| Which exports are popular? | Behaviour → Events → Category: `Export` |
| Match start vs completion rate | Behaviour → Events → Category: `Match` |
| Highlight adoption | Behaviour → Events → Category: `Highlight` |
| MP4 success rate | Events: `Export.MP4Start` vs `Export.MP4Success` |

### Tracked events reference

| Category | Action | Trigger |
|---|---|---|
| Match | Start | User taps "Start Match" |
| Match | Complete | Match ends naturally (sets won) |
| Match | EndEarly | User manually ends match |
| Highlight | Mark | A highlight is marked |
| Export | SRT | SRT export opened |
| Export | FCPXML | FCPXML export opened |
| Export | ASS | ASS export opened |
| Export | CSV | CSV export (match screen or download) |
| Export | ChromaScript | Chroma shell script viewed |
| Export | ChromaKit | Chroma kit ZIP downloaded |
| Export | Chapters | YouTube chapters export opened |
| Export | HlSRT | Highlights-only SRT export opened |
| Export | MP4Start | MP4 encoding started |
| Export | MP4Success | MP4 encoding completed successfully |

### Cron job (required for historical reports)

Real-time data works without it, but daily/weekly/monthly reports require Matomo's archiving cron to be configured in cPanel:

1. In Matomo → **Settings (gear) → System → General Settings**
2. Copy the cron command shown under "Archive Reports"
3. In **cPanel → Cron Jobs** → add it to run every hour

---

## GDPR compliance summary

| | Cloudflare WA | Matomo |
|---|---|---|
| Cookies | None | None (`disableCookies()`) |
| Personal data | None | None |
| Consent banner | Not required | Not required |
| Data location | Cloudflare edge | quandopasso.com (your server) |

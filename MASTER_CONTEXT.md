# LANDMARKETTHAI MASTER CONTEXT v1

> Primary reference and source of truth for the LandmarketThai project.
> Any AI assistant, developer, marketer, designer, project manager, referral partner coordinator, or stakeholder should be able to understand the business, website, inventory, lead flow, referral model, assets, and roadmap from this document.

---

## Brand Overview

**Thai Brand Name:** ตลาดที่ดินไทย  
**English Brand:** LandmarketThai

### Mission

Connect industrial land owners, investors, buyers, and referral partners through a modern lead-driven marketplace platform.

**Focus areas:**
- Industrial Land
- Investment Land
- EEC Industrial Opportunities
- Referral-Based Land Transactions

---

## Domains

| Domain | Purpose |
|--------|---------|
| `landmarketthai.com` | Primary domain — all SEO authority consolidated here |
| `landthaimarket.com` | Brand protection — 301 redirect to landmarketthai.com |
| `taradteedinthai.com` | Romanized Thai brand — 301 redirect to landmarketthai.com |
| `ตลาดที่ดินไทย.com` (punycode: `xn--l3cabjbl8ds1jxaj7pxb.com`) | Thai-language brand domain — 301 redirect to landmarketthai.com |

---

## Social Assets

### Facebook
- URL: https://www.facebook.com/Landmarketthai
- Purpose: Lead generation, brand awareness, advertising traffic

### LINE Official Account
- Handle: `@landmarketthai`
- Primary communication channel

**Current functions:**
- Rich Menu
- Lead engagement
- Customer communication
- Referral partner communication

**Planned functions:**
- Lead notifications
- Site visit coordination
- Buyer communication

---

## Sales Toolkit

**Google Drive:** https://drive.google.com/drive/folders/1uBzqWJpPDS_C_QyvWSpXR4QBylSgVkXu

Contains:
- Property images
- Drone videos
- Sales sheets
- Buyer sheets
- Maps
- Zoning information
- Marketing assets

---

## Business Model

LandmarketThai generates leads from 3 primary audiences.

### Buyers / Investors
Users looking for industrial land, factory land, logistics land, investment opportunities, and EEC properties.

### Land Owners
Owners who wish to sell land, find buyers, or access industrial land demand.

### Referral Partners
Brokers, property agents, land scouts, consultants, and local connectors. Partners submit qualified leads and receive compensation according to project terms.

---

## Current Inventory

### Property 1 — 109 Rai Industrial Land (EEC Rayong)

| Field | Detail |
|-------|--------|
| Location | EEC Rayong |
| Size | 109 Rai 2 Ngan 52 Sq.Wah |
| Zoning | Purple Industrial Zone |
| Price | 2.75 Million THB per Rai |
| Referral Reward | Up to 4,000,000 THB |

**Highlights:**
- Approx. 240m frontage
- Dual access, trailer accessible
- Near WHA, near BYD
- Industrial-ready location

---

### Property 2 — 37 Rai Industrial Land (EEC Rayong)

| Field | Detail |
|-------|--------|
| Location | EEC Rayong |
| Size | 37 Rai |
| Zoning | Purple Industrial Zone |
| Price | 2.3 Million THB per Rai |
| Referral Reward | Up to 1,200,000 THB |

**Highlights:**
- Frontage on Road 2026
- Approx. 240m frontage
- Rear side adjacent to water
- Industrial use potential

---

## Upcoming Inventory

### Kabin Buri Industrial Land

**Status:** Upcoming — visual assets available, commercial details pending

Awaiting: size, price, zoning, access details, referral compensation.

---

## Website

### Primary Goal

Generate qualified leads. Not a listing portal for browsing. **Lead generation is the primary KPI.**

### Main Lead Types

| Type | Page | Purpose |
|------|------|---------|
| Partner Lead | Become Partner | Acquire referral partners |
| Owner Lead | Submit Land | Acquire land listings |
| Buyer Lead | Request Details | Acquire buyers and investors |

---

## Current Website Status

### Completed
- Google OAuth
- Supabase SSR Authentication
- Lead Capture System
- Referral Attribution
- Domain Setup & DNS
- Vercel Deployment
- Native LINE integration (engineering implementation; Production cutover pending)
- Production Lead Flow Validation

### In Progress
- LINE Lead Notifications
- Property Expansion
- Homepage Optimization
- Property Landing Pages

### Future
- DigitalOcean Spaces
- Advanced SEO
- Buyer Demand Pages
- Case Studies
- Market Insights

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4 |
| Backend | Neon Postgres |
| Auth | Neon Managed Better Auth, Google OAuth |
| Notifications | Neon transactional outbox → native LINE worker |
| Hosting | Vercel |
| Storage (Planned) | DigitalOcean Spaces |

---

## Lead Flow

```
Website Visitor
       ↓
   Lead Form
       ↓
   Validation
       ↓
   Neon Postgres
       ↓
Referral Attribution
       ↓
Durable Notification Outbox
       ↓
Native LINE Worker → LINE Messaging API
       ↓
 Sales Follow-up
```

---

## Referral Attribution Rules

| Scenario | Behavior |
|----------|---------|
| Valid referral code | Stored on `leads.referral_code`, attributed, linked to partner |
| Invalid referral code | Not stored in referral field; preserved as `details.raw_referral_code` |
| Partner signup | Never creates `referral_attributions` |
| Buyer lead with referral code | Can create `referral_attributions` |
| Owner lead with referral code | Can create `referral_attributions` |

---

## Conversion Priorities

### Priority 1
- Homepage optimization
- 109 Rai landing page
- 37 Rai landing page
- LINE lead notifications
- Production deployment validation

### Priority 2
- Buyer demand pages
- Province SEO pages
- EEC SEO pages

### Priority 3
- Blog
- Case studies
- Market reports
- Advanced structured data

---

## Success Metrics

**Primary KPIs:**
- Qualified buyer leads
- Qualified owner leads
- Qualified partner leads

**Secondary KPIs:**
- LINE OA growth
- Referral partner growth
- Property inventory growth
- SEO traffic growth

---

## Current Strategic Focus

**Finish the lead acquisition engine first.**

```
Lead Capture → Lead Notification → Property Expansion
→ Homepage Conversion → SEO Expansion → Marketplace Growth
```

**Do not prioritize** mobile apps, AI chatbots, or major platform rewrites until lead generation and notification workflows are fully operational.

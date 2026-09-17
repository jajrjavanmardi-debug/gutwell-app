# GutWell Website

Static site for GutWell AI. Plain HTML with inline CSS — no framework, no build
step, no dependencies. Deployed on Vercel. The canonical host is
https://www.getgutwell.app; the apex `getgutwell.app` 308-redirects to it.

## Structure

    website/
      public/
        index.html             # Landing page — live App Store download
        support/index.html     # /support     — App Store Support URL target
        privacy/index.html     # /privacy     — Privacy Policy (EN)
        privacy/de/index.html  # /privacy/de  — Privacy Policy (DE)
        terms/index.html       # /terms       — Terms of Service (EN)
        terms/de/index.html    # /terms/de    — Terms of Service (DE)
        impressum/index.html   # /impressum   — Legal Notice, bilingual
        robots.txt
        sitemap.xml
        favicon.png         # copied from assets
        icon.png            # copied from assets
        app-store-badge.svg # Apple's official badge, unmodified — do not redraw
      README.md

There is no `vercel.json`. The apex-to-www redirect and HTTPS are handled by
Vercel's domain settings, and clean URLs come from Vercel's default static
handling of `<dir>/index.html`. Do not add one without a concrete need.

## Legal pages

Published and live. Five pages, EN + DE:

| URL | Document |
|-----|----------|
| `/privacy`    | Privacy Policy (EN) |
| `/privacy/de` | Datenschutzrichtlinie (DE) |
| `/terms`      | Terms of Service (EN) |
| `/terms/de`   | Nutzungsbedingungen (DE) |
| `/impressum`  | Legal Notice / Impressum (bilingual, one page) |

The English URLs are canonical; each page carries reciprocal `hreflang`
(`en`, `de`, `x-default` -> English) and a `rel="canonical"` on the www host.
All five are in `sitemap.xml` and none carries `noindex`.

**These pages must not contradict the in-app legal screens.** The app ships its
own Privacy and Terms screens (`lib/i18n.ts` -> `legalScreens`), and those are
what users accept at sign-up. The website may add website-only detail — hosting
logs, cookies — but every shared factual statement (operator, minimum age 16,
processors, CSV export, no analytics in this version) has to match. Change both
or neither.

Statements deliberately NOT made, because they could not be verified: retention
periods in days, transfer mechanisms such as SCCs, whether a DPO is required,
whether Google trains on submitted data, and VSBG participation. Do not add any
of these without a source.

The earlier drafts in `../legal/*.html` still carry unresolved `[PLACEHOLDER]`
markers (37 / 18 / 6). They are kept only as a drafting record and are NOT
published — do not link to them.

## Deploy

Vercel is connected to this repository. Deployment settings (production branch,
Root Directory) live in the Vercel dashboard, not in this repo — verify the Root
Directory is `website/public` before relying on the subdirectory routes.

**Production deploys from `main`.** Pushing any other branch — including the
long-lived release branch — produces a preview deployment only. To ship a
website change, cherry-pick the website-only commit onto `main` and push that;
do not merge a release branch into `main` just to deploy the site.

## Waitlist backend (retired)

The pre-launch homepage carried an email form that posted to a Supabase Edge
Function:

    https://peipdakrqtgabnvpazrc.supabase.co/functions/v1/waitlist-signup

The form and its `ENDPOINT` constant are gone from `index.html`, but **the
backend was never removed**: `supabase/migrations/020_waitlist.sql` created
`public.waitlist` and no later migration drops it, so addresses collected before
launch may still be stored. That is why the Privacy Policy still discloses their
retention. To finish retiring this, delete the rows and drop the table, then
remove the retention clause from `/privacy` and `/privacy/de`.

The function uses `SUPABASE_SERVICE_ROLE_KEY` from Supabase secrets. That key is
server-side only and must never appear in this directory.

## Launch status

GutWell AI is live on the App Store (app ID `6796702004`) and the homepage links
to it. Completed:

- Waitlist CTA replaced with the App Store download link. Every CTA (nav, hero,
  launch section, footer) reads its URL from the single `APP_STORE_URL` constant
  and also carries it in the markup, so the page works without JavaScript
- "Coming soon to iOS" removed from the hero
- Apple's official "Download on the App Store" badge added to the hero and the
  launch section

Still pending:

- Replace the empty screenshot placeholder panel with real screenshots
  (`website/public/screenshots/screen-N.png`)
- Confirm the App Store Connect Privacy Policy URL is
  `https://www.getgutwell.app/privacy`

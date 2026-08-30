# GutWell Website

Static site for GutWell AI. Plain HTML with inline CSS — no framework, no build
step, no dependencies. Deployed on Vercel and live at https://getgutwell.app
(the apex 308-redirects to `www.getgutwell.app`).

## Structure

    website/
      public/
        index.html             # Landing page (currently waitlist / pre-launch)
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
what users accept at sign-up. The website may add website-only detail — the
waitlist, hosting logs, cookies — but every shared factual statement (operator,
minimum age 16, processors, CSV export, no analytics in this version) has to
match. Change both or neither.

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

Pushing the branch produces a preview deployment; production promotion is a
dashboard action.

## Waitlist backend

The form posts to a Supabase Edge Function:

    https://peipdakrqtgabnvpazrc.supabase.co/functions/v1/waitlist-signup

Setup:
1. Run migration `supabase/migrations/020_waitlist.sql`
2. Deploy: `supabase functions deploy waitlist-signup`
3. The endpoint is set in `ENDPOINT` in `index.html`

The function uses `SUPABASE_SERVICE_ROLE_KEY` from Supabase secrets. That key is
server-side only and must never appear in this directory.

## Pending before launch

- Swap the waitlist CTA for an App Store download link once the app is live
- Replace the "SCREENSHOTS COMING SOON" panel with real screenshots
  (`website/public/screenshots/screen-N.png`)
- Remove "Coming soon to iOS" from the hero
- Confirm the App Store Connect Privacy Policy URL is
  `https://www.getgutwell.app/privacy`

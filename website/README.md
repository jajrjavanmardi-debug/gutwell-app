# GutWell Website

Static site for GutWell AI. Plain HTML with inline CSS — no framework, no build
step, no dependencies. Deployed on Vercel and live at https://getgutwell.app
(the apex 308-redirects to `www.getgutwell.app`).

## Structure

    website/
      public/
        index.html          # Landing page (currently waitlist / pre-launch)
        support/index.html  # /support — App Store Support URL target
        privacy/index.html  # /privacy — ROUTE SCAFFOLD, not the policy
        terms/index.html    # /terms   — ROUTE SCAFFOLD, not the terms
        robots.txt
        sitemap.xml
        favicon.png         # copied from assets
        icon.png            # copied from assets
      README.md

There is no `vercel.json`. The apex-to-www redirect and HTTPS are handled by
Vercel's domain settings, and clean URLs come from Vercel's default static
handling of `<dir>/index.html`. Do not add one without a concrete need.

## Legal pages

`/privacy` and `/terms` are **scaffolds only**. They contain no legal wording.

The drafted documents live in `../legal/*.html` and still carry unresolved
`[PLACEHOLDER]` markers — 36 in the privacy policy, 18 in the terms, 6 in the
Impressum. `legal/terms.html` carries its own RELEASE BLOCKER notice saying that
no page with unresolved placeholders may be used for App Store submission.

Those drafts are currently published on GitHub Pages, which is what the homepage
footer links to. Both scaffolds are `noindex` and excluded from `sitemap.xml`.

**Do not enter `/privacy` or `/terms` in App Store Connect** until the approved
documents replace the scaffolds. At that point: swap in the approved HTML, drop
the `noindex` meta tag, remove the `Disallow` lines from `robots.txt`, and add
the URLs to `sitemap.xml`.

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
- Publish the approved legal documents (see above)

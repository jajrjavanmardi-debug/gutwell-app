# GutWell Website

Static landing page for GutWell — deployable to Vercel or GitHub Pages.

## Structure

    website/
      public/
        index.html     # Full landing page
        favicon.png    # App favicon (copied from assets)
        icon.png       # App icon (copied from assets)
        vercel.json    # Vercel deployment config
      README.md

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to vercel.com -> New Project -> Import repo
3. Set Root Directory to website/public
4. Deploy — live at gutwell.vercel.app

## Waitlist Backend

Requires a Supabase Edge Function (supabase/functions/waitlist-signup).

Setup:
1. Run migration: supabase/migrations/020_waitlist.sql
2. Deploy function: supabase functions deploy waitlist-signup
3. Update ENDPOINT in index.html with the deployed function URL:
   https://peipdakrqtgabnvpazrc.supabase.co/functions/v1/waitlist-signup

The function uses SUPABASE_SERVICE_ROLE_KEY from Supabase secrets — never commit this key.

## Swap Waitlist to App Store CTA

When the App Store link is ready:
1. Change hero-cta href to the App Store URL
2. Change button text to Download on the App Store
3. Add the official App Store badge SVG

## Domain

Currently configured for Vercel subdomain.
When custom domain is ready, update og:url in index.html and Vercel project settings.

## Assets

Real app screenshots should replace placeholder frames.
Add them as website/public/screenshots/screen-N.png.

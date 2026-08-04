# GutWell AI — Email Architecture

**Decided 4 August 2026.** Applies to v1.0 and everything after it.

## The split

| Purpose | Domain | Addresses | Provider |
|---|---|---|---|
| **Machine-sent authentication mail** | `mail.getgutwell.app` | `auth@mail.getgutwell.app` | Resend (via Supabase Auth SMTP) |
| **Human communication** | `getgutwell.app` (root) | `support@`, `hello@`, `legal@` | IONOS |

Authentication mail means everything Supabase Auth sends: password recovery, and
email confirmation if it is ever switched on.

## Why a dedicated sending subdomain

**Reputation isolation.** If transactional mail — or, later, anything marketing —
is ever flagged as spam, the damage lands on `mail.getgutwell.app` and can be
quarantined. Recovering a damaged *root* domain reputation is slow and difficult,
and the root is what carries the human mailboxes and the brand.

The asymmetry is what settled it: the cost of the subdomain is cosmetic (a longer
From address). The cost of getting the root wrong is losing password-reset
delivery for the whole product. Password reset is the one email that must never
fail.

Doing this pre-launch is also the only cheap moment — there is no sending
reputation to migrate yet.

**This is also Resend's own recommendation.**

## What it does NOT do

**It does not affect inbound mail.** Resend places its bounce/return-path `MX`
and its `SPF` under `send.mail.getgutwell.app`. Per Resend: *"MX records only
impact the subdomain they are associated to."* The root `MX` and root `SPF` are
never touched, so `support@`, `hello@` and `legal@` keep flowing through IONOS
exactly as before.

## DNS — the only records to add

All at IONOS. **IONOS wants the name field without the domain suffix.**

| Type | Name | Value | Priority |
|---|---|---|---|
| `MX` | `send.mail` | `feedback-smtp.<region>.amazonses.com` | 10 |
| `TXT` | `send.mail` | `v=spf1 include:amazonses.com ~all` | — |
| `TXT` | `resend._domainkey.mail` | *(DKIM key from the Resend dashboard)* | — |

Exact values come from Resend when you add the domain. The shapes above are what
Resend documents for IONOS.

### Never touch

- **Root `MX`** (`mx00.ionos.de`, `mx01.ionos.de`) — inbound mail breaks.
- **Root `TXT` SPF** (`v=spf1 include:_spf-eu.ionos.com ~all`) — see below.
- **`_dmarc`** CNAME → `dmarc.ionos.de` (currently `v=DMARC1; p=none;`).

### The one mistake that would actually hurt

**Never add `include:amazonses.com` or `include:_spf.resend.com` to the root SPF
record, and never add a second root `TXT` starting `v=spf1`.** A domain may
publish only one SPF record; two produce a `permerror` and *all* mail — including
human mail sent from IONOS — starts failing SPF.

With this architecture the root SPF is never needed. Any guide that tells you to
edit it is describing a different setup.

## Supabase configuration

Set in `supabase/config.toml` under `[auth.email.smtp]`, currently commented out
and gated on Resend reporting the domain **Verified**:

```
host         smtp.resend.com
port         465            (implicit TLS; 587/STARTTLS if 465 is blocked)
user         resend         (literal string, not an email address)
pass         env(SMTP_PASSWORD)   — the Resend API key, never committed
admin_email  auth@mail.getgutwell.app
sender_name  GutWell AI
```

Also required in the Dashboard (or via `config push`):

- **Site URL** — `https://getgutwell.app`
- **Redirect URLs** — `gutwellapp://reset-password`, `gutwellapp:///reset-password`,
  `gutwellapp://**`, and `exp://**` for dev *(remove `exp://**` before release)*
- **Rate limits** — raise the Auth email limit; the built-in default throttles testing

## Replies

`auth@mail.getgutwell.app` is **send-only**. `mail.getgutwell.app` has no inbound
`MX`, so replies to it are not delivered anywhere. Supabase Auth's SMTP settings
expose a sender name and address but no `Reply-To` header, so this cannot be
redirected at the header level.

This is handled in the email body: `supabase/templates/recovery.html` states that
replies are not read and points to `support@getgutwell.app`.

If replies to `auth@` ever need to land somewhere, add `mail.getgutwell.app` as a
mail domain in IONOS with its own `MX` — that is additive and still never touches
the root.

## DMARC

`_dmarc.getgutwell.app` is a CNAME managed by IONOS resolving to `p=none`, so
there is no enforcement today and no aggregate reporting.

Subdomains inherit the organisational DMARC policy. Because the From domain
(`mail.getgutwell.app`) and the DKIM signing domain will match exactly, this
setup satisfies **strict** alignment — so tightening to `quarantine` or `reject`
later will not break authentication mail.

Before tightening, confirm IONOS's own mail is DKIM-signed. A probe of six common
selectors (`resend`, `default`, `ionos`, `s1`, `s2`, `dkim`) at the root found
none published; IONOS may use a different selector, so verify rather than assume.
Unsigned root mail would start failing under an enforcing policy.

## Localisation

Supabase Auth serves **one template per email type** — there is no built-in
per-locale selection. The recovery email is English only.

Localising it for DE requires taking over sending with a **Send Email Hook** and
branching on `user_profiles.preferred_language` (already constrained to `en`/`de`).
That is separate work. **Do not assume the German reset email is localised — it
is not.**

## Future sending

Anything that is not authentication mail gets its own subdomain, so its complaint
rate can never degrade password-reset delivery:

- `news.getgutwell.app` or `updates.getgutwell.app` — marketing / newsletter
- the root domain is never used for bulk sending

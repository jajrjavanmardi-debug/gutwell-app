# GutWell AI — Email Architecture

**Decided 4 August 2026.** Applies to v1.0.

> **Supersedes** an earlier decision (same day) to use a dedicated sending
> subdomain, `mail.getgutwell.app`. Reverted while on the **Resend Free plan**.
> No DNS was ever published for the subdomain, so there is nothing to tear down.
> The reasoning for the subdomain is preserved at the bottom — it is the right
> shape to return to when volume or plan changes.

## The split

| Purpose | Address | Provider |
|---|---|---|
| **Machine-sent authentication mail** | `auth@getgutwell.app` | Resend, via Supabase Auth SMTP |
| **Human communication** | `support@`, `hello@`, `legal@` `@getgutwell.app` | IONOS |

Both live on the **root domain**. Authentication mail means everything Supabase
Auth sends: password recovery, and email confirmation if it is ever enabled.

## Resend Free plan — the constraints this is built around

| | |
|---|---|
| Emails / month | 3,000 |
| **Emails / day** | **100** |
| **Verified domains** | **1** |
| SMTP relay | included |
| Log retention | 30 days |

One domain slot, so it goes to the root — the domain whose From address a user
recognises on a security email. 100/day is ample for password resets, but it is
a real ceiling during testing: don't burn it on repeated trial sends.

## Inbound mail is not at risk

This is the part worth being precise about, because it is the common fear and it
is unfounded here.

Verifying the **root** domain in Resend adds records at **`send.getgutwell.app`**
(bounce MX and SPF) and at `resend._domainkey.getgutwell.app` (DKIM). Per Resend:
*"MX records only impact the subdomain they are associated to."*

So the root `MX` and the root `SPF` are **never modified**. `support@`, `hello@`
and `legal@` keep flowing through IONOS exactly as before, and IONOS's own
outbound mail keeps passing SPF.

## The accepted trade-off

Sending reputation now attaches to the **root** domain — the same domain that
carries the human mailboxes and the brand. There is no reputation firewall.

**The mitigation is discipline: the root sends transactional authentication mail
only.** Never send marketing, newsletters or bulk from it. Those have complaint
rates; password resets do not. If that day comes, upgrade the plan and move bulk
to its own subdomain — do not simply start sending it from the root.

The 100/day Free-plan ceiling incidentally caps the blast radius of any mistake.

## DNS — the only records to add

All at IONOS. **IONOS wants the name field without the domain suffix.**

| Type | Name | Value | Priority |
|---|---|---|---|
| `MX` | `send` | `feedback-smtp.<region>.amazonses.com` | 10 |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | — |
| `TXT` | `resend._domainkey` | *(DKIM key from the Resend dashboard)* | — |

Exact values come from Resend when you add the domain. Take them from the
dashboard rather than from the shapes above. `send.getgutwell.app` is currently
unused, so there is no collision.

### Never touch

Verified baseline, 4 August 2026 — this is what must survive unchanged:

```
root MX     10 mx00.ionos.de / 10 mx01.ionos.de
root SPF    v=spf1 include:_spf-eu.ionos.com ~all
_dmarc      CNAME -> dmarc.ionos.de  ->  v=DMARC1; p=none;
```

### The one mistake that would actually hurt

**Never add `include:amazonses.com` or `include:_spf.resend.com` to the root SPF
record, and never add a second root `TXT` starting `v=spf1`.** A domain may
publish only one SPF record; two produce a `permerror` and *all* mail fails SPF —
including the human mail IONOS sends.

With this architecture the root SPF is never needed. Any guide telling you to
edit it is describing a different setup.

## Replies to `auth@`

`auth@getgutwell.app` sits under the root domain's IONOS `MX`, so mail addressed
to it **is** delivered to IONOS. If no such mailbox exists, senders get a bounce.

**Create `auth@getgutwell.app` in IONOS as a forwarder to `support@getgutwell.app`.**
A forwarder usually costs nothing, and it means a user who replies to a password
reset reaches a human instead of an error.

This is strictly better than the reverted subdomain design, where replies had
nowhere to go at all. Supabase Auth exposes a sender name and address but no
`Reply-To` header, so the forwarder is the only mechanism available.

## Supabase configuration

In `supabase/config.toml` under `[auth.email.smtp]` — currently commented out and
gated on Resend reporting **Verified**:

```
host         smtp.resend.com
port         465            (implicit TLS; 587/STARTTLS if 465 is blocked)
user         resend         (literal string, not an email address)
pass         env(SMTP_PASSWORD)   — the Resend API key, never committed
admin_email  auth@getgutwell.app
sender_name  GutWell AI
```

Also required, in the Dashboard or via `config push`:

- **Site URL** — `https://getgutwell.app`
- **Redirect URLs** — `gutwellapp://reset-password`, `gutwellapp:///reset-password`,
  `gutwellapp://**`, and `exp://**` for dev *(remove `exp://**` before release)*
- **Rate limits** — raise the Auth email limit; the built-in default throttles testing

**Leave email confirmations off** (`mailer_autoconfirm` stays true) until recovery
mail is proven to deliver. Turning confirmations on before then locks out every
new signup.

## DMARC

`_dmarc.getgutwell.app` is a CNAME managed by IONOS resolving to `p=none` — no
enforcement, no aggregate reporting.

With From `@getgutwell.app` and DKIM signing `d=getgutwell.app`, this setup
satisfies **strict** alignment, so tightening to `quarantine` or `reject` later
will not break authentication mail.

Before tightening, confirm IONOS's own mail is DKIM-signed. A probe of six common
selectors (`resend`, `default`, `ionos`, `s1`, `s2`, `dkim`) at the root found
none published; IONOS may use a different selector, so verify rather than assume.
Unsigned root mail would start failing under an enforcing policy.

## Localisation

Supabase Auth serves **one template per email type** — there is no built-in
per-locale selection. The recovery email is English only.

Localising for DE requires taking over sending with a **Send Email Hook** and
branching on `user_profiles.preferred_language` (already constrained to `en`/`de`).
Separate work. **Do not assume the German reset email is localised — it is not.**

## When to revisit

Move authentication mail to a dedicated subdomain if any of these become true:

- You start sending marketing, newsletters or product announcements
- Monthly volume approaches the plan ceiling and you upgrade anyway
- Root-domain reputation is ever damaged — at which point recovery is slow, and
  the subdomain would have contained it

The subdomain shape was: verify `mail.getgutwell.app`, send as
`auth@mail.getgutwell.app`, records at `send.mail` and `resend._domainkey.mail`.
It isolates reputation so a flagged send can be quarantined without touching the
domain that carries the human mailboxes. It is also Resend's own recommendation.
Returning to it means re-verifying and re-warming, so it is cheapest to do at a
plan change rather than under pressure.

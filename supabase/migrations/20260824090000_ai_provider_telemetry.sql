-- ---------------------------------------------------------------------------
-- Provider failure telemetry
--
-- failure_kind ('upstream' | 'empty' | 'error') collapses four genuinely
-- different provider outcomes into one value: a fetch that never left the
-- worker, a provider non-2xx, a deadline abort, and a 200 with no candidate
-- text. The 2026-08-18 and 2026-08-24 photo incidents were all written as
-- 'upstream' with zero tokens, which is indistinguishable between a connection
-- failure and an HTTP 503 — and the platform's own function logs are not
-- retained on this project's plan, so the console.error that DID carry the
-- status was the only copy and is gone.
--
-- These columns keep that classification in a table we control.
--
-- Nothing here can hold content. Every text column is clamped to an allowlist
-- in SQL, not merely at the call site: provider_reason takes only Google's own
-- SCREAMING_SNAKE status symbol, failure_class only the six internal classes,
-- mime_type only a well-formed type/subtype. A provider error body, a prompt,
-- a meal description or an image cannot satisfy those patterns and lands as
-- null. RLS, ownership and grants are unchanged.
-- ---------------------------------------------------------------------------

alter table public.ai_usage_events
  add column if not exists provider_status    integer,
  add column if not exists provider_reason    text,
  add column if not exists failure_class      text,
  add column if not exists timed_out          boolean not null default false,
  add column if not exists provider_attempted boolean not null default false,
  add column if not exists provider_attempts  smallint not null default 0,
  add column if not exists image_bytes        integer,
  add column if not exists mime_type          text;

-- ---------------------------------------------------------------------------
-- record_ai_usage — same eleven leading parameters, six new trailing ones.
--
-- The new parameters all default, so a caller that passes only the original
-- eleven named arguments still resolves here. That is what lets this migration
-- be applied BEFORE the function deploy without breaking the running v35.
-- The old eleven-argument function is dropped rather than left alongside,
-- because two overloads would make an eleven-argument call ambiguous.
-- ---------------------------------------------------------------------------

drop function if exists public.record_ai_usage(
  uuid, uuid, text, text, boolean, text, integer, integer, integer, integer, integer);

create or replace function public.record_ai_usage(
  p_user_id            uuid,
  p_request_id         uuid,
  p_mode               text,
  p_model              text,
  p_succeeded          boolean,
  p_failure_kind       text default null,
  p_prompt_tokens      integer default null,
  p_output_tokens      integer default null,
  p_thoughts_tokens    integer default null,
  p_cached_tokens      integer default null,
  p_total_tokens       integer default null,
  p_provider_status    integer default null,
  p_provider_reason    text default null,
  p_failure_class      text default null,
  p_timed_out          boolean default false,
  p_provider_attempted boolean default false,
  p_provider_attempts  smallint default 0,
  p_image_bytes        integer default null,
  p_mime_type          text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = '22004';
  end if;
  insert into public.ai_usage_events (
    user_id, request_id, mode, model, succeeded, failure_kind,
    prompt_tokens, output_tokens, thoughts_tokens, cached_tokens, total_tokens,
    provider_status, provider_reason, failure_class, timed_out,
    provider_attempted, provider_attempts, image_bytes, mime_type
  ) values (
    p_user_id, p_request_id, left(coalesce(p_mode, 'unknown'), 40),
    left(coalesce(p_model, 'unknown'), 60), p_succeeded,
    -- Still clamped: no provider error text can reach the table.
    case when p_failure_kind in ('upstream', 'empty', 'error') then p_failure_kind else null end,
    p_prompt_tokens, p_output_tokens, p_thoughts_tokens, p_cached_tokens, p_total_tokens,
    -- A real HTTP status or nothing.
    case when p_provider_status between 100 and 599 then p_provider_status else null end,
    -- Google's own status symbol only (UNAVAILABLE, RESOURCE_EXHAUSTED, ...).
    -- Free text, punctuation, spaces and non-ASCII all fail this and land null.
    case when p_provider_reason ~ '^[A-Z][A-Z0-9_]{0,39}$' then p_provider_reason else null end,
    -- Exactly the six internal classes.
    case when p_failure_class in (
      'network_exception', 'provider_429', 'provider_4xx',
      'provider_5xx', 'timeout', 'empty_response'
    ) then p_failure_class else null end,
    coalesce(p_timed_out, false),
    coalesce(p_provider_attempted, false),
    least(greatest(coalesce(p_provider_attempts, 0), 0), 2),
    case when p_image_bytes >= 0 then p_image_bytes else null end,
    -- type/subtype only; a base64 blob or a sentence cannot match.
    case when p_mime_type ~ '^[a-z]{1,20}/[a-z0-9.+-]{1,30}$' then p_mime_type else null end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants — same posture as before: server-side callers only. Restated for the
-- new signature, since the old one no longer exists to carry them.
-- ---------------------------------------------------------------------------

do $$
declare fn text := 'public.record_ai_usage(uuid, uuid, text, text, boolean, text, integer, '
                || 'integer, integer, integer, integer, integer, text, text, boolean, '
                || 'boolean, smallint, integer, text)';
begin
  execute format('revoke all on function %s from public, anon, authenticated', fn);
  execute format('grant execute on function %s to service_role', fn);
end $$;

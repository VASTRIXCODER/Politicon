-- Rate limiting: atomic fixed-window counters stored in Postgres so limits hold
-- across Vercel's multiple serverless instances (in-memory counters would not).

create table if not exists rate_limits (
  id           text primary key,          -- identifier:route:window_start_epoch
  identifier   text        not null,        -- user id or hashed IP
  route        text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  expires_at   timestamptz not null
);

create index if not exists rate_limits_expires_at_idx on rate_limits (expires_at);

-- Atomically increment the counter for the current window and report whether the
-- caller is still under the limit. The INSERT ... ON CONFLICT makes the
-- read-modify-write a single atomic statement, so concurrent requests can't race.
create or replace function check_rate_limit(
  p_identifier     text,
  p_route          text,
  p_limit          int,
  p_window_seconds int
)
returns table(allowed boolean, current_count int, reset_at timestamptz)
language plpgsql
as $$
declare
  v_window_start timestamptz;
  v_reset_at     timestamptz;
  v_id           text;
  v_count        int;
begin
  -- Bucket the current time into a fixed window.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);
  v_id := p_identifier || ':' || p_route || ':' ||
          extract(epoch from v_window_start)::bigint;

  insert into rate_limits (id, identifier, route, window_start, count, expires_at)
    values (v_id, p_identifier, p_route, v_window_start, 1, v_reset_at)
  on conflict (id) do update
    set count = rate_limits.count + 1
  returning count into v_count;

  -- Opportunistically prune expired rows (cheap; bounded by the index).
  delete from rate_limits where expires_at < now() - interval '1 hour';

  return query select (v_count <= p_limit), v_count, v_reset_at;
end;
$$;

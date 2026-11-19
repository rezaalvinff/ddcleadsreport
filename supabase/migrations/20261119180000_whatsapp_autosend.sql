-- Best-effort automatic sending of the handover message.
--
-- The app never talks to WhatsApp itself: it only queues a handover. A worker
-- outside Vercel (laptop today, the office VPS later) holds the WhatsApp
-- session, pulls the queue and reports back. Manual sending stays available and
-- is still the fallback whenever the worker is off or a send fails.

alter table public.lead_handovers
  add column auto_status text check (auto_status is null or auto_status in ('queued', 'sending', 'sent', 'failed')),
  add column auto_error text,
  add column auto_attempts integer not null default 0 check (auto_attempts >= 0),
  add column auto_queued_at timestamptz,
  add column auto_updated_at timestamptz;

-- The worker claims the oldest queued rows; this index keeps that cheap.
create index lead_handovers_auto_queue_idx
  on public.lead_handovers (auto_queued_at)
  where auto_status in ('queued', 'sending');

/**
 * Hands the worker up to p_limit queued handovers and marks them 'sending', so
 * two polls never pick up the same row. A row stuck in 'sending' longer than
 * p_stale_seconds (worker crashed mid-send) is retried.
 */
create or replace function public.claim_whatsapp_sends(p_limit integer, p_stale_seconds integer)
returns table (handover_id uuid, group_name text, lead_name text, domicile text, unit text, source text, phone text, customer_note text)
language plpgsql
as $$
begin
  return query
  with claimed as (
    update public.lead_handovers h
       set auto_status = 'sending',
           auto_attempts = h.auto_attempts + 1,
           auto_updated_at = now()
     where h.id in (
       select c.id
         from public.lead_handovers c
        where c.auto_status = 'queued'
           or (c.auto_status = 'sending' and c.auto_updated_at < now() - make_interval(secs => p_stale_seconds))
        order by c.auto_queued_at
        limit p_limit
        for update skip locked
     )
    returning h.id, h.lead_id, h.whatsapp_group_id
  )
  select claimed.id, g.group_name, l.name, l.domicile, l.unit, l.source, l.phone, l.customer_note
    from claimed
    join public.whatsapp_groups g on g.id = claimed.whatsapp_group_id
    join public.leads l on l.id = claimed.lead_id;
end;
$$;

/** Records what the worker did with one claimed handover. */
create or replace function public.finish_whatsapp_send(p_handover uuid, p_ok boolean, p_error text)
returns void
language sql
as $$
  update public.lead_handovers
     set auto_status = case when p_ok then 'sent' else 'failed' end,
         auto_error = case when p_ok then null else left(p_error, 500) end,
         auto_updated_at = now(),
         -- A confirmed automatic send counts as sent; a manual mark is never cleared.
         sent_marked_at = case when p_ok then coalesce(sent_marked_at, now()) else sent_marked_at end
   where id = p_handover;
$$;

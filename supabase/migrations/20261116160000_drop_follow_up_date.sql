-- The prospect form no longer has a separate follow-up date. The FOLLOW UP
-- column of each monthly tab now carries the prospect's own report date, so
-- this column has no reader left.
alter table public.leads drop column if exists follow_up_date;

-- Catatan Customer: free-text note taken from the prospect's conversation.
-- It appears in the WhatsApp handover message only; the monthly spreadsheet
-- layout is unchanged.
alter table public.leads
  add column customer_note text
    check (customer_note is null or length(btrim(customer_note)) between 1 and 500);

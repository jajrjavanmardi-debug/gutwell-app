-- Prevent duplicate daily check-ins per user.
-- Keep the most recently created row for each (user_id, entry_date) pair.
DELETE FROM check_ins a
USING check_ins b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.entry_date = b.entry_date;

ALTER TABLE check_ins
ADD CONSTRAINT check_ins_user_id_entry_date_key UNIQUE (user_id, entry_date);

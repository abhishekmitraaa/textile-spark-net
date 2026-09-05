-- ─────────────────────────────────────────────────────────────
-- Seed the chat-moderation vocabulary and the starting flag patterns.
--
-- All three tables were shipped EMPTY by 20260801095820, which means the whole
-- pipeline has been inert since it landed: `check_message_flag_patterns()` has
-- never matched anything, and the admin reason picker has nothing to pick.
--
-- A tracked migration rather than ad-hoc SQL, for the same reason the category
-- taxonomy is one (20260729194246): a rule that decides whether a message gets
-- through is not something that should exist only in whoever's psql history.
--
-- ── keyword_blocklist is deliberately NOT seeded ──
--
-- A blocklist hit is a HARD stop: check_message_blocklist() is BEFORE INSERT
-- and raises, so no message row is written, no conversation is locked, and no
-- conversation_reviews row is queued. There is zero review trail — support
-- cannot see what was blocked, or even that anything was. Seeding it
-- speculatively means silently rejecting legitimate messages with no way to
-- find out. Terms go in only when a human names them, via the admin panel.
-- ─────────────────────────────────────────────────────────────


-- Part 1 — the verdict vocabulary ------------------------------------------
--
-- chat_block_reasons.created_by is NOT NULL and FKs profiles(id), so these rows
-- need an author. The bootstrap admin (33333333-…, promoted to super_admin by
-- 20260717130000) is the honest choice: these are platform defaults, not any
-- real person's decision.
--
-- Deliberately un-CHECKed as a set, matching the reasoning behind
-- conversation_reviews.reported_reason: this is product copy, product will
-- reword it, and constraining schema to copy turns a rewording into a
-- migration. Editable afterwards from the Block reasons screen (super_admin).
--
-- `where not exists` per row rather than `on conflict`: there is no unique
-- index on `reason`, and adding one now would be a schema change smuggled into
-- a seed. Re-running this migration is a no-op either way.
insert into public.chat_block_reasons (reason, active, created_by)
select v.reason, true, '33333333-3333-3333-3333-333333333333'::uuid
  from (values
    ('Off-platform payment request'),
    ('Sharing personal contact to bypass chat'),
    ('Harassment or abusive language'),
    ('Spam or repeated unsolicited messages'),
    ('Suspected fraud'),
    ('Fake or misleading claims'),
    ('Other (see notes)')
  ) as v(reason)
 where not exists (
   select 1 from public.chat_block_reasons c where c.reason = v.reason
 );


-- Part 2 — the regex flag patterns -----------------------------------------
--
-- ⚠ THESE USE \y, NOT \b. Postgres regexes are POSIX ARE, where `\b` is a
-- BACKSPACE character, not a word boundary — the word-boundary escape is `\y`
-- (and `\m` / `\M` for start/end of word). A pattern written with `\b` passes
-- the flag_patterns_pattern_valid CHECK, saves without complaint, and then
-- silently never matches anything. Verified before writing this migration:
--
--   select 'call me on 9876543210' ~* '(\+?91[\-\s]?)?[6-9]\d{9}\b';  -- false
--   select 'call me on 9876543210' ~* '(\+?91[\-\s]?)?[6-9]\d{9}\y';  -- true
--   select 'lets move to WhatsApp' ~* '\b(whats\s?app|telegram|signal)\b'; -- false
--   select 'lets move to WhatsApp' ~* '\y(whats\s?app|telegram|signal)\y'; -- true
--
-- `\d` IS supported in ARE, so it is kept.
--
-- Matching is case-insensitive at the call site (`new.body ~* f.pattern`), so
-- none of these need their own case handling.
--
-- Each was checked against both a true positive and a false positive:
--   * mobile      matches '9876543210' and '+91 9876543210';
--                 does NOT match a 10-digit invoice number starting 1-5.
--   * email       matches 'a.b@x.co'.
--   * off-platform matches 'WhatsApp', 'whats app', 'telegram';
--                 does NOT match 'signalling' (that is what \y buys).
insert into public.flag_patterns (pattern, label, active, added_by)
select v.pattern, v.label, true, '33333333-3333-3333-3333-333333333333'::uuid
  from (values
    ('(\+?91[\-\s]?)?[6-9]\d{9}\y',           'Indian mobile number'),
    ('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', 'Email address'),
    ('\y(whats\s?app|telegram|signal)\y',     'Off-platform meeting request')
  ) as v(pattern, label)
 where not exists (
   select 1 from public.flag_patterns f where f.pattern = v.pattern
 );


-- Part 3 — prove the patterns actually fire --------------------------------
--
-- The CHECK constraint only guarantees a pattern COMPILES. It cannot tell a
-- working regex from one that compiles and matches nothing, which is exactly
-- the `\b` failure mode above. So the migration asserts the behaviour and
-- refuses to commit if a seeded pattern is inert.
do $$
declare
  v_hits int;
begin
  select count(*) into v_hits
    from public.flag_patterns f
   where f.active
     and 'call me on 9876543210 or mail a.b@x.co, or WhatsApp me' ~* f.pattern;

  if v_hits < 3 then
    raise exception
      'seeded flag_patterns are inert: expected 3 matches against the probe string, got %. '
      'Check for \b (backspace in POSIX ARE) where \y (word boundary) was meant.', v_hits;
  end if;

  -- And that they are not simply matching everything.
  select count(*) into v_hits
    from public.flag_patterns f
   where f.active
     and 'we need 5000 m of 120 gsm combed cotton, signalling a repeat order' ~* f.pattern;

  if v_hits > 0 then
    raise exception
      'a seeded flag_pattern matches an ordinary trade message (% matched). '
      'That would lock legitimate threads.', v_hits;
  end if;
end $$;


-- Part 4 — keyword_blocklist stays empty ------------------------------------
-- Intentionally no INSERT. See the header.

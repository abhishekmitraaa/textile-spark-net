-- reject_vendor_content() was created with Postgres' default EXECUTE-to-PUBLIC
-- grant, which approve_vendor_content() does not have. Not a hole on its own
-- (the function raises for anyone who is not a super_admin/product_moderator),
-- but the two moderation verbs should present the same surface.
revoke execute on function public.reject_vendor_content(text, uuid, text) from public;
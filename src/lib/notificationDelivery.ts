// ─────────────────────────────────────────────────────────────
// Is email or push notification delivery live? Not yet (checked 2026-09-23 and
// again 2026-09-25, MPF-12).
//
// The notification switches on /profile/notifications (buyers) and in Vendor
// Settings (vendors) are SAVED PREFERENCES ONLY. Nothing sends email or push from
// them: there is no push pipeline, and the one sender (account-deletion: email, or
// WhatsApp for an account with no email) is transactional and ignores them. Nor do
// they feed the in-app bell, which notify() fills only from moderation, account,
// ad and certificate events, never from quotes, messages or RFQs.
//
// So every surface that shows those switches, or a summary of them, reads this one
// flag and says "saved for when it launches" while it is false. Set it to true only
// once a sender actually reads the saved keys; every such surface then switches
// back to plain "get notified" wording at once.
// ─────────────────────────────────────────────────────────────

export const NOTIFICATION_DELIVERY_LIVE = false;

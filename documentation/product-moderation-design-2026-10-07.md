# Product moderation: remove and flag with managed reasons — design

**Status:** design approved by Mitra, 2026-10-07 (with the revision below). Built on branch
`product-moderation/removal` in both repos.

## What Mitra asked for

- A product moderator and a manager can **remove** or **flag** a product.
- Each action takes a reason picked from **predetermined reason templates**, chosen **in the action's own
  dialog, at the moment of the action** (revision, 2026-10-07): an admin who decides to remove a product
  must pick the reason there and then.
- The **manager** customises the templates.
- When a product is **removed, the vendor is notified** with the reason.
- Every action is in the **Admin Log**.

## Decisions (Mitra, 2026-10-07)

| Question | Decision |
|---|---|
| What "remove" does | **Final takedown.** The listing goes offline and is frozen: the vendor can't edit or resubmit it, and sees "Removed by Cosora" with the reason. The vendor may still delete it. A super admin or manager can **reinstate** it, which returns it to the vendor's drafts. Reject stays as the fixable "please correct this" path. |
| What "flag" does | **Hide until reviewed.** A live listing goes back to the review queue (`under_review`) and the vendor is told why. A moderator then approves it (live again, flag cleared) or rejects or removes it. |
| Who flags products | super_admin, product_moderator, manager. Support no longer adds product flags (it keeps read-only Products). |
| Manager's scope | **Full product moderation**: approve, reject, flag, remove, reinstate, and the reason templates. Videos are unchanged. |
| Who edits templates | super_admin and manager. |
| Vendor notice channel | The in-app bell (`notify()`); no email or push exists (`NOTIFICATION_DELIVERY_LIVE = false`). |

## Data

### `admin.product_moderation_reasons` (the templates)
`id uuid`, `label text` (1–80, unique case-insensitively), `vendor_message text` (1–500, what the vendor reads),
`applies_to text[]` (non-empty subset of `remove`, `flag`), `active boolean`, `sort int`, `created_at`, `created_by`,
`updated_at`. No client grant; read and written through RPCs. `trg_admin_audit` (no owner column). Never deleted,
only switched off, because actions point at them. Seeded with eight starter reasons.

### `admin.product_moderation_actions` (the ledger)
One row per remove, flag or reinstate: product id (`on delete set null`, so a vendor's later delete keeps the
record), vendor id, product name at the time, action, reason id, the message the vendor read, the admin's note,
actor id and role, time. No client grant. It is what the panel shows as each listing's moderation history, and it
keeps admin identities off `products`, which vendors read.

### `public.products` — four new columns, the vendor-facing part only
- `removed_at`, `removed_reason`: set by `admin_product_remove()`. Shape check: both null, or both set with
  `status = 'rejected'`.
- `flagged_at`, `flag_reason`: set by `admin_product_flag()`. Shape check: both null, or both set with status
  `under_review` or `draft` (a vendor may withdraw a flagged listing to drafts; the flag stays until a moderator
  decides).
- A removed listing is `rejected`, so the plan cap (which counts `under_review` and `live`) frees its slot, and
  every buyer surface (live only) drops it unchanged.

## Writes

All SECURITY DEFINER, `search_path ''`, EXECUTE for authenticated only. Role gate:
`admin.product_moderation_can_act()` = active admin with super_admin, product_moderator or manager.

| RPC | Who | Does | Errors |
|---|---|---|---|
| `admin_product_remove(product, reason, note)` | moderation roles | `rejected` + `removed_*`, `rejection_reason` = the message, flag cleared; ledger row; Admin Log reason; notice `product_removed` | 42501 role; 22023 reason missing, inactive or not for `remove`; P0002 unknown product; 55000 already removed |
| `admin_product_flag(product, reason, note)` | moderation roles | live → `under_review` + `flagged_*`; ledger row; an `admin_flags` row; Admin Log reason; notice `product_flagged` | as above; 55000 if not live |
| `admin_product_reinstate(product, note)` | super_admin, manager | clears `removed_*` and `rejection_reason`, status `draft`; ledger row; Admin Log reason; notice `product_reinstated` | 42501; 22023 blank note; P0002; 55000 not removed |
| `admin_product_reason_save(id, label, message, applies_to, active, sort)` | super_admin, manager | add (null id) or edit a template | 42501; 22023 validation; 23505 duplicate label |
| `admin_product_reasons(include_inactive)` | any admin; inactive rows for super_admin and manager | the picker and the templates page | 42501 |
| `admin_product_moderation_history(product)` | any admin | the ledger for one listing, with each actor's name | 42501 |

The note is optional on remove and flag, and the vendor reads it after the template's message ("Details: …").
Reinstate needs a note, because the Admin Log has to say why a takedown was undone.

The vendor-facing message is `vendor_message` plus the note. The Admin Log reason is `label` plus the note.

### Guard: `trg_products_moderation_guard` (BEFORE INSERT OR UPDATE, invoker)
- For `authenticated` only (the RPCs run as the owner and pass): `removed_*` and `flagged_*` can't be set on insert or
  changed on update, and a removed listing can't be updated at all. That covers the vendor, and an admin writing the
  table directly.
- For every caller: moving a listing to `live` or `rejected` clears `flagged_*`. That is how a moderator's approve
  or reject on the Products page settles a flag.
- `enforce_products_moderation` leaves `flagged_at` and `flag_reason` out of its "moderator changes only status and
  reason" comparison, so the two triggers don't depend on firing order.

### Manager joins product moderation
`enforce_products_moderation`, the `products_update` admin arm (`alter policy`), and the `products` branch of
`approve_vendor_content` / `reject_vendor_content` admit `manager`. Insert and delete keep their roles: a manager
never creates a vendor's listing, and a takedown is a removal on the record, never a hard delete (narrowed after
the commit's security review flagged the wider grant).
The two read RPCs (`admin_product_reasons`, `admin_product_moderation_history`) admit the roles that open Products:
super_admin, product_moderator, manager and support (`admin.product_moderation_can_read()`).
`admin_flag_add` refuses a `'product'` flag from anyone but the three moderation roles.

## Screens

### Cosora-Admin
- **Products** (super_admin, product_moderator, manager write; support reads):
  - tabs Queue, Live, Rejected, **Removed**, each paged 50 at a time;
  - a flagged listing in the Queue shows "Flagged" and its reason;
  - **Flag** on live cards, **Remove** on every card that isn't removed, **Reinstate** on removed ones (super_admin,
    manager);
  - the Remove and Flag dialogs **require a reason picked from the templates** in the dialog itself, plus an optional
    note for the vendor, and show the exact text the vendor will read;
  - each card's log shows the moderation history and the free-text flag notes.
- **Moderation reasons** (`/moderation-reasons`, under Moderation; super_admin and manager write, product_moderator
  reads): add, edit, switch on or off, reorder; each row says where it applies.
- Admin Log names the two new tables ("Product moderation reason", "Product moderation action" is not audited: it
  is itself a log).

### Buyer/vendor app
- **My Products** shows "Removed by Cosora" with the reason and no Edit; "Under review: flagged" with the reason; and
  "Rejected" with the moderator's reason (a rejected listing used to show as a plain draft).
- The bell: `product_removed`, `product_flagged`, `product_reinstated` link to `/products`.
- New fixed strings are translated (Hindi, Gujarati). A template's text is Cosora's but admin-written, so it shows
  in English until it is added to `external-strings.json`, as with banners and FAQs.

## Testing
- `scripts/product-moderation/pm1_remove_flag.sql` on the local stack (rolled back): the role matrix for each RPC
  (every admin role, the vendor, a buyer); reason validation; remove twice; vendor can't edit, resubmit or un-remove a
  removed listing and can delete it; flag only on live; approve clears a flag; reinstate goes to draft and the cap
  applies on resubmit; one Admin Log row with its reason per action; one notification per action; the vendor can't
  read the ledger or the templates.
- `tests/local/product-moderation.spec.ts`: the admin dialogs (reason required, picked in the dialog), the Removed
  tab and reinstate, the templates page as a manager, and the vendor's My Products notices.
- Typecheck in both apps, `npm run i18n:check`, `node scripts/copy-audit.mjs` (admin), builds.

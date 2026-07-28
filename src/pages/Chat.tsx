import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import BuyerTopBar from "@/components/buyer/BuyerTopBar";
import { CONVERSATIONS, callGroupsInOrder, type CallRecord } from "@/lib/chatData";
import { useConversations, type ChatSummary } from "@/lib/queries/chat";
import { useCalls, useCallVendor } from "@/lib/queries/calls";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useIsDesktop } from "@/hooks/use-mobile";
import { ChatThreadView } from "./ChatThread";
import {
  ArrowLeft, Search, MessageCircle, MessagesSquare, Phone, FileText, PhoneIncoming, PhoneOutgoing, PhoneMissed,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Static seed rows shaped into the summary the hub renders (signed-out fallback).
const FALLBACK_CONVOS: ChatSummary[] = CONVERSATIONS.map((c) => ({
  id: c.id, name: c.name, avatar: c.avatar, online: c.online,
  lastMessage: c.lastMessage, timestamp: c.timestamp, unread: c.unread, rfqProduct: c.rfqProduct,
}));

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };
const listContainer = { show: { transition: { staggerChildren: 0.05 } } };

type Tab = "chats" | "calls";

const Chat = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "calls" ? "calls" : "chats";
  const [query, setQuery] = useState("");

  // Sellers reach this hub from the vendor sidebar/bottom nav, so it renders
  // inside DashboardLayout — without it the sidebar disappears with no way back.
  const { role } = useUserRole();
  const isSeller = role === "seller";

  // A single 672px column stranded in a 1200px viewport reads as broken. From
  // `lg` up the page becomes a real master-detail: list on the left, the live
  // thread on the right, so replying never costs a page navigation. Both sides
  // get it — buyers used to be stuck with the stretched mobile column.
  const isDesktop = useIsDesktop();
  const splitView = isDesktop;
  // Buyers don't render inside DashboardLayout, so their split view needs its
  // own desktop chrome and its own copies of the pane classes. Kept as a
  // separate flag (rather than widening the `isSeller &&` gates below) so the
  // seller's emitted classNames are untouched by this change.
  const buyerSplit = splitView && !isSeller;
  // The open thread lives in the URL so refresh, back, and deep links all work.
  const activeId = splitView ? params.get("c") : null;

  const patchParams = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };

  const setTab = (t: Tab) => patchParams({ tab: t === "calls" ? "calls" : null }, true);
  // Selecting a thread replaces history while a pane is already open, so Back
  // returns to the inbox rather than walking every conversation you clicked.
  const openThread = (id: string) => {
    if (splitView) patchParams({ c: id }, Boolean(activeId));
    else navigate(`/chats/${id}`);
  };

  // Real conversations + calls when signed in; seeded lists only as signed-out fallback.
  const { user } = useAuth();
  const { data: dbConvos } = useConversations();
  const { data: dbCalls } = useCalls();
  const callVendor = useCallVendor();
  const convos: ChatSummary[] = user ? (dbConvos ?? []) : FALLBACK_CONVOS;

  const onlineCount = convos.filter((c) => c.online).length;
  const groups = useMemo(() => (user ? (dbCalls ?? []) : callGroupsInOrder()), [user, dbCalls]);

  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convos;
    return convos.filter((c) => c.name.toLowerCase().includes(q) || c.rfqProduct.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q));
  }, [convos, query]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ group: g.group, calls: g.calls.filter((c) => c.name.toLowerCase().includes(q) || c.rfqProduct.toLowerCase().includes(q)) }))
      .filter((g) => g.calls.length > 0);
  }, [groups, query]);

  // Sellers quote on buyer requirements (/quotes); buyers track their own RFQs.
  const goQuotes = () => navigate(isSeller ? "/quotes" : "/requirement/my-quotes");

  // Back → wherever the user came from; on a deep link / refresh with no in-app
  // history to pop, fall back to that role's own home rather than stranding a
  // buyer on the seller dashboard.
  const goBack = () => {
    const idx = (window.history.state && (window.history.state as { idx?: number }).idx) ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(isSeller ? "/seller-home" : "/home/new-arrivals");
  };

  const body = (
    <div
      className={cn(
        "bg-gray-50",
        !buyerSplit && "min-h-screen",
        isSeller && "-m-4 lg:-m-6",
        // At `lg` the page stops scrolling and becomes two independently
        // scrolling panes pinned under the dashboard header.
        isSeller && "lg:flex lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:overflow-hidden",
        // Buyer equivalent. No `lg:` prefixes needed — buyerSplit is already
        // gated on the same 1024px breakpoint. Height comes from the flex
        // parent in `shell` below, so there's no header-height magic number.
        buyerSplit && "flex h-full min-h-0 overflow-hidden",
      )}
    >
      {/* Conversation list — the whole page on mobile, the left pane at `lg` */}
      <div
        className={cn(
          isSeller &&
            "lg:flex lg:h-full lg:w-[368px] lg:min-h-0 lg:shrink-0 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white xl:w-[400px]",
          buyerSplit &&
            "flex h-full w-[368px] min-h-0 shrink-0 flex-col border-r border-gray-200 bg-white xl:w-[400px]",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "bg-white border-b border-gray-100",
            isSeller
              ? "sticky top-14 z-20 lg:static lg:z-auto lg:shrink-0"
              : buyerSplit
                ? "shrink-0"
                : "sticky top-0 z-30",
          )}
        >
          <div className={cn("mx-auto w-full max-w-2xl px-4 pt-4", isSeller && "lg:max-w-none", buyerSplit && "max-w-none")}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {/* Both roles: the hub is a destination you navigate INTO, so
                    it needs a way out. Hidden at `lg`, where both sides now
                    have surrounding chrome to navigate from. */}
                <button onClick={goBack} aria-label="Back" className="-ml-1 p-1 rounded-full hover:bg-gray-100 lg:hidden">
                  <ArrowLeft className="w-5 h-5 text-gray-700" />
                </button>
                <div>
                  <h1 className="text-xl font-extrabold text-gray-900">Messages</h1>
                  <p className="text-xs text-gray-500">
                    {tab === "chats" ? `${convos.length} Conversations` : `${filteredGroups.reduce((n, g) => n + g.calls.length, 0)} Calls`}
                  </p>
                </div>
              </div>
              {onlineCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {onlineCount} online
                </span>
              )}
            </div>

            {/* Tabs */}
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
              {(["chats", "calls"] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={cn("relative flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition-colors",
                    tab === t ? "text-white" : "text-gray-500")}>
                  {tab === t && <motion.span layoutId="chat-tab" className="absolute inset-0 rounded-lg bg-[#ef4d62]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {t === "chats" ? <MessageCircle className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                    {t === "chats" ? "Chats" : "Calls"}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative py-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "chats" ? "Search conversations..." : "Search call history..."}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Body — sellers get bottom-nav clearance from DashboardLayout's own padding */}
        <div
          className={cn(
            "mx-auto w-full max-w-2xl px-4 pt-2",
            isSeller ? "pb-6 lg:max-w-none lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-4" : "pb-28",
            buyerSplit && "max-w-none min-h-0 flex-1 overflow-y-auto pb-4",
          )}
        >
          <AnimatePresence mode="wait">
            {tab === "chats" ? (
              <motion.div key="chats" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} variants={listContainer}>
                {chats.length === 0 ? (
                  <Empty icon={MessageCircle} label="No conversations found" />
                ) : (
                  <motion.div variants={listContainer} initial="hidden" animate="show" className={cn("divide-y divide-gray-100", isSeller && "lg:divide-y-0 lg:space-y-0.5", buyerSplit && "divide-y-0 space-y-0.5")}>
                    {chats.map((c) => (
                      <motion.div key={c.id} variants={listItem}>
                        <ChatRow conv={c} active={c.id === activeId} onOpen={() => openThread(c.id)} onQuote={goQuotes} />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="calls" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {filteredGroups.length === 0 ? (
                  <Empty icon={Phone} label="No calls found" />
                ) : (
                  filteredGroups.map((g) => (
                    <div key={g.group} className="mb-2">
                      <p className="px-1 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{g.group}</p>
                      <motion.div variants={listContainer} initial="hidden" animate="show" className={cn("divide-y divide-gray-100", isSeller && "lg:divide-y-0 lg:space-y-0.5", buyerSplit && "divide-y-0 space-y-0.5")}>
                        {g.calls.map((c) => (
                          <motion.div key={c.id} variants={listItem}>
                            <CallRow call={c} onOpen={() => openThread(c.vendorId)} onCall={() => callVendor(c.vendorId, c.rfqProduct)} onQuote={goQuotes} />
                          </motion.div>
                        ))}
                      </motion.div>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Thread pane — desktop only; you read and reply in place */}
      {(isSeller || buyerSplit) && (
        <div className="hidden lg:block lg:h-full lg:min-w-0 lg:flex-1">
          {activeId ? <ChatThreadView key={activeId} vendorId={activeId} embedded /> : <NoThreadSelected />}
        </div>
      )}

      {/* Post Requirement FAB — buyer-only, and single-column only: as a fixed
          centre-bottom pill it would sit across both panes in the split view. */}
      {!isSeller && !buyerSplit && (
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={() => navigate("/requirement/post-requirement")}
          className="fixed bottom-[84px] left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 rounded-full bg-[#256fef] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#256fef]/30 hover:bg-[#256fef]/90"
        >
          <FileText className="w-4 h-4" /> Post Requirement
        </motion.button>
      )}

      {/* DashboardLayout already renders the bottom nav for sellers */}
      {!isSeller && <MobileBottomNav />}
    </div>
  );

  // Sellers get the vendor dashboard chrome. Buyers get a minimal desktop
  // frame instead: BuyerTopBar is the buyer app's standard header (its logo is
  // the route home), which keeps this page consistent with every other buyer
  // screen without dragging in the vendor sidebar. The fixed-height flex column
  // is what lets the two panes scroll independently.
  if (isSeller) return <DashboardLayout>{body}</DashboardLayout>;
  if (buyerSplit) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-white">
        <div className="shrink-0">
          <BuyerTopBar />
        </div>
        <div className="min-h-0 flex-1">{body}</div>
      </div>
    );
  }
  return body;
};

function Avatar({ src, name, size = 48, online }: { src: string | null; name: string; size?: number; online?: boolean }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className="w-full h-full rounded-full bg-gradient-to-br from-[#ef4d62]/20 to-[#ef4d62]/40 flex items-center justify-center text-sm font-bold text-gray-700">{initials}</div>
      )}
      {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
    </div>
  );
}

function QuoteChip({ product, onClick }: { product: string; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="inline-flex items-center gap-1 rounded-full bg-[#ef4d62]/10 px-2 py-0.5 text-[10px] font-semibold text-[#ef4d62] hover:bg-[#ef4d62]/15">
      <FileText className="w-2.5 h-2.5" /> Quote · {product}
    </button>
  );
}

// `active` only paints at `lg`, where the row genuinely drives a visible pane.
const ROW_DESKTOP = "transition-colors lg:-mx-2 lg:rounded-xl lg:px-2 lg:hover:bg-gray-100/70";
const ROW_ACTIVE = "lg:bg-[#ef4d62]/[0.07] lg:hover:bg-[#ef4d62]/[0.07]";

function ChatRow({ conv, active, onOpen, onQuote }: { conv: ChatSummary; active?: boolean; onOpen: () => void; onQuote: () => void }) {
  return (
    <div onClick={onOpen} role="button" tabIndex={0} aria-current={active ? "true" : undefined} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={cn("w-full flex items-center gap-3 py-3 text-left cursor-pointer", ROW_DESKTOP, active && ROW_ACTIVE)}>
      <Avatar src={conv.avatar} name={conv.name} online={conv.online} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-gray-900 truncate">{conv.name}</p>
          <span className="text-[11px] text-gray-400 shrink-0">{conv.timestamp}</span>
        </div>
        <p className={cn("mt-0.5 text-xs truncate", conv.unread ? "text-gray-800 font-medium" : "text-gray-500")}>{conv.lastMessage}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <QuoteChip product={conv.rfqProduct} onClick={onQuote} />
          {conv.unread > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef4d62] text-[10px] font-bold text-white shrink-0">{conv.unread}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Calls are a log, not the pane's content: one vendor can own several call
// rows, so painting them all "active" when their thread is open reads as a bug.
// They get hover only.
function CallRow({ call, onOpen, onCall, onQuote }: { call: CallRecord; onOpen: () => void; onCall: () => void; onQuote: () => void }) {
  const missed = call.direction === "missed";
  const Icon = missed ? PhoneMissed : call.direction === "incoming" ? PhoneIncoming : PhoneOutgoing;
  const color = missed ? "text-red-500" : "text-emerald-500";
  const label = missed ? "Missed" : call.direction === "incoming" ? "Incoming" : "Outgoing";
  return (
    <div className={cn("w-full flex items-center gap-3 py-3", ROW_DESKTOP)}>
      <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer">
        <Avatar src={call.avatar} name={call.name} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{call.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs">
            <Icon className={cn("w-3.5 h-3.5", color)} />
            <span className={cn("font-medium", missed ? "text-red-500" : "text-gray-500")}>{label}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">{call.time}</span>
          </div>
          <div className="mt-1"><QuoteChip product={call.rfqProduct} onClick={onQuote} /></div>
        </div>
      </div>
      <button onClick={onCall} aria-label={`Call ${call.name}`} className="shrink-0 w-9 h-9 rounded-full bg-[#ef4d62]/10 flex items-center justify-center hover:bg-[#ef4d62]/15">
        <Phone className="w-4 h-4 text-[#ef4d62]" />
      </button>
    </div>
  );
}

// Resting state of the desktop thread pane. Composed rather than blank, so an
// empty right half reads as "pick one" instead of "something failed to load".
function NoThreadSelected() {
  return (
    <div className="grid h-full w-full place-items-center bg-gray-50 px-8">
      <div className="max-w-[15rem] text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <MessagesSquare className="h-7 w-7 text-gray-300" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-bold text-gray-900">No conversation open</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Pick a chat on the left to read it here and reply without leaving the page.
        </p>
      </div>
    </div>
  );
}

function Empty({ icon: Icon, label }: { icon: typeof MessageCircle; label: string }) {
  return (
    <div className="py-20 text-center">
      <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

export default Chat;

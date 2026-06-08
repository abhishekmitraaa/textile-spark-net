import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChevronLeft, ChevronRight, Tag, MessageSquare, Star, HelpCircle, X, Plus, StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Get Reviews Modal ─────────────────────────────────────────────────────────

function GetReviewsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [contacts, setContacts] = useState([{ id: 1, name: "", mobile: "" }]);

  const addContact = () => setContacts(p => [...p, { id: Date.now(), name: "", mobile: "" }]);
  const removeContact = (id: number) => setContacts(p => p.filter(c => c.id !== id));
  const updateContact = (id: number, field: "name" | "mobile", val: string) =>
    setContacts(p => p.map(c => c.id === id ? { ...c, [field]: val } : c));

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Get Reviews</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <div className="flex justify-center gap-1 mb-2">
              {[0,1,2,3,4].map(i => <Star key={i} className="w-6 h-6 text-yellow-400 fill-yellow-400" />)}
            </div>
            <p className="text-sm font-semibold text-gray-900">Here are your ratings & reviews till date!</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="bg-green-600 text-white px-3 py-1 rounded font-bold flex items-center gap-1">
                4.2 <Star className="w-3.5 h-3.5 fill-white" />
              </span>
              <span className="text-sm text-gray-500">24 Ratings</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Request ratings from customers</h3>
            <div className="space-y-4">
              {contacts.map((c, idx) => (
                <div key={c.id} className="flex gap-3">
                  <div className="flex-1 space-y-2">
                    <input type="text" placeholder="Customer Name*" value={c.name}
                      onChange={e => updateContact(c.id, "name", e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="tel" placeholder="Customer Mobile Number*" value={c.mobile}
                      onChange={e => updateContact(c.id, "mobile", e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {contacts.length > 1 && (
                    <button onClick={() => removeContact(c.id)} className="text-gray-300 hover:text-red-500 pt-2 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addContact} className="text-blue-600 text-sm font-medium mt-3">+ Add Another Customer</button>
          </div>

          <button
            disabled={contacts.some(c => !c.name.trim() || !c.mobile.trim())}
            onClick={() => { toast.success("Review requests sent!"); onClose(); }}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
            Send Request
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reply to Reviews ─────────────────────────────────────────────────────────

function ReplyToReviews() {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const reviews = [
    { id: 1, name: "Rajesh Kumar",  company: "StyleMart Retailers",      rating: 5, date: "20 Nov 2025", text: "Excellent quality fabric and very professional communication. Delivery was on time." },
    { id: 2, name: "Priya Sharma",  company: "Fashion Forward Exports",   rating: 4, date: "18 Nov 2025", text: "Good quality products but slight delay in delivery. Overall satisfied." },
  ];

  return (
    <div className="space-y-3">
      {reviews.map(r => (
        <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                {r.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-400">{r.company}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <span className="text-sm font-bold text-gray-900">{r.rating}</span>
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              </div>
              <p className="text-[10px] text-gray-400">{r.date}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-3">{r.text}</p>
          {replyingTo === r.id ? (
            <div>
              <textarea rows={3} value={replyText} onChange={e => setReplyText(e.target.value)}
                placeholder="Write your reply..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
              <p className="text-[10px] text-gray-400 mb-2">Your reply will be publicly visible on your profile.</p>
              <div className="flex gap-2">
                <button onClick={() => { toast.success("Reply submitted!"); setReplyingTo(null); setReplyText(""); }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                  Submit
                </button>
                <button onClick={() => { setReplyingTo(null); setReplyText(""); }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setReplyingTo(r.id)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              Reply
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const BusinessTools = () => {
  const navigate = useNavigate();
  const [getReviewsOpen, setGetReviewsOpen] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  const tools = [
    { icon: Tag,          title: "Add Offers",           badge: null,          iconBg: "bg-amber-50",  iconColor: "text-amber-600",  action: () => toast.info("Add Offers — coming soon") },
    { icon: MessageSquare,title: "Reply to Reviews",     badge: null,          iconBg: "bg-green-50",  iconColor: "text-green-600",  action: () => setShowReviews(p => !p) },
    { icon: Star,         title: "Get Reviews",          badge: "18 Pending",  iconBg: "bg-blue-50",   iconColor: "text-blue-600",   action: () => setGetReviewsOpen(true) },
    { icon: HelpCircle,   title: "Reply to Questions",   badge: null,          iconBg: "bg-teal-50",   iconColor: "text-teal-600",   action: () => toast.info("Reply to Questions — coming soon") },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto pb-8 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">Business Tools</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage reviews, offers, and more</p>
          </div>
        </div>

        {/* Tools list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {tools.map((tool, i) => (
            <button key={i} onClick={tool.action}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-3 flex-1">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", tool.iconBg)}>
                  <tool.icon className={cn("w-5 h-5", tool.iconColor)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{tool.title}</span>
                  {tool.badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                      {tool.badge}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          ))}
        </div>

        {/* Inline review reply section */}
        {showReviews && (
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Reply to Reviews</h2>
            <ReplyToReviews />
          </div>
        )}
      </div>

      <GetReviewsModal isOpen={getReviewsOpen} onClose={() => setGetReviewsOpen(false)} />
    </DashboardLayout>
  );
};

export default BusinessTools;
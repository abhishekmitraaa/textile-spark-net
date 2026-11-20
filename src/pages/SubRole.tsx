import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import SignupHeader from "@/components/auth/SignupHeader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/errorMessage";
import { BUYER_ROLES, type BuyerRoleId } from "@/data/buyerRoles";
import { fetchBuyerRole, saveBuyerRole } from "@/lib/queries/profile";
import { useStepBack } from "@/hooks/useStepBack";

// Sign-up's "What best describes you?". One answer, saved to buyer_profiles.buyer_role before moving on (buyer sign-up
// audit item 1: the pick used to be thrown away, and several could be ticked at once). A reload shows the saved pick.
const SubRole = () => {
  const navigate = useNavigate();
  const back = useStepBack("/auth/role-selection");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const saved = useQuery({
    queryKey: ["buyer_role", user?.id],
    queryFn: () => fetchBuyerRole(user!.id),
    enabled: Boolean(user),
  });
  const [selected, setSelected] = useState<BuyerRoleId | null>(null);
  const [saving, setSaving] = useState(false);

  // The saved answer seeds the choice once it arrives; a pick made before that wins.
  useEffect(() => {
    if (saved.data) setSelected((cur) => cur ?? saved.data);
  }, [saved.data]);

  const next = async () => {
    if (!selected || !user || saving) return;
    if (selected !== saved.data) {
      setSaving(true);
      try {
        await saveBuyerRole(user.id, selected);
      } catch (e) {
        setSaving(false);
        toast.error("Couldn't save your answer", { description: errorMessage(e) });
        return;
      }
      queryClient.setQueryData(["buyer_role", user.id], selected);
      setSaving(false);
    }
    navigate("/auth/account-info");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-sm mx-auto w-full"
      >
        {/* Back, the COSORA wordmark and the step (review L-57) */}
        <SignupHeader onBack={back} />
        <h2 id="subrole-title" className="text-xl font-bold text-gray-900 mb-1">What best describes you?</h2>
        <p className="text-sm text-gray-400 mb-6">Select your primary role</p>

        <div role="radiogroup" aria-labelledby="subrole-title" className="space-y-1 mb-8">
          {BUYER_ROLES.map(role => {
            const isSelected = selected === role.id;
            return (
              <button
                key={role.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(role.id)}
                className="w-full flex items-center gap-3 py-3.5 text-left border-b border-gray-100 last:border-0"
              >
                <span className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  isSelected ? "border-brand-buyer-deep" : "border-gray-300"
                )}>
                  {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-brand-buyer-deep" />}
                </span>
                <span className="text-sm text-gray-800">{role.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={next}
          disabled={!selected || saving}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors",
            selected && !saving
              ? "bg-brand-buyer-deep hover:bg-brand-buyer-deeper text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : "Continue"}
        </button>

      </motion.div>
    </div>
  );
};

export default SubRole;

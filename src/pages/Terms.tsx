import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";

const Terms = () => {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-[#a4172c] flex flex-col p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col max-w-sm mx-auto w-full"
      >
        {/* COSORA wordmark */}
        <div className="flex justify-center mb-4">
          <CosoraLogo height={30} variant="white" />
        </div>

        {/* T&C white card */}
        <div className="flex-1 bg-white rounded-2xl p-5 overflow-y-auto mb-4">
          <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
            <p className="font-bold text-gray-900 text-base">Terms of Service</p>
            <p>
              Welcome to Cosora. By accessing or using our platform, you agree to be bound by these
              Terms of Service and our Privacy Policy. If you do not agree, please do not use the
              platform.
            </p>
            <p className="font-semibold text-gray-900">1. Use of Service</p>
            <p>
              You must be at least 18 years old to use Cosora. You agree to provide accurate and
              complete information during registration and to keep your account information updated.
            </p>
            <p className="font-semibold text-gray-900">2. User Conduct</p>
            <p>
              You agree not to use the platform for any unlawful purpose, to upload false or
              misleading product information, or to infringe on the intellectual property rights of
              others.
            </p>
            <p className="font-semibold text-gray-900">3. Privacy</p>
            <p>
              Your privacy is important to us. Our Privacy Policy explains how we collect, use, and
              protect your personal information. By using Cosora, you consent to the collection and
              use of your data as described.
            </p>
            <p className="font-semibold text-gray-900">4. Limitation of Liability</p>
            <p>
              Cosora is provided on an "as is" basis. We do not guarantee uninterrupted access or
              error-free operation. We shall not be liable for any indirect, incidental, or
              consequential damages arising from the use of our platform.
            </p>
            <p className="font-semibold text-gray-900">5. Changes</p>
            <p>
              We reserve the right to modify these terms at any time. Continued use of the platform
              after changes constitutes acceptance of the updated terms.
            </p>
          </div>
        </div>

        {/* Agree checkbox */}
        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="w-4 h-4 accent-white shrink-0"
          />
          <span className="text-sm text-white">
            I agree to{" "}
            <span className="underline font-semibold">Terms &amp; Conditions</span> and{" "}
            <span className="underline font-semibold">Privacy Policy</span>
          </span>
        </label>

        <button
          onClick={() => navigate("/auth/welcome")}
          disabled={!agreed}
          className={cn(
            "w-full py-3.5 text-sm font-bold rounded-xl transition-colors",
            agreed
              ? "bg-white text-[#a4172c] hover:bg-white/90"
              : "bg-white/30 text-white/50 cursor-not-allowed"
          )}
        >
          NEXT
        </button>
      </motion.div>
    </div>
  );
};

export default Terms;
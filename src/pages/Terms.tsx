import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const Terms = () => {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <h1 className="font-logo text-accent text-2xl font-bold italic uppercase tracking-[-0.08em] text-center mb-8">Cosora</h1>

        <h2 className="font-display text-2xl font-bold text-foreground text-center mb-2">
          Terms & Conditions
        </h2>
        <p className="text-muted-foreground text-sm text-center mb-6">
          Please review and accept our terms to continue
        </p>

        <div className="rounded-xl border bg-muted/30 max-h-64 overflow-y-auto p-4 mb-6 text-sm text-muted-foreground leading-relaxed space-y-3">
          <p className="font-semibold text-foreground">Terms of Service</p>
          <p>
            Welcome to Cosora. By accessing or using our platform, you agree to be bound by these
            Terms of Service and our Privacy Policy. If you do not agree, please do not use the
            platform.
          </p>
          <p className="font-semibold text-foreground">1. Use of Service</p>
          <p>
            You must be at least 18 years old to use Cosora. You agree to provide accurate and
            complete information during registration and to keep your account information updated.
          </p>
          <p className="font-semibold text-foreground">2. User Conduct</p>
          <p>
            You agree not to use the platform for any unlawful purpose, to upload false or
            misleading product information, or to infringe on the intellectual property rights of
            others.
          </p>
          <p className="font-semibold text-foreground">3. Privacy</p>
          <p>
            Your privacy is important to us. Our Privacy Policy explains how we collect, use, and
            protect your personal information. By using Cosora, you consent to the collection and
            use of your data as described.
          </p>
          <p className="font-semibold text-foreground">4. Limitation of Liability</p>
          <p>
            Cosora is provided on an "as is" basis. We do not guarantee uninterrupted access or
            error-free operation. We shall not be liable for any indirect, incidental, or
            consequential damages arising from the use of our platform.
          </p>
          <p className="font-semibold text-foreground">5. Changes</p>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the platform
            after changes constitutes acceptance of the updated terms.
          </p>
        </div>

        <div className="flex items-start gap-3 mb-8">
          <Checkbox
            id="terms"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
            className="mt-0.5"
          />
          <label htmlFor="terms" className="text-sm text-foreground cursor-pointer leading-snug">
            I agree to the{" "}
            <span className="text-accent font-medium">Terms & Conditions</span> and{" "}
            <span className="text-accent font-medium">Privacy Policy</span>
          </label>
        </div>

        <Button
          onClick={() => navigate("/auth/welcome")}
          disabled={!agreed}
          className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
        >
          Next
        </Button>
      </motion.div>
    </div>
  );
};

export default Terms;

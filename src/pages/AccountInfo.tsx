import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";

const AccountInfo = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    pincode: "",
    businessName: "",
  });

  const isValid = form.fullName && form.email && form.businessName;

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <h1 className="font-display text-accent text-2xl italic text-center mb-8">Cosora</h1>

        <h2 className="font-display text-2xl font-bold text-foreground text-center mb-2">
          Tell us about yourself
        </h2>
        <p className="text-muted-foreground text-sm text-center mb-8">
          Fill in your details to get started
        </p>

        <div className="space-y-5 mb-8">
          <div>
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              className="h-11 mt-1.5"
              placeholder="Enter your full name"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              className="h-11 mt-1.5"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                id="location"
                className="h-11 flex-1"
                placeholder="Enter Pincode"
                inputMode="numeric"
                value={form.pincode}
                onChange={(e) => update("pincode", e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 px-3 text-accent border-accent/30 hover:bg-accent/5"
              >
                <MapPin className="w-4 h-4 mr-1" />
                Use Current
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="businessName">Business Name *</Label>
            <Input
              id="businessName"
              className="h-11 mt-1.5"
              placeholder="Your company or brand name"
              value={form.businessName}
              onChange={(e) => update("businessName", e.target.value)}
            />
          </div>
        </div>

        <Button
          onClick={() => navigate("/auth/interest-preference")}
          disabled={!isValid}
          className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
        >
          Next
        </Button>
      </motion.div>
    </div>
  );
};

export default AccountInfo;

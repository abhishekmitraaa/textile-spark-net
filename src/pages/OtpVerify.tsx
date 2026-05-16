import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useUserRole } from "@/contexts/UserRoleContext";

const maskPhone = (phone: string, code: string) => {
  if (phone.length < 4) return `${code} ${phone}`;
  const first5 = phone.slice(0, 5);
  const last2 = phone.slice(-2);
  return `${code} ${first5} ••••${last2}`;
};

const OtpVerify = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setRole } = useUserRole();

  const { phone = "", countryCode = "+91" } = (location.state as any) || {};

  const [otp, setOtp] = useState("");
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (timer <= 0) {
      setCanResend(true);
      return;
    }
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handleResend = () => {
    setTimer(60);
    setCanResend(false);
    setOtp("");
  };

  const handleVerify = () => {
    // Mock: any 6 digits = success, treat as existing buyer
    setRole("buyer");
    navigate("/browse");
  };

  const formattedTime = `0:${timer.toString().padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding (lg+) */}
      <div className="hidden lg:flex lg:w-1/2 bg-foreground flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-background"
              style={{
                width: `${200 + i * 120}px`,
                height: `${200 + i * 120}px`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>

        <div className="relative z-10">
          <Link to="/">
            <span className="font-logo text-2xl font-bold italic uppercase tracking-[-0.08em] text-background">Cosora</span>
          </Link>
        </div>

        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-bold italic text-background leading-tight">
            Almost there.
          </h2>
          <p className="text-background/60 text-lg max-w-xs">
            Enter the OTP sent to your phone to verify your identity.
          </p>
        </div>

        <p className="relative z-10 text-background/30 text-xs">
          Trusted by 10,000+ brands & manufacturers
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col p-6 sm:p-10 lg:p-16 overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/login")}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="lg:hidden">
            <span className="font-logo text-xl font-bold italic uppercase tracking-[-0.08em] text-accent">Cosora</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">Verify your number</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-foreground">
                    {maskPhone(phone, countryCode)}
                  </span>
                </p>
                <button
                  onClick={() => navigate("/login")}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Not You?
                </button>
              </div>

              {/* OTP Input */}
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={setOtp}
                  inputMode="numeric"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-12 w-12 text-lg border-border" />
                    <InputOTPSlot index={1} className="h-12 w-12 text-lg border-border" />
                    <InputOTPSlot index={2} className="h-12 w-12 text-lg border-border" />
                    <InputOTPSlot index={3} className="h-12 w-12 text-lg border-border" />
                    <InputOTPSlot index={4} className="h-12 w-12 text-lg border-border" />
                    <InputOTPSlot index={5} className="h-12 w-12 text-lg border-border" />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {/* Timer / Resend */}
              <div className="text-center">
                {canResend ? (
                  <button
                    onClick={handleResend}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    Resend OTP
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Resend OTP in <span className="font-medium">{formattedTime}</span>
                  </p>
                )}
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerify}
                disabled={otp.length < 6}
                className="w-full h-11 text-base bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Verify
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OtpVerify;

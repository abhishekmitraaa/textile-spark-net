import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useUserRole } from "@/contexts/UserRoleContext";
import { cn } from "@/lib/utils";
import CosoraLogo from "@/components/CosoraLogo";

const maskPhone = (phone: string, code: string) => {
  if (phone.length < 4) return `${code}${phone}`;
  const first4 = phone.slice(0, 4);
  return `${code}-${first4}XXXXX`;
};

// Height of the on-screen keyboard (number pad), via the VisualViewport API.
// Lets us lift a fixed bottom action bar above the keyboard so it stays
// visible/tappable while the user is entering the OTP.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setInset(kb > 24 ? kb : 0); // ignore tiny deltas (URL bar, etc.)
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

const OtpVerify = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setRole } = useUserRole();

  const { phone = "8982319251", countryCode = "+91" } = (location.state as any) || {};

  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [timer, setTimer] = useState(57);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer(t => Math.max(t - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleResend = () => {
    setTimer(57);
    setOtp(Array(6).fill(""));
    inputsRef.current[0]?.focus();
  };

  const keyboardInset = useKeyboardInset();
  const isComplete = otp.every(d => d !== "");

  const handleNext = () => {
    if (!isComplete) return;
    // Mock: any complete 6-digit code = success, treat as new buyer continuing onboarding
    setRole("buyer");
    navigate("/auth/role-selection");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col px-6 pt-10 pb-28">
      {/* COSORA wordmark */}
      <div className="flex justify-center mb-10">
        <CosoraLogo height={30} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex flex-col items-center max-w-sm mx-auto w-full text-center"
      >
        <p className="text-sm text-gray-600 leading-relaxed">
          You will receive an OTP (One Time Password) on your mobile number
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 mb-8">
          <span className="text-sm font-bold text-gray-900">{maskPhone(phone, countryCode)}</span>
          <button onClick={() => navigate("/auth/login")} className="text-sm font-semibold text-[#a4172c] hover:underline">
            Not You?
          </button>
        </div>

        {/* OTP boxes */}
        <div className="flex items-center gap-2 mb-4">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => (inputsRef.current[i] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              autoFocus={i === 0}
              className={cn(
                "w-9 h-11 text-center text-lg font-bold rounded-lg border-b-2 focus:outline-none transition-colors",
                digit ? "border-[#a4172c] text-gray-900" : "border-gray-300 text-gray-400"
              )}
            />
          ))}
        </div>

        {/* Timer */}
        <p className="text-xs text-gray-400 mb-1">
          {timer > 0
            ? <>The OTP will expire in <span className="font-semibold text-gray-600">{timer} seconds</span></>
            : <button onClick={handleResend} className="font-semibold text-[#a4172c] hover:underline">Resend OTP</button>}
        </p>
      </motion.div>

      {/* Bottom nav buttons — pinned, and lifted above the keyboard when it opens */}
      <div
        data-testid="otp-action-bar"
        className="fixed left-0 right-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t border-gray-100 px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[transform] duration-150 ease-out"
        style={{ transform: keyboardInset ? `translateY(-${keyboardInset}px)` : undefined }}
      >
        <div className="flex gap-3 max-w-sm mx-auto w-full">
          <button
            onClick={() => navigate("/auth/login")}
            className="flex-1 py-3.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={!isComplete}
            className="flex-1 py-3.5 bg-[#a4172c] hover:bg-[#8c1325] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default OtpVerify;
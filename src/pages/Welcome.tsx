import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import CosoraLogo from "@/components/CosoraLogo";

const Welcome = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/home/new-arrivals", { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#a4172c] to-[#7e1120] flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="text-white/70 text-sm font-medium mb-2">Welcome to</p>
        <div className="flex justify-center mb-3">
          <CosoraLogo height={44} variant="white" />
        </div>
        <p className="text-white/80 text-sm font-medium">
          Business Made Easy &amp; Enjoyable
        </p>
      </motion.div>
    </div>
  );
};

export default Welcome;
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const Welcome = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/browse", { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-accent flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <h1 className="font-display text-accent-foreground text-4xl italic mb-4">Cosora</h1>
        <p className="text-accent-foreground/80 text-lg font-medium">
          Business Made Easy & Enjoyable
        </p>
      </motion.div>
    </div>
  );
};

export default Welcome;

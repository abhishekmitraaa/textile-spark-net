import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};

import ad1 from "@/assets/advertisments/advertisment1.png";
import ad2 from "@/assets/advertisments/advertisment2.png";
import ad3 from "@/assets/advertisments/advertisment3.png";
import ad4 from "@/assets/advertisments/advertisment4.png";
import ad5 from "@/assets/advertisments/advertisment5.png";

const slides = [ad1, ad2, ad3, ad4, ad5];
const SLIDE_DURATION = 2000;

const AdvertisementSlideshow = () => {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (current < slides.length - 1) {
      const timer = setTimeout(() => {
        setExiting(true);
        setTimeout(() => {
          setCurrent((prev) => prev + 1);
          setExiting(false);
        }, 300);
      }, SLIDE_DURATION);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        navigate("/advertisements");
      }, SLIDE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [current, navigate]);

  const handleSkip = () => {
    navigate("/advertisements");
  };

  return (
    <>
      <style>{`
        @keyframes fillBar {
          from { width: 0% }
          to { width: 100% }
        }
        body, html {
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      `}</style>

      {/* Full screen white backdrop — blocks everything behind */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#ffffff",
          zIndex: 9998,
        }}
      />

      {/* Centered image container */}
      <motion.div
        variants={reduced ? {} : section}
        initial="hidden"
        animate="show"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
        }}
      >
        <img
          key={current}
          src={slides[current]}
          alt={`Advertisement ${current + 1}`}
          style={{
            maxWidth: "100%",
            maxHeight: "100vh",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            opacity: exiting ? 0 : 1,
            transition: "opacity 0.3s ease",
            display: "block",
          }}
        />

        {/* Progress bars at top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            gap: "4px",
            padding: "12px 12px 0",
            zIndex: 10,
          }}
        >
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: "3px",
                borderRadius: "999px",
                backgroundColor: "rgba(0,0,0,0.12)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: "999px",
                  backgroundColor: "#EF4D62",
                  width: i < current ? "100%" : "0%",
                  animation: i === current ? `fillBar ${SLIDE_DURATION}ms linear forwards` : "none",
                }}
              />
            </div>
          ))}
        </div>

        {/* Dot indicators at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "8px",
            zIndex: 10,
          }}
        >
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                height: "4px",
                borderRadius: "999px",
                backgroundColor: i === current ? "#EF4D62" : "rgba(0,0,0,0.2)",
                width: i === current ? "24px" : "8px",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Skip button */}
        <motion.button
          onClick={handleSkip}
          whileTap={TAP}
          transition={TAP_T}
          style={{
            position: "absolute",
            top: "28px",
            right: "16px",
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(0,0,0,0.1)",
            color: "#1F2937",
            fontSize: "12px",
            fontWeight: 600,
            padding: "6px 14px",
            borderRadius: "999px",
            cursor: "pointer",
            zIndex: 11,
            backdropFilter: "blur(4px)",
            fontFamily: "sans-serif",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          Skip →
        </motion.button>
      </motion.div>
    </>
  );
};

export default AdvertisementSlideshow;
import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Types ──────────────────────────────────────────────────────────────────
interface SocialField {
  id: string;
  value: string;
}

interface SocialPlatform {
  key: string;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  accentColor: string;
}

// ── Icons (inline SVG to avoid external deps) ─────────────────────────────
const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
  </svg>
);

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A66C2">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const YouTubeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="url(#igGrad)">
    <defs>
      <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#F58529" />
        <stop offset="50%" stopColor="#DD2A7B" />
        <stop offset="100%" stopColor="#8134AF" />
      </linearGradient>
    </defs>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

const LinkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

// ── Platform Config ────────────────────────────────────────────────────────
const PLATFORMS: SocialPlatform[] = [
  {
    key: "facebook",
    label: "Facebook Business Page Link",
    placeholder: "https://facebook.com/yourbusiness",
    icon: <FacebookIcon />,
    accentColor: "#1877F2",
  },
  {
    key: "x",
    label: "X Business Account Link",
    placeholder: "@yourusername",
    icon: <XIcon />,
    accentColor: "#000000",
  },
  {
    key: "linkedin",
    label: "LinkedIn Company Page Link",
    placeholder: "linkedin.com/company/yourcompany",
    icon: <LinkedInIcon />,
    accentColor: "#0A66C2",
  },
  {
    key: "youtube",
    label: "YouTube Channel Link",
    placeholder: "https://youtube.com/@yourchannel",
    icon: <YouTubeIcon />,
    accentColor: "#FF0000",
  },
  {
    key: "instagram",
    label: "Instagram Profile Link",
    placeholder: "https://instagram.com/yourbusiness",
    icon: <InstagramIcon />,
    accentColor: "#DD2A7B",
  },
  {
    key: "other",
    label: "Other Platform Link",
    placeholder: "https://yourwebsite.com",
    icon: <LinkIcon />,
    accentColor: "#6B7280",
  },
];

// ── Sub-component: Single Platform Section ─────────────────────────────────
interface PlatformSectionProps {
  platform: SocialPlatform;
  fields: SocialField[];
  onChange: (id: string, value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

function PlatformSection({ platform, fields, onChange, onAdd, onRemove }: PlatformSectionProps) {
  return (
    <div style={{ marginBottom: "4px" }}>
      {fields.map((field, idx) => (
        <div key={field.id} style={{ marginBottom: "2px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "14px 16px",
              backgroundColor: "#fff",
              borderBottom: "1px solid #F1F3F5",
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: `${platform.accentColor}12`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {platform.icon}
            </div>

            {/* Input */}
            <div style={{ flex: 1 }}>
              {idx === 0 && (
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#9CA3AF",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    margin: "0 0 4px 0",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {platform.label}
                </p>
              )}
              <input
                type="url"
                value={field.value}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={platform.placeholder}
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  fontSize: "14px",
                  color: "#1F2937",
                  backgroundColor: "transparent",
                  fontFamily: "'DM Sans', sans-serif",
                  caretColor: "#EF4D62",
                }}
              />
            </div>

            {/* Remove button (only for additional fields) */}
            {idx > 0 && (
              <button
                onClick={() => onRemove(field.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#EF4D62",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add Another */}
      <button
        onClick={onAdd}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "10px 16px 14px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#EF4D62",
          fontSize: "13px",
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          width: "100%",
          textAlign: "left",
        }}
      >
        <PlusIcon />
        Add Another {platform.label}
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function AddSocialLinks() {
  const [fieldMap, setFieldMap] = useState<Record<string, SocialField[]>>(() => {
    const init: Record<string, SocialField[]> = {};
    PLATFORMS.forEach((p) => {
      init[p.key] = [{ id: `${p.key}-0`, value: "" }];
    });
    return init;
  });

    const navigate = useNavigate();
  const [saved, setSaved] = useState(false);

  const handleChange = (platformKey: string, id: string, value: string) => {
    setFieldMap((prev) => ({
      ...prev,
      [platformKey]: prev[platformKey].map((f) => (f.id === id ? { ...f, value } : f)),
    }));
    setSaved(false);
  };

  const handleAdd = (platformKey: string) => {
    setFieldMap((prev) => ({
      ...prev,
      [platformKey]: [
        ...prev[platformKey],
        { id: `${platformKey}-${Date.now()}`, value: "" },
      ],
    }));
  };

  const handleRemove = (platformKey: string, id: string) => {
    setFieldMap((prev) => ({
      ...prev,
      [platformKey]: prev[platformKey].filter((f) => f.id !== id),
    }));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div
      style={{
        maxWidth: "390px",
        margin: "0 auto",
        minHeight: "100vh",
        backgroundColor: "#F7F8FA",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
      }}
    >
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

        input::placeholder { color: #C4C9D4; }
        input:focus { background: transparent; }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .toast {
          animation: slideUp 0.3s ease forwards;
        }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px",
          backgroundColor: "#fff",
          borderBottom: "1px solid #F1F3F5",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button
        onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            color: "#1F2937",
            marginRight: "8px",
          }}
        >
          <BackIcon />
        </button>
        <h1
          style={{
            fontSize: "17px",
            fontWeight: 700,
            color: "#1F2937",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Add Social Media Links
        </h1>
      </div>

      {/* ── Info Banner ── */}
      <div
        style={{
          margin: "12px 16px",
          padding: "12px 14px",
          backgroundColor: "#EFF6FF",
          borderRadius: "10px",
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          border: "1px solid #BFDBFE",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#256fef"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, marginTop: "1px" }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p
          style={{
            fontSize: "12.5px",
            color: "#1D4ED8",
            margin: 0,
            lineHeight: "1.5",
            fontWeight: 500,
          }}
        >
          Add social media links in the business profile to maximize audience involvement.
        </p>
      </div>

      {/* ── Platform Sections ── */}
      <div style={{ backgroundColor: "#fff", borderRadius: "0", flex: 1 }}>
        {PLATFORMS.map((platform) => (
          <PlatformSection
            key={platform.key}
            platform={platform}
            fields={fieldMap[platform.key]}
            onChange={(id, value) => handleChange(platform.key, id, value)}
            onAdd={() => handleAdd(platform.key)}
            onRemove={(id) => handleRemove(platform.key, id)}
          />
        ))}
      </div>

      {/* ── Save Button ── */}
      <div
        style={{
          padding: "16px",
          backgroundColor: "#fff",
          borderTop: "1px solid #F1F3F5",
          position: "sticky",
          bottom: 0,
        }}
      >
        <button
          onClick={handleSave}
          style={{
            width: "100%",
            padding: "15px",
            backgroundColor: "#256fef",
            color: "#fff",
            border: "none",
            borderRadius: "12px",
            fontSize: "15px",
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            letterSpacing: "0.01em",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#256fef")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#256fef")}
        >
          Save
        </button>
      </div>

      {/* ── Toast ── */}
      {saved && (
        <div
          className="toast"
          style={{
            position: "fixed",
            bottom: "90px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#1F2937",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "24px",
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          ✓ Social links saved
        </div>
      )}
    </div>
  );
}
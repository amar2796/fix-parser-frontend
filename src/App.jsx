import { useState, useEffect, useRef, useCallback } from "react";

// ─── Backend URLs ────────────────────────────────────────────────────────────
const API = "https://fix-parser-backend.onrender.com/api/parse";
const API_LOG = "https://fix-parser-backend.onrender.com/api/parse-log";

// ─── Design Tokens ───────────────────────────────────────────────────────────
const T = {
  dark: {
    page:      "#0d1117",
    sidebar:   "#161b22",
    panel:     "#21262d",
    panelAlt:  "#161b22",
    border:    "#30363d",
    borderSub: "#21262d",
    text:      "#e6edf3",
    textMuted: "#8b949e",
    textFaint: "#484f58",
    accent:    "#58a6ff",
    accentBg:  "rgba(88,166,255,0.12)",
    green:     "#3fb950",
    greenBg:   "rgba(63,185,80,0.12)",
    red:       "#f85149",
    redBg:     "rgba(248,81,73,0.12)",
    yellow:    "#e3b341",
    yellowBg:  "rgba(227,179,65,0.12)",
    purple:    "#bc8cff",
    purpleBg:  "rgba(188,140,255,0.12)",
    inputBg:   "#0d1117",
    shadow:    "0 0 0 1px #30363d",
    shadowMd:  "0 4px 12px rgba(0,0,0,0.4)",
    sections: {
      header:  { bg: "rgba(88,166,255,0.08)",  border: "#58a6ff", label: "HEADER",  text: "#79c0ff" },
      body:    { bg: "rgba(63,185,80,0.08)",   border: "#3fb950", label: "BODY",    text: "#56d364" },
      trailer: { bg: "rgba(227,179,65,0.08)",  border: "#e3b341", label: "TRAILER", text: "#d29922" },
    },
  },
  light: {
    page:      "#f6f8fa",
    sidebar:   "#ffffff",
    panel:     "#ffffff",
    panelAlt:  "#f6f8fa",
    border:    "#d0d7de",
    borderSub: "#eaeef2",
    text:      "#1f2328",
    textMuted: "#656d76",
    textFaint: "#bbc0c6",
    accent:    "#0969da",
    accentBg:  "rgba(9,105,218,0.1)",
    green:     "#1a7f37",
    greenBg:   "rgba(26,127,55,0.1)",
    red:       "#cf222e",
    redBg:     "rgba(207,34,46,0.1)",
    yellow:    "#9a6700",
    yellowBg:  "rgba(154,103,0,0.1)",
    purple:    "#6e40c9",
    purpleBg:  "rgba(110,64,201,0.1)",
    inputBg:   "#ffffff",
    shadow:    "0 0 0 1px #d0d7de",
    shadowMd:  "0 4px 12px rgba(0,0,0,0.08)",
    sections: {
      header:  { bg: "rgba(9,105,218,0.06)",   border: "#0969da", label: "HEADER",  text: "#0550ae" },
      body:    { bg: "rgba(26,127,55,0.06)",   border: "#1a7f37", label: "BODY",    text: "#116329" },
      trailer: { bg: "rgba(154,103,0,0.06)",   border: "#9a6700", label: "TRAILER", text: "#7d4e00" },
    },
  },
};

// ─── Badge colors per message type ───────────────────────────────────────────
function badgeFor(name, t) {
  const n = (name || "").toLowerCase();
  if (n.includes("reject"))    return { bg: t.redBg,    fg: t.red,    border: t.red    };
  if (n.includes("cancel"))    return { bg: t.yellowBg, fg: t.yellow, border: t.yellow };
  if (n.includes("execution") || n.includes("fill"))
                               return { bg: t.greenBg,  fg: t.green,  border: t.green  };
  if (n.includes("new order")) return { bg: t.accentBg, fg: t.accent, border: t.accent };
  if (n.includes("logon") || n.includes("logout") || n.includes("heartbeat") || n.includes("test"))
                               return { bg: t.purpleBg, fg: t.purple, border: t.purple };
  return { bg: t.panelAlt, fg: t.textMuted, border: t.border };
}

function Badge({ text, t }) {
  const s = badgeFor(text, t);
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "20px",
      fontSize: "11px", fontWeight: 600, letterSpacing: "0.3px",
      background: s.bg, color: s.fg, border: `1px solid ${s.border}`, whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

// ─── Section utility ──────────────────────────────────────────────────────────
function sectionOf(field, result) {
  if (result.components.header.some(f => f.stepIndex === field.stepIndex)) return "header";
  if (result.components.trailer.some(f => f.stepIndex === field.stepIndex)) return "trailer";
  return "body";
}

// ─── Message Anatomy Bar (signature element) ──────────────────────────────────
// Shows the raw FIX string as a color-coded horizontal strip —
// blue=header tokens, green=body, yellow=trailer.
function AnatomyBar({ result, originalInput, stepIdx = null, onClickField = null }) {
  let delim = "|";
  if (originalInput.includes("\x01")) delim = "\x01";
  else if (originalInput.includes(";")) delim = ";";
  else if (originalInput.includes("^") && !originalInput.includes("|")) delim = "^";

  const parts = originalInput.split(delim).filter(p => p.length > 0);
  const seq = result.sequence;

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: "2px",
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
      fontSize: "11px", lineHeight: 1.4,
    }}>
      {parts.map((part, i) => {
        const field = seq[i];
        const section = field ? sectionOf(field, result) : "body";
        const s = result.components && result.components[section] ? section : "body";
        const sc = result.t_sections ? result.t_sections[s] : null;
        const isCurrent = stepIdx !== null && i === stepIdx;
        return (
          <span
            key={i}
            onClick={() => onClickField && onClickField(i)}
            title={field ? `${field.tag} ${field.name} = ${field.raw}` : part}
            style={{
              display: "inline-block",
              padding: "2px 5px",
              borderRadius: "3px",
              cursor: onClickField ? "pointer" : "default",
              transition: "opacity 0.15s",
              opacity: stepIdx !== null && !isCurrent ? 0.35 : 1,
              fontWeight: isCurrent ? 700 : 400,
            }}
          >
            {part}
          </span>
        );
      })}
    </div>
  );
}

// ─── Anatomy Bar with theme-aware colors ─────────────────────────────────────
function ThemedAnatomyBar({ result, originalInput, stepIdx = null, onClickField = null, t }) {
  let delim = "|";
  if (originalInput.includes("\x01")) delim = "\x01";
  else if (originalInput.includes(";")) delim = ";";
  else if (originalInput.includes("^") && !originalInput.includes("|")) delim = "^";

  const parts = originalInput.split(delim).filter(p => p.length > 0);
  const seq = result.sequence;

  return (
    <div style={{
      background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: "8px",
      padding: "12px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
      fontSize: "11px", lineHeight: "1.8", wordBreak: "break-all",
      boxShadow: t.shadow,
    }}>
      {parts.map((part, i) => {
        const field = seq[i];
        const section = field ? sectionOf(field, result) : "body";
        const sc = t.sections[section];
        const isCurrent = stepIdx !== null && i === stepIdx;
        return (
          <span
            key={i}
            onClick={() => onClickField && onClickField(i)}
            title={field ? `Tag ${field.tag} · ${field.name} = ${field.raw}` : part}
            style={{
              display: "inline-block", padding: "1px 5px", marginRight: "2px",
              borderRadius: "3px", cursor: onClickField ? "pointer" : "default",
              transition: "all 0.2s ease",
              background: isCurrent ? sc.border : (stepIdx !== null ? "transparent" : sc.bg),
              color: isCurrent ? "#fff" : (stepIdx !== null && !isCurrent ? t.textFaint : sc.text),
              fontWeight: isCurrent ? 700 : 400,
              transform: isCurrent ? "scale(1.06)" : "scale(1)",
              boxShadow: isCurrent ? `0 0 0 2px ${sc.border}40` : "none",
            }}
          >{part}</span>
        );
      })}
    </div>
  );
}

// ─── Field Table ──────────────────────────────────────────────────────────────
function FieldTable({ rows, sectionKey, t, onTagClick }) {
  const sc = t.sections[sectionKey];
  if (!rows || rows.length === 0) return null;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "6px 12px", borderRadius: "6px 6px 0 0",
        background: sc.border,
      }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", letterSpacing: "0.8px" }}>
          {sc.label}
        </span>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>
          {rows.length} {rows.length === 1 ? "field" : "fields"}
        </span>
      </div>
      <div style={{
        border: `1px solid ${t.border}`, borderTop: "none",
        borderRadius: "0 0 6px 6px", overflow: "hidden",
        background: sc.bg,
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${t.border}` }}>
              {["Tag", "Field Name", "Raw Value", "Meaning", ""].map((h, i) => (
                <th key={i} style={{
                  padding: "7px 12px", textAlign: "left",
                  fontSize: "11px", fontWeight: 600, color: t.textMuted, letterSpacing: "0.4px",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{
                borderBottom: i < rows.length - 1 ? `1px solid ${t.borderSub}` : "none",
              }}>
                <td style={{
                  padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                  fontSize: "12px", fontWeight: 600, color: sc.text, whiteSpace: "nowrap",
                }}>{r.tag}</td>
                <td style={{ padding: "8px 12px", fontSize: "13px", color: t.text, whiteSpace: "nowrap" }}>
                  {r.name}
                  {r.isGroupStart && (
                    <span style={{ fontSize: "10px", color: t.textFaint, marginLeft: "5px" }}>
                      #{r.groupIndex + 1}
                    </span>
                  )}
                  {r.isUnknownTag && (
                    <span style={{ fontSize: "10px", color: t.red, marginLeft: "5px" }}>unknown</span>
                  )}
                </td>
                <td style={{
                  padding: "8px 12px",
                  fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                  fontSize: "12px", color: t.textMuted, maxWidth: "220px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{r.raw}</td>
                <td style={{ padding: "8px 12px", fontSize: "13px", color: t.text }}>{r.meaning}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                  <button
                    onClick={() => onTagClick && onTagClick(r)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: "11px", color: t.accent, padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    ↗
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Walkthrough ─────────────────────────────────────────────────────────────
const SPEEDS = { slow: 3000, normal: 1800, fast: 800 };

function Walkthrough({ result, originalInput, t }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [fade, setFade] = useState(true);
  const timer = useRef(null);

  const seq = result.sequence;
  const cur = seq[step];
  const sec = sectionOf(cur, result);
  const sc = t.sections[sec];

  useEffect(() => {
    setFade(false);
    const t2 = setTimeout(() => setFade(true), 40);
    return () => clearTimeout(t2);
  }, [step]);

  useEffect(() => {
    if (playing) {
      timer.current = setInterval(() => {
        setStep(s => {
          if (s >= seq.length - 1) { setPlaying(false); return s; }
          return s + 1;
        });
      }, SPEEDS[speed]);
    } else {
      clearInterval(timer.current);
    }
    return () => clearInterval(timer.current);
  }, [playing, speed, seq.length]);

  return (
    <div>
      <ThemedAnatomyBar
        result={result} originalInput={originalInput}
        stepIdx={step} onClickField={i => { setPlaying(false); setStep(i); }} t={t}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
        <span style={{ fontSize: "12px", color: t.textMuted }}>
          Field <strong style={{ color: t.text }}>{step + 1}</strong> of {seq.length}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <select
            value={speed}
            onChange={e => setSpeed(e.target.value)}
            style={{
              padding: "4px 8px", borderRadius: "6px", fontSize: "12px",
              border: `1px solid ${t.border}`, background: t.panel, color: t.text,
            }}
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
          <Btn
            onClick={() => { if (step >= seq.length - 1) setStep(0); setPlaying(p => !p); }}
            style={{ background: playing ? t.red : t.green, color: "#fff", border: "none" }}
          >
            {playing ? "⏸" : "▶"}
          </Btn>
          <Btn onClick={() => { setPlaying(false); setStep(s => Math.max(s - 1, 0)); }} disabled={step === 0} t={t}>
            ←
          </Btn>
          <Btn onClick={() => { setPlaying(false); setStep(s => Math.min(s + 1, seq.length - 1)); }} disabled={step === seq.length - 1} t={t}>
            →
          </Btn>
        </div>
      </div>

      <div style={{ height: "3px", background: t.border, borderRadius: "2px", marginBottom: "16px" }}>
        <div style={{
          height: "100%", borderRadius: "2px", background: sc.border,
          width: `${((step + 1) / seq.length) * 100}%`, transition: "width 0.3s ease",
        }} />
      </div>

      <div style={{
        border: `1px solid ${sc.border}`, borderRadius: "10px", padding: "20px",
        background: sc.bg, boxShadow: t.shadow,
        opacity: fade ? 1 : 0, transform: fade ? "translateY(0)" : "translateY(4px)",
        transition: "opacity 0.2s, transform 0.2s",
      }}>
        <div style={{
          fontSize: "10px", fontWeight: 700, color: sc.border,
          textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px",
        }}>
          {sc.label} SECTION{cur.isGroupStart ? ` · ENTRY #${cur.groupIndex + 1}` : ""}
        </div>

        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "2px" }}>TAG</div>
            <div style={{
              fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
              fontSize: "32px", fontWeight: 700, color: t.text,
            }}>{cur.tag}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "2px" }}>FIELD NAME</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: t.text }}>{cur.name}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "4px" }}>RAW VALUE</div>
            <code style={{
              display: "inline-block", padding: "4px 10px", borderRadius: "6px",
              background: t.panel, border: `1px solid ${t.border}`,
              fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
              fontSize: "16px", color: sc.text,
            }}>{cur.raw}</code>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "4px" }}>MEANING</div>
            <div style={{ fontSize: "18px", color: t.text, fontWeight: 500 }}>{cur.meaning}</div>
          </div>
        </div>

        <div style={{
          borderLeft: `3px solid ${sc.border}`, paddingLeft: "14px",
          background: t.panel, borderRadius: "0 6px 6px 0", padding: "10px 14px",
        }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: sc.border, letterSpacing: "0.8px", marginBottom: "4px" }}>
            WHY THIS MATTERS
          </div>
          <div style={{ fontSize: "13px", color: t.textMuted, lineHeight: 1.6 }}>{cur.why}</div>
        </div>

        {cur.referenceUrl && (
          <a href={cur.referenceUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: "10px", fontSize: "12px", color: t.accent }}>
            View official spec for tag {cur.tag} ↗
          </a>
        )}
      </div>

      <div style={{ display: "flex", gap: "3px", marginTop: "12px", flexWrap: "wrap" }}>
        {seq.map((f, i) => {
          const s = sectionOf(f, result);
          const sc2 = t.sections[s];
          const isAct = i === step;
          return (
            <button key={i} onClick={() => { setPlaying(false); setStep(i); }} title={`${f.tag} ${f.name}`}
              style={{
                width: "26px", height: "26px", fontSize: "9px", borderRadius: "4px",
                border: isAct ? `2px solid ${sc2.border}` : `1px solid ${t.border}`,
                background: isAct ? sc2.border : sc2.bg,
                color: isAct ? "#fff" : t.textMuted,
                cursor: "pointer", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                transition: "all 0.1s",
              }}>{f.tag}</button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tag Detail Panel (slide-in from right) ───────────────────────────────────
function TagPanel({ field, onClose, t }) {
  if (!field) return null;
  const sec = ["header", "body", "trailer"].find(s => false) || "body";
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "380px",
      background: t.panel, borderLeft: `1px solid ${t.border}`,
      boxShadow: t.shadowMd, zIndex: 100,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 20px", borderBottom: `1px solid ${t.border}`,
      }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Tag Reference</span>
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          color: t.textMuted, fontSize: "18px", lineHeight: 1, padding: "2px 6px",
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "baseline", marginBottom: "20px" }}>
          <span style={{
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
            fontSize: "40px", fontWeight: 700, color: t.accent, lineHeight: 1,
          }}>{field.tag}</span>
          <span style={{ fontSize: "22px", fontWeight: 700, color: t.text }}>{field.name}</span>
        </div>

        {field.raw && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "6px", letterSpacing: "0.5px" }}>
              VALUE IN THIS MESSAGE
            </div>
            <div style={{
              display: "flex", gap: "12px", alignItems: "center",
              padding: "10px 14px", background: t.panelAlt,
              border: `1px solid ${t.border}`, borderRadius: "8px",
            }}>
              <code style={{
                fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                fontSize: "14px", color: t.accent,
              }}>{field.raw}</code>
              <span style={{ color: t.textMuted, fontSize: "13px" }}>→</span>
              <span style={{ fontSize: "14px", color: t.text, fontWeight: 500 }}>{field.meaning}</span>
            </div>
          </div>
        )}

        {field.why && (
          <div style={{
            borderLeft: `3px solid ${t.accent}`, paddingLeft: "14px",
            padding: "12px 14px", background: t.panelAlt,
            borderRadius: "0 8px 8px 0", marginBottom: "16px",
          }}>
            <div style={{
              fontSize: "10px", fontWeight: 700, color: t.accent,
              letterSpacing: "0.8px", marginBottom: "6px",
            }}>WHY THIS MATTERS</div>
            <div style={{ fontSize: "13px", color: t.textMuted, lineHeight: 1.6 }}>{field.why}</div>
          </div>
        )}

        {field.isUnknownTag && (
          <div style={{
            padding: "10px 14px", background: t.redBg, border: `1px solid ${t.red}`,
            borderRadius: "8px", fontSize: "13px", color: t.red, marginBottom: "16px",
          }}>
            This tag number isn't in our built-in dictionary yet.
          </div>
        )}

        {field.referenceUrl && (
          <a href={field.referenceUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "8px",
              background: t.accentBg, border: `1px solid ${t.accent}`,
              color: t.accent, fontSize: "13px", fontWeight: 500,
              textDecoration: "none",
            }}>
            View official FIX spec ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Inline components ────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, style = {}, t }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px", borderRadius: "6px", cursor: disabled ? "default" : "pointer",
        fontSize: "12px", fontWeight: 500,
        border: `1px solid ${t ? t.border : "#30363d"}`,
        background: disabled ? (t ? t.panelAlt : "transparent") : (t ? t.panel : "#21262d"),
        color: disabled ? (t ? t.textFaint : "#484f58") : (t ? t.text : "#e6edf3"),
        ...style,
      }}
    >{children}</button>
  );
}

function Card({ children, t, style = {} }) {
  return (
    <div style={{
      background: t.panel, border: `1px solid ${t.border}`,
      borderRadius: "10px", overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, t, right }) {
  return (
    <div style={{
      padding: "14px 20px", borderBottom: `1px solid ${t.border}`,
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: "11px", color: t.textMuted, marginTop: "1px" }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, loading, t, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
        border: "none", cursor: disabled || loading ? "default" : "pointer",
        background: disabled || loading ? t.textFaint : t.accent,
        color: "#fff", transition: "opacity 0.15s", ...style,
      }}
    >{loading ? "Processing…" : children}</button>
  );
}

function ValidationBanner({ result, t }) {
  const ok = result.isValid;
  return (
    <div style={{
      padding: "10px 16px", borderRadius: "8px", marginBottom: "16px",
      background: ok ? t.greenBg : t.redBg,
      border: `1px solid ${ok ? t.green : t.red}`,
      color: ok ? t.green : t.red,
    }}>
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: ok || !result.validationErrors.length ? 0 : "8px" }}>
        {ok ? "✓ Valid" : "✗ Validation errors"}{" "}
        <span style={{ fontWeight: 400, color: t.textMuted }}>· {result.msgTypeName}</span>
      </div>
      {!ok && result.validationErrors.map((e, i) => (
        <div key={i} style={{ fontSize: "12px", marginTop: "4px" }}>· {e}</div>
      ))}
    </div>
  );
}

function MetaRow({ result, t }) {
  const items = [
    { label: "Delimiter", val: result.delimiterDetected === "^" ? "SOH (\\x01)" : result.delimiterDetected },
    { label: "Checksum", val: `${result.checksum.calculated} calc / ${result.checksum.actual} actual` },
    { label: "Body length", val: `${result.bodyLength.calculated} calc / ${result.bodyLength.actual} actual` },
    { label: "Fields", val: result.totalFields },
  ];
  return (
    <div style={{
      display: "flex", gap: "0", marginBottom: "16px",
      border: `1px solid ${t.border}`, borderRadius: "8px", overflow: "hidden",
    }}>
      {items.map((item, i) => (
        <div key={i} style={{
          flex: 1, padding: "10px 14px",
          borderRight: i < items.length - 1 ? `1px solid ${t.border}` : "none",
          background: t.panelAlt,
        }}>
          <div style={{ fontSize: "10px", color: t.textMuted, letterSpacing: "0.4px", marginBottom: "2px" }}>
            {item.label.toUpperCase()}
          </div>
          <div style={{
            fontSize: "13px", fontWeight: 600, color: t.text,
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
          }}>{item.val}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Common popular tags list ─────────────────────────────────────────────────
const POPULAR_TAGS = [
  [8,"BeginString"],[9,"BodyLength"],[35,"MsgType"],[49,"SenderCompID"],[56,"TargetCompID"],
  [11,"ClOrdID"],[55,"Symbol"],[54,"Side"],[38,"OrderQty"],[40,"OrdType"],[44,"Price"],
  [59,"TimeInForce"],[37,"OrderID"],[39,"OrdStatus"],[150,"ExecType"],[17,"ExecID"],
  [60,"TransactTime"],[41,"OrigClOrdID"],[99,"StopPx"],[10,"CheckSum"],
];

// ─── Single Message View ──────────────────────────────────────────────────────
function SingleMessageView({ t, onTagClick }) {
  const [input, setInput] = useState(
    "8=FIX.4.4|9=120|35=D|49=SENDER|56=TARGET|34=12|52=20260613-18:15:00|11=ClOrd123|55=AAPL|54=1|38=100|40=2|44=150.00|60=20260613-18:15:00|10=068|"
  );
  const [result, setResult] = useState(null);
  const [parsedInput, setParsedInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [subView, setSubView] = useState("table");

  const handleParse = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: input });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      setResult(await res.json());
      setParsedInput(input);
    } catch (e) {
      setError(e.message || "Failed — backend may be waking up (cold start). Try again in a moment.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", gap: "20px", minHeight: "calc(100vh - 96px)", alignItems: "stretch" }}>
      {/* Left: input panel */}
      <div style={{ flex: "0 0 320px", minWidth: "260px" }}>
        <Card t={t} style={{ height: "100%" }}>
          <CardHeader title="Parse a FIX message" subtitle="Paste any version · delimiter auto-detected" t={t} />
          <div style={{ padding: "16px" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={8}
              placeholder="8=FIX.4.4|9=...|35=D|..."
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                fontSize: "12px", padding: "10px 12px",
                border: `1px solid ${t.border}`, borderRadius: "8px",
                background: t.inputBg, color: t.text, resize: "vertical",
                lineHeight: 1.6,
              }}
            />
            <PrimaryBtn onClick={handleParse} loading={loading} disabled={!input.trim()} t={t}
              style={{ width: "100%", marginTop: "10px" }}>
              Parse →
            </PrimaryBtn>
            {loading && (
              <p style={{ fontSize: "12px", color: t.textMuted, marginTop: "10px", textAlign: "center" }}>
                Contacting backend — may take ~50 s on first wake…
              </p>
            )}
            {error && (
              <div style={{
                marginTop: "12px", padding: "10px 12px", borderRadius: "8px",
                background: t.redBg, border: `1px solid ${t.red}`, color: t.red, fontSize: "12px",
              }}>{error}</div>
            )}
            {result && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${t.border}` }}>
                <ValidationBanner result={result} t={t} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    ["Delimiter", result.delimiterDetected === "^" ? "SOH" : result.delimiterDetected],
                    ["Fields", result.totalFields],
                    ["Checksum", `${result.checksum.actual}`],
                    ["Body len", result.bodyLength.actual],
                  ].map(([k, v]) => (
                    <div key={k} style={{ padding: "8px 10px", background: t.panelAlt, borderRadius: "6px" }}>
                      <div style={{ fontSize: "10px", color: t.textMuted, letterSpacing: "0.4px" }}>{k.toUpperCase()}</div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: t.text, fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Right: results */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {!result && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "8px",
            border: `1px dashed ${t.border}`, borderRadius: "10px",
            color: t.textFaint, fontSize: "13px", minHeight: "400px",
          }}>
            <div style={{ fontSize: "32px", opacity: 0.3 }}>◫</div>
            Parsed fields will appear here
          </div>
        )}

        {result && (
          <div>
            <ThemedAnatomyBar result={result} originalInput={parsedInput} t={t} />

            <div style={{ display: "flex", gap: "6px", margin: "14px 0" }}>
              {["table", "walkthrough"].map(v => (
                <button key={v} onClick={() => setSubView(v)} style={{
                  padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 500,
                  border: `1px solid ${subView === v ? t.accent : t.border}`,
                  background: subView === v ? t.accentBg : t.panel,
                  color: subView === v ? t.accent : t.textMuted,
                  cursor: "pointer",
                }}>
                  {v === "table" ? "Table" : "Walkthrough"}
                </button>
              ))}
            </div>

            {subView === "table" ? (
              <>
                <FieldTable rows={result.components.header} sectionKey="header" t={t} onTagClick={onTagClick} />
                <FieldTable rows={result.components.body} sectionKey="body" t={t} onTagClick={onTagClick} />
                <FieldTable rows={result.components.trailer} sectionKey="trailer" t={t} onTagClick={onTagClick} />
              </>
            ) : (
              <Walkthrough result={result} originalInput={parsedInput} t={t} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session / Log View ───────────────────────────────────────────────────────
function buildRelatedIdMap(messages) {
  const parent = {};
  const find = x => { if (!(x in parent)) parent[x] = x; while (parent[x] !== x) x = parent[x]; return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb; };
  messages.forEach(m => {
    if (m.clOrdID) find(m.clOrdID);
    if (m.origClOrdID) { find(m.origClOrdID); if (m.clOrdID) union(m.clOrdID, m.origClOrdID); }
  });
  const map = {}; Object.keys(parent).forEach(id => { map[id] = find(id); }); return map;
}

const SAMPLE_LOG = [
  "8=FIX.4.4|9=61|35=A|49=EXEC|56=BANZAI|34=1|52=20260613-23:24:06|98=0|108=30|10=097|",
  "8=FIX.4.4|9=116|35=D|49=BANZAI|56=EXEC|34=2|52=20260613-23:24:42|11=ORD1001|55=MSFT|54=1|38=10000|40=2|44=12.3|60=20260613-23:24:42|10=199|",
  "8=FIX.4.4|9=123|35=8|49=EXEC|56=BANZAI|34=2|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC1|150=0|39=0|55=MSFT|54=1|38=10000|14=0|6=0|10=233|",
  "8=FIX.4.4|9=133|35=8|49=EXEC|56=BANZAI|34=3|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC2|150=2|39=2|55=MSFT|54=1|38=10000|32=10000|31=12.3|14=10000|6=12.3|10=011|",
  "8=FIX.4.4|9=112|35=D|49=BANZAI|56=EXEC|34=4|52=20260613-23:25:12|11=ORD1002|55=SPY|54=1|38=10000|40=2|44=10|60=20260613-23:25:12|10=003|",
  "8=FIX.4.4|9=119|35=8|49=EXEC|56=BANZAI|34=4|52=20260613-23:25:12|37=EXECORD2|11=ORD1002|17=EXEC3|150=0|39=0|55=SPY|54=1|38=10000|14=0|6=0|10=144|",
  "8=FIX.4.4|9=98|35=F|49=BANZAI|56=EXEC|34=5|52=20260613-23:25:16|11=ORD1003|41=ORD1002|55=SPY|54=1|60=20260613-23:25:16|10=078|",
  "8=FIX.4.4|9=86|35=3|49=EXEC|56=BANZAI|34=5|52=20260613-23:25:16|45=5|58=Unsupported message type|372=F|373=3|10=066|",
].join("");

function SessionView({ t, onTagClick }) {
  const [logInput, setLogInput] = useState("");
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [detailMode, setDetailMode] = useState("table");
  const fileRef = useRef(null);

  const handleFile = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (![".txt", ".log"].some(x => f.name.toLowerCase().endsWith(x))) {
      setError("Upload a .txt or .log file"); e.target.value = ""; return;
    }
    const r = new FileReader();
    r.onload = ev => { setLogInput(ev.target.result); setFileName(f.name); setMessages(null); setSelectedIdx(null); setError(null); };
    r.readAsText(f);
    e.target.value = "";
  };

  const handleProcess = async () => {
    setLoading(true); setError(null); setMessages(null); setSelectedIdx(null);
    try {
      const res = await fetch(API_LOG, { method: "POST", headers: { "Content-Type": "text/plain" }, body: logInput });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      const d = await res.json();
      setMessages(d.messages);
      if (d.messages && d.messages.length > 0) setSelectedIdx(0);
    } catch (e) {
      setError(e.message || "Failed — backend may be waking up. Try again in a moment.");
    } finally { setLoading(false); }
  };

  const idMap = messages ? buildRelatedIdMap(messages) : {};
  const sel = messages && selectedIdx !== null ? messages[selectedIdx] : null;
  const selGroupKey = sel && sel.clOrdID ? idMap[sel.clOrdID] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Card t={t}>
        <CardHeader title="Session / Log View" subtitle="Paste or upload a multi-message FIX log" t={t}
          right={
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn t={t} onClick={() => { setLogInput(SAMPLE_LOG); setFileName(null); }}>Sample data</Btn>
              <Btn t={t} onClick={() => fileRef.current && fileRef.current.click()}>📁 Upload</Btn>
              <input ref={fileRef} type="file" accept=".txt,.log" onChange={handleFile} style={{ display: "none" }} />
              <Btn t={t} onClick={() => { setLogInput(""); setMessages(null); setSelectedIdx(null); setError(null); setFileName(null); }}>Clear</Btn>
              {fileName && <span style={{ fontSize: "11px", color: t.textMuted, alignSelf: "center" }}>{fileName}</span>}
            </div>
          }
        />
        <div style={{ padding: "16px" }}>
          <textarea
            value={logInput}
            onChange={e => { setLogInput(e.target.value); setFileName(null); }}
            rows={5}
            placeholder="Paste a multi-message FIX log here… stray text, timestamps, and blank lines are automatically ignored."
            style={{
              width: "100%", boxSizing: "border-box",
              fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
              fontSize: "12px", padding: "10px 12px",
              border: `1px solid ${t.border}`, borderRadius: "8px",
              background: t.inputBg, color: t.text, resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px" }}>
            <PrimaryBtn onClick={handleProcess} loading={loading} disabled={!logInput.trim()} t={t}>
              Process log →
            </PrimaryBtn>
            {loading && <span style={{ fontSize: "12px", color: t.textMuted }}>Parsing messages…</span>}
          </div>
          {error && (
            <div style={{
              marginTop: "10px", padding: "10px 12px", borderRadius: "8px",
              background: t.redBg, border: `1px solid ${t.red}`, color: t.red, fontSize: "12px",
            }}>{error}</div>
          )}
        </div>
      </Card>

      {!messages && !loading && (
        <div style={{
          padding: "48px 24px", textAlign: "center", color: t.textFaint, fontSize: "13px",
          border: `1px dashed ${t.border}`, borderRadius: "10px",
        }}>
          Timeline and details will appear here after processing a log.
        </div>
      )}

      {messages && (
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
          <div style={{ flex: "0 0 320px", minWidth: "260px" }}>
            <div style={{
              fontSize: "11px", fontWeight: 600, color: t.textMuted, letterSpacing: "0.5px",
              marginBottom: "8px", padding: "0 4px",
            }}>
              TIMELINE · {messages.length} MESSAGES
            </div>
            <Card t={t} style={{ overflow: "hidden", maxHeight: "600px" }}>
              <div style={{ overflowY: "auto", maxHeight: "600px" }}>
                {messages.map((m, i) => {
                  const isSel = i === selectedIdx;
                  const isRel = selGroupKey && m.clOrdID && idMap[m.clOrdID] === selGroupKey && !isSel;
                  return (
                    <div key={i} onClick={() => setSelectedIdx(i)} style={{
                      padding: "10px 14px", cursor: "pointer",
                      borderBottom: `1px solid ${t.borderSub}`,
                      borderLeft: `3px solid ${isSel ? t.accent : isRel ? t.yellow : "transparent"}`,
                      background: isSel ? t.accentBg : isRel ? t.yellowBg : "transparent",
                      transition: "background 0.1s",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "10px", color: t.textFaint, fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace" }}>
                          {m.sendingTime ? m.sendingTime.split("-")[1] : `#${i}`}
                        </span>
                        <span style={{ fontSize: "10px", color: t.textFaint }}>
                          {m.senderCompID}→{m.targetCompID}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <Badge text={m.msgTypeName} t={t} />
                        {!m.isValid && <span style={{ fontSize: "10px", color: t.red }}>⚠</span>}
                      </div>
                      <div style={{ fontSize: "12px", color: t.text, fontWeight: 500 }}>{m.summary}</div>
                      {m.clOrdID && (
                        <div style={{
                          fontSize: "10px", color: t.textFaint, marginTop: "3px",
                          fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                        }}>
                          {m.clOrdID}{m.origClOrdID ? ` ← ${m.origClOrdID}` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {!sel && (
              <div style={{
                padding: "48px", textAlign: "center", color: t.textFaint, fontSize: "13px",
                border: `1px dashed ${t.border}`, borderRadius: "10px",
              }}>Select a message from the timeline
              </div>
            )}

            {sel && (
              <div>
                <ValidationBanner result={sel} t={t} />

                {sel.rawMessage && (
                  <div style={{ marginBottom: "14px" }}>
                    <ThemedAnatomyBar result={sel} originalInput={sel.rawMessage} t={t} />
                  </div>
                )}

                <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                  {["table", "walkthrough"].map(v => (
                    <button key={v} onClick={() => setDetailMode(v)} style={{
                      padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500,
                      border: `1px solid ${detailMode === v ? t.accent : t.border}`,
                      background: detailMode === v ? t.accentBg : t.panel,
                      color: detailMode === v ? t.accent : t.textMuted, cursor: "pointer",
                    }}>{v === "table" ? "Table" : "Walkthrough"}</button>
                  ))}
                </div>

                {detailMode === "table" ? (
                  <div style={{ maxHeight: "520px", overflowY: "auto" }}>
                    <FieldTable rows={sel.components.header} sectionKey="header" t={t} onTagClick={onTagClick} />
                    <FieldTable rows={sel.components.body} sectionKey="body" t={t} onTagClick={onTagClick} />
                    <FieldTable rows={sel.components.trailer} sectionKey="trailer" t={t} onTagClick={onTagClick} />
                  </div>
                ) : sel.rawMessage ? (
                  <Walkthrough result={sel} originalInput={sel.rawMessage} t={t} />
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tag Reference View ───────────────────────────────────────────────────────
function TagReferenceView({ t, initialTag = null }) {
  const [query, setQuery] = useState(initialTag ? String(initialTag) : "");
  const [field, setField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async tagNum => {
    setLoading(true); setSearched(true); setField(null);
    try {
      const syn = `8=FIX.4.4|9=10|35=0|${tagNum}=X|10=000|`;
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: syn });
      const d = await res.json();
      const f = d.sequence ? d.sequence.find(f => String(f.tag) === String(tagNum)) : null;
      setField(f || null);
    } catch { setField(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initialTag) search(initialTag);
  }, [initialTag, search]);

  const handleSearch = () => {
    const t2 = query.trim();
    if (/^\d+$/.test(t2)) search(t2);
    else setSearched(true);
  };

  return (
    <div>
      <Card t={t} style={{ marginBottom: "20px" }}>
        <div style={{ padding: "20px" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "18px", color: t.text, fontWeight: 700 }}>Tag Reference</h2>
          <p style={{ margin: "0 0 16px", fontSize: "13px", color: t.textMuted }}>
            Search any FIX tag number for its name, meaning, and a link to the official spec.
          </p>
          <div style={{ display: "flex", gap: "8px", maxWidth: "480px" }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 54"
              style={{
                flex: 1, padding: "8px 14px", borderRadius: "8px", fontSize: "14px",
                border: `1px solid ${t.border}`, background: t.inputBg, color: t.text,
                fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
              }}
            />
            <PrimaryBtn onClick={handleSearch} loading={loading} t={t}>Look up</PrimaryBtn>
          </div>

          {searched && !loading && !field && (
            <div style={{ marginTop: "12px", fontSize: "13px", color: t.textMuted }}>
              {/^\d+$/.test(query.trim()) ? (
                <>Tag not in dictionary. Check{" "}
                  <a href={`https://www.onixs.biz/fix-dictionary/4.4/tagNum_${query.trim()}.html`}
                    target="_blank" rel="noopener noreferrer" style={{ color: t.accent }}>
                    official spec ↗
                  </a>
                </>
              ) : "Enter a numeric tag number."}
            </div>
          )}

          {field && (
            <div style={{ marginTop: "20px", padding: "16px", background: t.panelAlt, borderRadius: "10px", border: `1px solid ${t.border}` }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "baseline", marginBottom: "16px" }}>
                <span style={{
                  fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                  fontSize: "40px", fontWeight: 700, color: t.accent, lineHeight: 1,
                }}>{field.tag}</span>
                <span style={{ fontSize: "22px", fontWeight: 700, color: t.text }}>{field.name}</span>
              </div>
              <div style={{ borderLeft: `3px solid ${t.accent}`, paddingLeft: "14px", marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: t.accent, letterSpacing: "0.8px", marginBottom: "4px" }}>
                  WHY THIS MATTERS
                </div>
                <div style={{ fontSize: "13px", color: t.textMuted, lineHeight: 1.6 }}>{field.why}</div>
              </div>
              {field.isUnknownTag && (
                <div style={{ padding: "8px 12px", background: t.redBg, borderRadius: "6px", color: t.red, fontSize: "12px", marginBottom: "10px" }}>
                  Not in our built-in dictionary.
                </div>
              )}
              <a href={field.referenceUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "7px 14px", borderRadius: "7px",
                  background: t.accentBg, border: `1px solid ${t.accent}`,
                  color: t.accent, fontSize: "12px", fontWeight: 500, textDecoration: "none",
                }}>
                View full spec ↗
              </a>
            </div>
          )}
        </div>
      </Card>

      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: t.textMuted, letterSpacing: "0.5px", marginBottom: "10px" }}>
          COMMON TAGS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px" }}>
          {POPULAR_TAGS.map(([tag, name]) => (
            <button key={tag} onClick={() => { setQuery(String(tag)); search(tag); }}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: "8px",
                border: `1px solid ${t.border}`, background: t.panel,
                cursor: "pointer", transition: "border-color 0.15s",
              }}>
              <div style={{
                fontSize: "10px", color: t.textFaint, letterSpacing: "0.4px",
                fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
              }}>TAG {tag}</div>
              <div style={{ fontSize: "13px", color: t.text, fontWeight: 600, marginTop: "2px" }}>{name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "single",    label: "Single Message", icon: "◫" },
  { id: "session",   label: "Session / Log",  icon: "≡" },
  { id: "reference", label: "Tag Reference",  icon: "⌗" },
];

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [themeName, setThemeName] = useState("dark");
  const [view, setView] = useState("single");
  const [tagPanel, setTagPanel] = useState(null); // field object or null

  const t = T[themeName];

  const handleTagClick = field => setTagPanel(field);
  const closeTagPanel = () => setTagPanel(null);

  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      background: t.page, color: t.text,
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Sidebar */}
      <div style={{
        width: "220px", flexShrink: 0, height: "100vh", overflow: "hidden",
        background: t.sidebar, borderRight: `1px solid ${t.border}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: t.text, letterSpacing: "-0.3px" }}>
            <span style={{ color: t.accent }}>FIX</span> Parser
          </div>
          <div style={{ fontSize: "10px", color: t.textFaint, marginTop: "2px", letterSpacing: "0.3px" }}>
            PROTOCOL ANALYSIS TOOL
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {NAV_ITEMS.map(item => {
            const active = view === item.id;
            return (
              <button key={item.id} onClick={() => setView(item.id)} style={{
                display: "flex", alignItems: "center", gap: "10px", width: "100%",
                padding: "8px 12px", borderRadius: "8px", marginBottom: "2px",
                border: "none", cursor: "pointer", textAlign: "left",
                background: active ? t.accentBg : "transparent",
                color: active ? t.accent : t.textMuted,
                fontWeight: active ? 600 : 400, fontSize: "13px",
                transition: "background 0.1s, color 0.1s",
              }}>
                <span style={{ fontSize: "14px", width: "16px", textAlign: "center", opacity: active ? 1 : 0.6 }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Theme toggle at bottom */}
        <div style={{ padding: "12px 8px", borderTop: `1px solid ${t.border}` }}>
          <button onClick={() => setThemeName(n => n === "dark" ? "light" : "dark")} style={{
            display: "flex", alignItems: "center", gap: "8px", width: "100%",
            padding: "7px 12px", borderRadius: "8px",
            border: "none", cursor: "pointer", textAlign: "left",
            background: "transparent", color: t.textMuted, fontSize: "12px",
            transition: "background 0.1s",
          }}>
            <span>{themeName === "dark" ? "☀" : "🌙"}</span>
            {themeName === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{
          height: "48px", flexShrink: 0, borderBottom: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", padding: "0 24px",
          background: t.sidebar,
        }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>
            {NAV_ITEMS.find(n => n.id === view)?.label}
          </span>
          <span style={{ marginLeft: "8px", fontSize: "11px", color: t.textFaint }}>
            {view === "single" && "Paste any FIX message · delimiter auto-detected"}
            {view === "session" && "Paste or upload a multi-message log · garbage lines ignored automatically"}
            {view === "reference" && "Search any tag by number · 935 tags in dictionary"}
          </span>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {view === "single"    && <SingleMessageView t={t} onTagClick={handleTagClick} />}
          {view === "session"   && <SessionView t={t} onTagClick={handleTagClick} />}
          {view === "reference" && <TagReferenceView t={t} />}
        </div>
      </div>

      {/* Tag reference slide-in panel */}
      {tagPanel && <TagPanel field={tagPanel} onClose={closeTagPanel} t={t} />}
    </div>
  );
}

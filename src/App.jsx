import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Backend URLs ─────────────────────────────────────────────────────────────
const API     = "https://fix-parser-backend.onrender.com/api/parse";
const API_LOG = "https://fix-parser-backend.onrender.com/api/parse-log";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  dark: {
    page:      "#0f172a",
    header:    "#1e293b",
    panel:     "#1e293b",
    panelAlt:  "#0f172a",
    border:    "#334155",
    borderSub: "#1e293b",
    text:      "#e2e8f0",
    textMuted: "#94a3b8",
    textFaint: "#475569",
    accent:    "#60a5fa",
    accentBg:  "rgba(96,165,250,0.12)",
    green:     "#34d399",
    greenBg:   "rgba(52,211,153,0.12)",
    red:       "#f87171",
    redBg:     "rgba(248,113,113,0.12)",
    yellow:    "#fbbf24",
    yellowBg:  "rgba(251,191,36,0.12)",
    purple:    "#a78bfa",
    purpleBg:  "rgba(167,139,250,0.12)",
    inputBg:   "#0f172a",
    shadow:    "0 0 0 1px #334155",
    shadowMd:  "0 8px 24px rgba(0,0,0,0.6)",
    sections: {
      header:  { bg: "rgba(96,165,250,0.08)",  border: "#3b82f6", label: "HEADER",  text: "#60a5fa" },
      body:    { bg: "rgba(52,211,153,0.08)",  border: "#10b981", label: "BODY",    text: "#34d399" },
      trailer: { bg: "rgba(251,191,36,0.08)",  border: "#f59e0b", label: "TRAILER", text: "#fbbf24" },
    },
  },
  light: {
    page:      "#f8fafc",
    header:    "#ffffff",
    panel:     "#ffffff",
    panelAlt:  "#f1f5f9",
    border:    "#e2e8f0",
    borderSub: "#f1f5f9",
    text:      "#0f172a",
    textMuted: "#64748b",
    textFaint: "#cbd5e1",
    accent:    "#2563eb",
    accentBg:  "rgba(37,99,235,0.08)",
    green:     "#059669",
    greenBg:   "rgba(5,150,105,0.08)",
    red:       "#dc2626",
    redBg:     "rgba(220,38,38,0.08)",
    yellow:    "#d97706",
    yellowBg:  "rgba(217,119,6,0.08)",
    purple:    "#7c3aed",
    purpleBg:  "rgba(124,58,237,0.08)",
    inputBg:   "#ffffff",
    shadow:    "0 0 0 1px #e2e8f0",
    shadowMd:  "0 8px 24px rgba(0,0,0,0.08)",
    sections: {
      header:  { bg: "rgba(37,99,235,0.06)",  border: "#2563eb", label: "HEADER",  text: "#1d4ed8" },
      body:    { bg: "rgba(5,150,105,0.06)",  border: "#059669", label: "BODY",    text: "#047857" },
      trailer: { bg: "rgba(217,119,6,0.06)",  border: "#d97706", label: "TRAILER", text: "#b45309" },
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function countFixStarts(text) {
  return (text.match(/8=FIX/g) || []).length;
}

function badgeFor(name, t) {
  const n = (name || "").toLowerCase();
  if (n.includes("reject"))   return { bg: t.redBg,    fg: t.red,    border: t.red    };
  if (n.includes("cancel"))   return { bg: t.yellowBg, fg: t.yellow, border: t.yellow };
  if (n.includes("execution") || n.includes("fill"))
                              return { bg: t.greenBg,  fg: t.green,  border: t.green  };
  if (n.includes("new order"))return { bg: t.accentBg, fg: t.accent, border: t.accent };
  if (n.includes("logon") || n.includes("logout") || n.includes("heartbeat") || n.includes("test"))
                              return { bg: t.purpleBg, fg: t.purple, border: t.purple };
  return { bg: t.panelAlt, fg: t.textMuted, border: t.border };
}

function sectionOf(field, result) {
  if (result.components.header.some(f => f.stepIndex === field.stepIndex)) return "header";
  if (result.components.trailer.some(f => f.stepIndex === field.stepIndex)) return "trailer";
  return "body";
}

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

function calculateTimeDelta(currTimeStr, prevTimeStr) {
  if (!currTimeStr || !prevTimeStr) return null;
  try {
    // FIX timestamps are YYYYMMDD-HH:MM:SS[.sss]
    // Convert to ISO 8601 so Date can parse them correctly regardless of year or day boundary.
    const toMs = (s) => {
      // Handle both "YYYYMMDD-HH:MM:SS.sss" and legacy "HH:MM:SS.sss" (date-less) formats.
      const full = /^(\d{4})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(s);
      if (full) {
        const [, yr, mo, dy, h, m, sec, frac] = full;
        const ms = frac ? parseInt(frac.padEnd(3, "0").slice(0, 3)) : 0;
        return new Date(`${yr}-${mo}-${dy}T${h}:${m}:${sec}`).getTime() + ms;
      }
      // Fallback: time-only string (no date part) — use an arbitrary fixed date so
      // subtraction is still meaningful within the same trading day.
      const timeOnly = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(s);
      if (timeOnly) {
        const [, h, m, sec, frac] = timeOnly;
        const ms = frac ? parseInt(frac.padEnd(3, "0").slice(0, 3)) : 0;
        return new Date(`2000-01-01T${h}:${m}:${sec}`).getTime() + ms;
      }
      return NaN;
    };
    const diff = toMs(currTimeStr) - toMs(prevTimeStr);
    if (isNaN(diff) || diff < 0) return null;
    return diff < 1000 ? `+${diff}ms` : `+${(diff / 1000).toFixed(2)}s`;
  } catch (e) { return null; }
}

const POPULAR_TAGS = [
  [8,"BeginString"],[9,"BodyLength"],[35,"MsgType"],[49,"SenderCompID"],[56,"TargetCompID"],
  [11,"ClOrdID"],[55,"Symbol"],[54,"Side"],[38,"OrderQty"],[40,"OrdType"],[44,"Price"],
  [59,"TimeInForce"],[37,"OrderID"],[39,"OrdStatus"],[150,"ExecType"],[17,"ExecID"],
  [60,"TransactTime"],[41,"OrigClOrdID"],[99,"StopPx"],[10,"CheckSum"],
];

// ─── Primitive components ─────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, style = {}, t }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px", borderRadius: "6px", cursor: disabled ? "default" : "pointer",
        fontSize: "12px", fontWeight: 500,
        border: "1px solid " + (t ? t.border : "#30363d"),
        background: disabled ? (t ? t.panelAlt : "transparent") : (t ? t.panel : "#21262d"),
        color: disabled ? (t ? t.textFaint : "#484f58") : (t ? t.text : "#e6edf3"),
        transition: "border-color 0.15s, background 0.15s, color 0.15s",
        ...style,
      }}
      onMouseEnter={e => { if (!disabled && t) { e.currentTarget.style.borderColor = t.textMuted; e.currentTarget.style.background = t.panelAlt; } }}
      onMouseLeave={e => { if (!disabled && t) { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.background = t.panel; } }}
    >{children}</button>
  );
}

// ─── Order Execution Summary Visualizer ───────────────────────────────────────
function ExecutionSummaryVisualizer({ result, t }) {
  const isExecutionReport = result.msgType === "8";
  const isNewOrder = result.msgType === "D";
  const isCancel = result.msgType === "F" || result.msgType === "G" || result.msgType === "9";
  
  if (!isExecutionReport && !isNewOrder && !isCancel) return null;

  let currentStep = 0; 
  let statusText = result.msgTypeName;
  let color = t.accent;

  const fields = [...result.components.header, ...result.components.body, ...result.components.trailer];
  const ordStatusField = fields.find(f => f.tag === 39);
  const statusVal = ordStatusField ? ordStatusField.raw : "";

  if (statusVal === "0" || isNewOrder) { currentStep = 1; statusText = "New Order Active"; color = t.accent; }
  else if (statusVal === "1") { currentStep = 2; statusText = "Partially Filled"; color = t.yellow; }
  else if (statusVal === "2") { currentStep = 3; statusText = "Fully Filled!"; color = t.green; }
  else if (statusVal === "4" || statusVal === "8" || result.msgType === "9") { currentStep = 4; statusText = "Terminated (Canceled/Rejected)"; color = t.red; }

  const steps = [
    { label: "Placement", step: 0 },
    { label: "Acknowledged", step: 1 },
    { label: "Partial Fill", step: 2 },
    { label: "Fully Executed", step: 3 }
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.panelAlt, border: "1px solid " + t.border, padding: "12px 20px", borderRadius: "8px", marginBottom: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, color: t.textMuted, letterSpacing: "0.5px" }}>EXECUTION SUMMARY</span>
        <span style={{ fontSize: "15px", fontWeight: 700, color: color, marginTop: "2px" }}>{statusText}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        {steps.map((s, index) => {
          const active = currentStep >= s.step && currentStep !== 4;
          const isTerminated = currentStep === 4;
          return (
            <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", opacity: active || (isTerminated && index === 3) ? 1 : 0.35 }}>
              <div style={{
                width: "20px", height: "20px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700,
                background: isTerminated && index === 3 ? t.redBg : active ? t.greenBg : t.border,
                color: isTerminated && index === 3 ? t.red : active ? t.green : t.textMuted,
                border: "1px solid " + (isTerminated && index === 3 ? t.red : active ? t.green : "transparent")
              }}>
                {isTerminated && index === 3 ? "✕" : "✓"}
              </div>
              <span style={{ fontSize: "12px", fontWeight: 500, color: t.text }}>{isTerminated && index === 3 ? "Terminated" : s.label}</span>
              {index < steps.length - 1 && <span style={{ color: t.textFaint, marginLeft: "12px" }}>➔</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, loading, t, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: "8px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
        border: "none", cursor: disabled || loading ? "default" : "pointer",
        background: disabled || loading
          ? t.textFaint
          : `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`,
        color: "#fff",
        boxShadow: disabled || loading ? "none" : "0 2px 8px " + t.accent + "44",
        transition: "opacity 0.15s, transform 0.1s, box-shadow 0.15s",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={e => { if (!disabled && !loading) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px " + t.accent + "55"; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = disabled || loading ? "none" : "0 2px 8px " + t.accent + "44"; }}
    >{loading ? "⏳ Processing…" : children}</button>
  );
}

function Card({ children, t, style = {} }) {
  return (
    <div style={{
      background: t.panel,
      border: "1px solid " + t.border,
      borderRadius: "10px", overflow: "hidden",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      ...style,
    }}>{children}</div>
  );
}

function Badge({ text, t }) {
  const s = badgeFor(text, t);
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "20px",
      fontSize: "11px", fontWeight: 600, letterSpacing: "0.3px",
      background: s.bg, color: s.fg, border: "1px solid " + s.border, whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

function ValidationBanner({ result, t }) {
  const ok = result.isValid;
  const errors = result.validationErrors || [];
  return (
    <div style={{
      borderRadius: "10px", marginBottom: "14px", overflow: "hidden",
      border: "1px solid " + (ok ? t.green : t.red),
      background: ok ? t.greenBg : t.redBg,
    }}>
      {/* Main status row */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px" }}>
        <div style={{
          width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
          background: ok ? t.green : t.red,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "14px", fontWeight: 700, color: "#fff",
        }}>{ok ? "✓" : "✕"}</div>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: ok ? t.green : t.red }}>
            {ok ? "Valid Message" : `${errors.length} Validation Error${errors.length !== 1 ? "s" : ""}`}
          </div>
          <div style={{ fontSize: "11px", color: t.textMuted, marginTop: "1px" }}>{result.msgTypeName}</div>
        </div>
      </div>
      {/* Error list */}
      {!ok && errors.length > 0 && (
        <div style={{ borderTop: "1px solid " + t.red + "44", padding: "8px 16px 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {errors.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: t.red }}>
              <span style={{ flexShrink: 0, marginTop: "1px", opacity: 0.7 }}>›</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Anatomy Bar ──────────────────────────────────────────────────────────────
function ThemedAnatomyBar({ result, originalInput, stepIdx = null, onClickField = null, t }) {
  const [hoveredField, setHoveredField] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  let delim = "|";
  if (originalInput.includes("\x01")) delim = "\x01";
  else if (originalInput.includes(";")) delim = ";";
  else if (originalInput.includes("^") && !originalInput.includes("|")) delim = "^";
  const parts = originalInput.split(delim).filter(p => p.length > 0);
  const seq = result.sequence || [];

  const handleMouseMove = (e) => {
    setTooltipPos({ x: e.clientX + 14, y: e.clientY + 14 });
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        background: t.inputBg, border: "1px solid " + t.border, borderRadius: "8px",
        padding: "10px 12px",
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
        fontSize: "11px", lineHeight: "1.8", wordBreak: "break-all",
      }}>
        {parts.map((part, i) => {
          const field = seq[i];
          const section = field ? sectionOf(field, result) : "body";
          const sc = t.sections[section];
          const isCurrent = stepIdx !== null && i === stepIdx;
          return (
            <span key={i} 
              onClick={() => onClickField && onClickField(i)}
              onMouseEnter={() => field && setHoveredField(field)}
              onMouseLeave={() => setHoveredField(null)}
              onMouseMove={handleMouseMove}
              style={{
                display: "inline-block", padding: "2px 5px", marginRight: "2px", marginBottom: "3px",
                borderRadius: "4px", cursor: field ? "pointer" : "default",
                transition: "all 0.12s",
                background: isCurrent ? sc.border : sc.bg,
                color: isCurrent ? "#fff" : sc.text,
                fontWeight: isCurrent ? 700 : 500,
                border: "1px solid " + (isCurrent ? sc.border : sc.border + "44"),
                boxShadow: isCurrent ? "0 0 0 2px " + sc.border + "44" : "none",
              }}
            >{part}</span>
          );
        })}
      </div>

      {hoveredField && (
        <div style={{
          position: "fixed", top: tooltipPos.y, left: tooltipPos.x,
          background: t.header, border: "1px solid " + t.border,
          borderRadius: "8px", padding: "10px 14px",
          boxShadow: t.shadowMd, zIndex: 500, pointerEvents: "none",
          fontFamily: "system-ui, sans-serif", fontSize: "12px",
          minWidth: "220px", maxWidth: "300px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "#fff", background: t.accent, padding: "1px 7px", borderRadius: "4px" }}>Tag {hoveredField.tag}</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: t.text }}>{hoveredField.name}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <div style={{ fontSize: "11px", color: t.textMuted }}>Value: <code style={{ fontFamily: "monospace", color: t.green, background: t.greenBg, padding: "0 4px", borderRadius: "3px" }}>{hoveredField.raw}</code></div>
            {hoveredField.meaning && hoveredField.meaning !== hoveredField.raw && (
              <div style={{ fontSize: "11px", color: t.textMuted }}>Decoded: <span style={{ color: t.text, fontWeight: 500 }}>{hoveredField.meaning}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field Table ──────────────────────────────────────────────────────────────
// ─── Highlight matching text in a string ─────────────────────────────────────
function HighlightText({ text, query, t }) {
  if (!query || !text) return <>{text || ""}</>;
  const idx = String(text).toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return <>
    {String(text).slice(0, idx)}
    <mark style={{ background: "#fbbf2466", color: "inherit", borderRadius: "2px", padding: "0 1px" }}>
      {String(text).slice(idx, idx + query.length)}
    </mark>
    {String(text).slice(idx + query.length)}
  </>;
}
function FieldTable({ rows, sectionKey, t, onTagClick, filterText, isOpen, onToggle, sectionRef, isMobile }) {
  const sc = t.sections[sectionKey];
  if (!rows || rows.length === 0) return null;

  const filteredRows = rows.filter(r => {
    if (!filterText) return true;
    const txt = filterText.toLowerCase();
    return String(r.tag).includes(txt) || r.name.toLowerCase().includes(txt) || r.meaning.toLowerCase().includes(txt) || r.raw.toLowerCase().includes(txt);
  });

  if (filteredRows.length === 0) return null;

  const baseFields = [];
  const groupsMap = {};
  filteredRows.forEach(r => {
    if (r.groupIndex !== undefined && r.groupIndex !== -1) {
      if (!groupsMap[r.groupIndex]) groupsMap[r.groupIndex] = [];
      groupsMap[r.groupIndex].push(r);
    } else {
      baseFields.push(r);
    }
  });
  const groupKeys = Object.keys(groupsMap);

  const [copiedTag, setCopiedTag] = useState(null);
  const copyValue = (r) => {
    navigator.clipboard.writeText(r.raw || "").then(() => {
      setCopiedTag(r.tag);
      setTimeout(() => setCopiedTag(null), 1500);
    });
  };

  const renderRow = (r, key, lastInSection, rowIndex) => (
    <tr
      key={key}
      style={{ borderBottom: lastInSection ? "none" : "1px solid " + t.borderSub, background: rowIndex % 2 === 0 ? "transparent" : t.panelAlt + "88", transition: "background 0.08s" }}
      onMouseEnter={e => e.currentTarget.style.background = sc.border + "12"}
      onMouseLeave={e => e.currentTarget.style.background = rowIndex % 2 === 0 ? "transparent" : t.panelAlt + "88"}
    >
      <td style={{ padding: isMobile ? "5px 6px" : "6px 10px", whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: "ui-monospace,monospace", fontSize: "10px", fontWeight: 700, color: sc.border, background: sc.border + "1a", padding: isMobile ? "1px 5px" : "2px 7px", borderRadius: "4px" }}>{r.tag}</span>
      </td>
      <td style={{ padding: isMobile ? "5px 6px" : "6px 10px", fontSize: isMobile ? "11px" : "12px", color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <HighlightText text={r.name} query={filterText} t={t} />
        {r.isUnknownTag && <span style={{ fontSize: "9px", fontWeight: 700, color: t.red, background: t.redBg, padding: "1px 5px", borderRadius: "3px", marginLeft: "4px" }}>?</span>}
      </td>
      <td style={{ padding: isMobile ? "5px 6px" : "6px 10px", fontFamily: "ui-monospace,monospace", fontSize: "11px", color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.raw}</td>
      {!isMobile && <td style={{ padding: "6px 10px", fontSize: "12px", color: r.meaning && r.meaning !== r.raw ? t.text : t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: r.meaning && r.meaning !== r.raw ? 500 : 400 }}>
        <HighlightText text={r.meaning || "—"} query={filterText} t={t} />
      </td>}
      <td style={{ padding: isMobile ? "4px 3px" : "6px 6px", textAlign: "center", whiteSpace: "nowrap" }}>
        {/* Copy raw value */}
        <button
          onClick={() => copyValue(r)}
          title="Copy raw value"
          style={{ background: "none", border: "1px solid transparent", cursor: "pointer", fontSize: "10px", color: copiedTag === r.tag ? t.green : t.textFaint, padding: "2px 4px", borderRadius: "4px", transition: "all 0.1s", marginRight: "2px" }}
          onMouseEnter={e => { e.currentTarget.style.color = t.accent; e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.background = t.accentBg; }}
          onMouseLeave={e => { e.currentTarget.style.color = copiedTag === r.tag ? t.green : t.textFaint; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "none"; }}
        >{copiedTag === r.tag ? "✓" : "⎘"}</button>
        {/* Open tag reference */}
        <button
          onClick={() => onTagClick && onTagClick(r)}
          title={isMobile ? r.meaning || r.name : "Open tag reference"}
          style={{ background: "none", border: "1px solid transparent", cursor: "pointer", fontSize: "11px", color: t.textFaint, padding: "2px 4px", borderRadius: "4px", transition: "all 0.1s" }}
          onMouseEnter={e => { e.currentTarget.style.color = t.accent; e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.background = t.accentBg; }}
          onMouseLeave={e => { e.currentTarget.style.color = t.textFaint; e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "none"; }}
        >↗</button>
      </td>
    </tr>
  );

  const groupDivider = (gIdx) => (
    <tr key={"g-hdr-" + gIdx}>
      <td colSpan={5} style={{ padding: "5px 12px", background: t.purple + "12", borderTop: "1px solid " + t.border, borderBottom: "1px solid " + t.border, borderLeft: "3px solid " + t.purple }}>
        <span style={{ fontSize: "10px", fontWeight: 700, color: t.purple, letterSpacing: "0.5px" }}>REPEATING GROUP #{parseInt(gIdx) + 1}</span>
      </td>
    </tr>
  );

  return (
    <div ref={sectionRef} style={{ marginBottom: "10px", borderRadius: "8px", border: "1.5px solid " + (isOpen ? sc.border + "55" : t.border), overflow: "hidden", transition: "border-color 0.15s" }}>
      {/* ── Accordion header — minimal style ── */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px",
          background: "transparent",
          borderLeft: "3px solid " + (isOpen ? sc.border : t.borderSub),
          cursor: "pointer", userSelect: "none",
          transition: "border-color 0.15s, background 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = sc.border + "0a"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "3px", height: "16px", background: sc.border, borderRadius: "2px", flexShrink: 0 }} />
          <span style={{ fontSize: "11px", fontWeight: 600, color: isOpen ? sc.border : t.textMuted, letterSpacing: "0.3px", transition: "color 0.15s" }}>
            {sc.label.charAt(0) + sc.label.slice(1).toLowerCase()}
          </span>
          <span style={{
            fontSize: "10px", fontWeight: 600, padding: "1px 7px", borderRadius: "20px",
            background: isOpen ? sc.border + "18" : t.panelAlt,
            color: isOpen ? sc.border : t.textFaint,
            transition: "all 0.15s",
          }}>
            {filteredRows.length} field{filteredRows.length !== 1 ? "s" : ""}
          </span>
          {!isOpen && groupKeys.length > 0 && (
            <span style={{ fontSize: "10px", color: t.textFaint }}>· {groupKeys.length} group{groupKeys.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
          <path d="M3 5l4 4 4-4" stroke={isOpen ? sc.border : t.textFaint} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* ── Accordion body ── */}
      {isOpen && (
        <div style={{ background: t.panel }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: isMobile ? "42px" : "52px" }} />
              <col style={{ width: isMobile ? "auto" : "190px" }} />
              <col style={{ width: isMobile ? "90px" : "180px" }} />
              {!isMobile && <col />}
              <col style={{ width: "28px" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "1px solid " + t.border, background: sc.border + "0d", borderLeft: "3px solid " + sc.border }}>
                {(isMobile ? ["Tag", "Field Name", "Raw Value", ""] : ["Tag", "Field Name", "Raw Value", "Meaning", ""]).map((h, i) => (
                  <th key={i} style={{ padding: isMobile ? "5px 6px" : "6px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: i === 0 ? sc.border : t.textFaint, letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baseFields.map((r, i) => renderRow(r, "b" + i, i === baseFields.length - 1 && groupKeys.length === 0, i))}
              {groupKeys.map((gIdx) => {
                const fields = groupsMap[gIdx];
                return [groupDivider(gIdx), ...fields.map((r, i) => renderRow(r, "g" + gIdx + "-" + i, i === fields.length - 1, i))];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── FieldSections — sticky jump bar + three accordion FieldTables ────────────
function FieldSections({ result, t, onTagClick, filterText, isMobile }) {
  const SECTIONS = ["header", "body", "trailer"];
  const [openMap, setOpenMap] = useState({ header: true, body: true, trailer: true });
  const headerRef = useRef(null);
  const bodyRef = useRef(null);
  const trailerRef = useRef(null);
  const refs = { header: headerRef, body: bodyRef, trailer: trailerRef };

  const toggle = (key) => setOpenMap(prev => ({ ...prev, [key]: !prev[key] }));

  // Jump bar button: if already open → just scroll; if closed → open then scroll
  const jumpTo = (key) => {
    if (!openMap[key]) {
      setOpenMap(prev => ({ ...prev, [key]: true }));
      setTimeout(() => refs[key].current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } else {
      refs[key].current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const hasRows = (key) => result.components[key] && result.components[key].length > 0;
  const anyOpen = SECTIONS.some(k => openMap[k]);

  return (
    <div>
      {/* ── Sticky jump + toggle bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: isMobile ? "5px" : "8px",
        padding: "6px 0", marginBottom: "10px",
        position: "sticky", top: 0, zIndex: 10,
        background: t.page,
        borderBottom: "1px solid " + t.borderSub,
        overflow: "hidden",
      }}>
        {!isMobile && <span style={{ fontSize: "10px", fontWeight: 600, color: t.textFaint, marginRight: "4px", letterSpacing: "0.6px", whiteSpace: "nowrap" }}>JUMP TO</span>}

        {SECTIONS.map(key => {
          if (!hasRows(key)) return null;
          const sc = t.sections[key];
          const count = (result.components[key] || []).length;
          const open = openMap[key];

          // Section icon
          const icon = key === "header" ? "⬡" : key === "body" ? "⬢" : "◈";

          return (
            <div key={key} style={{
              display: "flex", alignItems: "stretch",
              borderRadius: "8px",
              border: "1.5px solid " + (open ? sc.border : t.border),
              overflow: "hidden", flexShrink: 0,
              boxShadow: open ? "0 0 0 3px " + sc.border + "20" : "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
              height: isMobile ? "26px" : "30px",
            }}>
              {/* Main pill: icon + label + count — click scrolls to section */}
              <button
                onClick={() => jumpTo(key)}
                title={"Jump to " + sc.label}
                style={{
                  display: "flex", alignItems: "center", gap: isMobile ? "3px" : "5px",
                  padding: isMobile ? "0 6px" : "0 10px",
                  background: open ? sc.border : "transparent",
                  color: open ? "#fff" : sc.border,
                  border: "none", cursor: "pointer",
                  fontSize: isMobile ? "10px" : "11px", fontWeight: 700, letterSpacing: "0.3px",
                  transition: "background 0.15s, color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: isMobile ? "10px" : "12px" }}>{icon}</span>
                {isMobile ? sc.label.slice(0, 3) : sc.label}
                <span style={{
                  fontSize: "10px", fontWeight: 800,
                  padding: "0px 5px", borderRadius: "10px",
                  background: open ? "rgba(255,255,255,0.22)" : sc.border + "1a",
                  color: open ? "#fff" : sc.border,
                  minWidth: "16px", textAlign: "center",
                  lineHeight: "16px",
                  transition: "all 0.15s",
                }}>{count}</span>
              </button>

              {/* Divider */}
              <div style={{
                width: "1px", alignSelf: "stretch",
                background: open ? "rgba(255,255,255,0.2)" : t.border,
                flexShrink: 0,
              }} />

              {/* Chevron — click toggles open/close */}
              <button
                onClick={() => toggle(key)}
                title={open ? "Collapse " + sc.label : "Expand " + sc.label}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: isMobile ? "22px" : "26px",
                  background: open ? sc.border + "cc" : "transparent",
                  color: open ? "#fff" : sc.border,
                  border: "none", cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                  flexShrink: 0,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none"
                  style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
                  <path d="M1.5 3l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          );
        })}

        {/* Collapse / Expand all */}
        <button
          onClick={() => setOpenMap({ header: !anyOpen, body: !anyOpen, trailer: !anyOpen })}
          style={{
            marginLeft: "auto", flexShrink: 0, fontSize: "10px", fontWeight: 500,
            padding: isMobile ? "3px 6px" : "4px 10px", borderRadius: "6px",
            border: "1px solid " + t.border,
            background: "transparent", color: t.textFaint,
            cursor: "pointer", whiteSpace: "nowrap",
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = t.text; e.currentTarget.style.borderColor = t.textMuted; }}
          onMouseLeave={e => { e.currentTarget.style.color = t.textFaint; e.currentTarget.style.borderColor = t.border; }}
        >
          {anyOpen ? (isMobile ? "↑" : "↑ Collapse all") : (isMobile ? "↓" : "↓ Expand all")}
        </button>
      </div>

      {SECTIONS.map(key => (
        <FieldTable
          key={key}
          rows={result.components[key]}
          sectionKey={key}
          t={t}
          onTagClick={onTagClick}
          filterText={filterText}
          isOpen={openMap[key]}
          onToggle={() => toggle(key)}
          sectionRef={refs[key]}
          isMobile={isMobile}
        />
      ))}
    </div>
  );
}

// ─── Walkthrough ──────────────────────────────────────────────────────────────
const SPEEDS = { slow: 3000, normal: 1800, fast: 800 };

function Walkthrough({ result, originalInput, t }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [fade, setFade] = useState(true);
  const timer = useRef(null);
  const seq = result.sequence || [];
  const cur = seq[step];
  const sec = cur ? sectionOf(cur, result) : "body";
  const sc = t.sections[sec];

  useEffect(() => {
    setFade(false);
    const id = setTimeout(() => setFade(true), 40);
    return () => clearTimeout(id);
  }, [step]);

  useEffect(() => {
    if (playing) {
      timer.current = setInterval(() => {
        setStep(s => { if (s >= seq.length - 1) { setPlaying(false); return s; } return s + 1; });
      }, SPEEDS[speed]);
    } else clearInterval(timer.current);
    return () => clearInterval(timer.current);
  }, [playing, speed, seq.length]);

  if (!cur) return null;

  return (
    <div>
      <ThemedAnatomyBar result={result} originalInput={originalInput} stepIdx={step} onClickField={i => { setPlaying(false); setStep(i); }} t={t} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
        <span style={{ fontSize: "12px", color: t.textMuted }}>
          Field <strong style={{ color: t.text }}>{step + 1}</strong> of {seq.length}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <select value={speed} onChange={e => setSpeed(e.target.value)} style={{
            padding: "4px 8px", borderRadius: "6px", fontSize: "12px",
            border: "1px solid " + t.border, background: t.panel, color: t.text,
          }}>
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
          <Btn onClick={() => { if (step >= seq.length - 1) setStep(0); setPlaying(p => !p); }}
            style={{ background: playing ? t.red : t.green, color: "#fff", border: "none" }} t={t}>
            {playing ? "⏸" : "▶"}
          </Btn>
          <Btn onClick={() => { setPlaying(false); setStep(s => Math.max(s - 1, 0)); }} disabled={step === 0} t={t}>←</Btn>
          <Btn onClick={() => { setPlaying(false); setStep(s => Math.min(s + 1, seq.length - 1)); }} disabled={step === seq.length - 1} t={t}>→</Btn>
        </div>
      </div>

      <div style={{ height: "3px", background: t.border, borderRadius: "2px", marginBottom: "16px" }}>
        <div style={{ height: "100%", borderRadius: "2px", background: sc.border, width: ((step + 1) / seq.length) * 100 + "%", transition: "width 0.3s ease" }} />
      </div>

      <div style={{
        border: "1px solid " + sc.border, borderRadius: "10px", padding: "20px",
        background: sc.bg, opacity: fade ? 1 : 0,
        transform: fade ? "translateY(0)" : "translateY(4px)", transition: "opacity 0.2s, transform 0.2s",
      }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: sc.border, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
          {sc.label} SECTION{cur.isGroupStart ? " · ENTRY #" + (cur.groupIndex + 1) : ""}
        </div>
        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "2px" }}>TAG</div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "32px", fontWeight: 700, color: t.text }}>{cur.tag}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "2px" }}>FIELD NAME</div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: t.text }}>{cur.name}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "4px" }}>RAW VALUE</div>
            <code style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "16px", color: sc.text, background: "transparent" }}>{cur.raw}</code>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "4px" }}>MEANING</div>
            <span style={{ fontSize: "16px", color: t.text, fontWeight: 500 }}>{cur.meaning}</span>
          </div>
        </div>
        <div style={{ borderLeft: "3px solid " + sc.border, paddingLeft: "12px", padding: "10px 14px", background: t.panelAlt, borderRadius: "0 8px 8px 0", marginBottom: "10px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: sc.border, letterSpacing: "0.8px", marginBottom: "4px" }}>WHY THIS MATTERS</div>
          <div style={{ fontSize: "13px", color: t.textMuted, lineHeight: 1.6 }}>{cur.why}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Tag Panel ───────────────────────────────────────────────────────────────
// Slide-in drawer component for looking up extensive tag definitions
function TagPanel({ field, onClose, t, isMobile }) {
  if (!field) return null;

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const badge = badgeFor(field.name, t);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 199, background: isMobile ? "rgba(0,0,0,0.5)" : "transparent" }} />
      <div style={{
        position: "fixed",
        top: isMobile ? "auto" : 0,
        bottom: isMobile ? 0 : "auto",
        right: 0,
        left: isMobile ? 0 : "auto",
        width: isMobile ? "100%" : "360px",
        maxHeight: isMobile ? "85vh" : "100vh",
        background: t.panel, borderLeft: isMobile ? "none" : "1px solid " + t.border,
        borderTop: isMobile ? "1px solid " + t.border : "none",
        borderRadius: isMobile ? "16px 16px 0 0" : "0",
        boxShadow: isMobile ? "0 -4px 24px rgba(0,0,0,0.3)" : "-4px 0 24px rgba(0,0,0,0.25)",
        zIndex: 200, display: "flex", flexDirection: "column",
        animation: isMobile ? "slideUp 0.22s cubic-bezier(0.22,1,0.36,1)" : "slideIn 0.2s cubic-bezier(0.22,1,0.36,1)",
      }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(48px); opacity:0; } to { transform:none; opacity:1; } }
          @keyframes slideUp { from { transform: translateY(60px); opacity:0; } to { transform:none; opacity:1; } }
        `}</style>

        {/* Mobile drag handle */}
        {isMobile && <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: t.border, margin: "10px auto 4px" }} />}

        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid " + t.border,
          background: "linear-gradient(180deg, " + t.panelAlt + ", " + t.panel + ")",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: t.textFaint, letterSpacing: "0.6px" }}>TAG REFERENCE</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid " + t.border, background: "transparent", cursor: "pointer", color: t.textMuted, fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.background = t.redBg; e.currentTarget.style.color = t.red; e.currentTarget.style.borderColor = t.red; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.textMuted; e.currentTarget.style.borderColor = t.border; }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px" }}>

          {/* Tag number + name hero */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div style={{
                fontFamily: "monospace", fontSize: isMobile ? "28px" : "36px", fontWeight: 800,
                color: t.accent, lineHeight: 1,
                background: t.accentBg, padding: "6px 12px", borderRadius: "8px",
                border: "1px solid " + t.accent + "33", flexShrink: 0,
              }}>{field.tag}</div>
              <div style={{ paddingTop: "4px" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: t.text, lineHeight: 1.2, marginBottom: "6px" }}>{field.name}</div>
                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: badge.bg, color: badge.fg, border: "0.5px solid " + badge.border }}>{field.name}</span>
              </div>
            </div>
          </div>

          {/* Why this matters */}
          {field.why && (
            <div style={{ borderLeft: "3px solid " + t.accent, padding: "10px 14px", background: t.accentBg, borderRadius: "0 8px 8px 0", marginBottom: "16px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: t.accent, letterSpacing: "0.5px", marginBottom: "4px" }}>WHY THIS MATTERS</div>
              <div style={{ fontSize: "12px", color: t.textMuted, lineHeight: 1.5 }}>{field.why}</div>
            </div>
          )}

          {/* Raw value */}
          {field.raw !== undefined && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: t.textFaint, letterSpacing: "0.5px", marginBottom: "6px" }}>RAW VALUE</div>
              <div style={{ fontFamily: "monospace", fontSize: "13px", color: t.text, background: t.inputBg, padding: "8px 12px", borderRadius: "6px", border: "1px solid " + t.border, wordBreak: "break-all" }}>
                {field.raw || <span style={{ color: t.textFaint, fontStyle: "italic" }}>empty</span>}
              </div>
            </div>
          )}

          {/* Decoded meaning */}
          {field.meaning && field.meaning !== field.raw && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, color: t.textFaint, letterSpacing: "0.5px", marginBottom: "6px" }}>DECODED MEANING</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: t.green, background: t.greenBg, padding: "8px 12px", borderRadius: "6px", border: "1px solid " + t.green + "33" }}>
                {field.meaning}
              </div>
            </div>
          )}

          {/* FIX dictionary link */}
          {field.referenceUrl && (
            <a
              href={field.referenceUrl} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "12px", color: t.accent, textDecoration: "none", padding: "6px 12px", borderRadius: "6px", border: "1px solid " + t.accent + "44", background: t.accentBg, transition: "all 0.12s" }}
              onMouseEnter={e => { e.currentTarget.style.background = t.accent; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = t.accentBg; e.currentTarget.style.color = t.accent; }}
            >
              View FIX dictionary ↗
            </a>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Header Tag Search ────────────────────────────────────────────────────────
function HeaderTagSearch({ t, onResult, isMobile }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const doSearch = useCallback(async (tagNum) => {
    if (!/^\d+$/.test(String(tagNum).trim())) return;
    setLoading(true); setError(null);
    try {
      const syn = "8=FIX.4.4|9=10|35=0|" + tagNum + "=X|10=000|";
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: syn });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      const f = d.sequence ? d.sequence.find(f => String(f.tag) === String(tagNum)) : null;
      if (f) { onResult(f); setQuery(""); }
      else setError("Tag " + tagNum + " not found");
    } catch {
      setError("Backend unavailable — may be cold-starting (~30s)");
    } finally { setLoading(false); }
  }, [onResult]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: "10px", fontSize: "12px", color: t.textFaint }}>⌗</span>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === "Enter") doSearch(query); }}
            placeholder={isMobile ? "#…" : "Tag lookup…"}
            style={{ paddingLeft: "28px", height: "32px", borderRadius: "6px", fontSize: "16px", width: isMobile ? "72px" : "140px", border: "1px solid " + (error ? t.red : t.border), background: t.inputBg, color: t.text, outline: "none" }}
          />
        </div>
        <button
          onClick={() => doSearch(query)}
          disabled={loading}
          style={{ height: "32px", padding: isMobile ? "0 8px" : "0 12px", borderRadius: "6px", fontSize: "12px", background: t.accentBg, color: t.accent, border: "1px solid " + t.accent, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1, whiteSpace: "nowrap" }}
        >
          {loading ? "…" : isMobile ? "↗" : "Look up"}
        </button>
      </div>
      {error && <div style={{ fontSize: "10px", color: t.red, maxWidth: "220px", textAlign: "right" }}>{error}</div>}
    </div>
  );
}

// ─── Single Message Result ────────────────────────────────────────────────────
function SingleResult({ result, originalInput, t, onTagClick, filterRef, tableFilter, setTableFilter, isMobile }) {
  const [subView, setSubView] = useState("table");

  return (
    <div style={{ marginTop: "20px" }}>
      <ThemedAnatomyBar result={result} originalInput={originalInput} t={t} />

      <div style={{ display: "flex", gap: "8px", margin: "12px 0", flexWrap: "wrap" }}>
        {[
          ["Delimiter", result.delimiterDetected === "^" ? "SOH" : result.delimiterDetected],
          ["Fields",    result.totalFields],
          ["Checksum",  result.checksum.actual + " (calc " + result.checksum.calculated + ")"],
          ["Body len",  result.bodyLength.actual + " (calc " + result.bodyLength.calculated + ")"],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: "7px 10px", background: t.panel, border: "1px solid " + t.border, borderRadius: "7px", flex: "1 1 130px", minWidth: 0 }}>
            <div style={{ fontSize: "10px", color: t.textMuted }}>{k.toUpperCase()}</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: t.text, fontFamily: "monospace" }}>{v}</div>
          </div>
        ))}
      </div>

      <ValidationBanner result={result} t={t} />
      <ExecutionSummaryVisualizer result={result} t={t} />

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: "8px", marginBottom: "12px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["table", "walkthrough"].map(v => (
            <button key={v} onClick={() => setSubView(v)} style={{ padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: subView === v ? 600 : 400, border: "1.5px solid " + (subView === v ? t.accent : t.border), background: subView === v ? t.accentBg : "transparent", color: subView === v ? t.accent : t.textMuted, cursor: "pointer", transition: "all 0.12s", flex: isMobile ? 1 : "none", textAlign: "center" }}>{v === "table" ? "⊞ Table" : "▶ Walkthrough"}</button>
          ))}
        </div>
        {subView === "table" && (
          <input ref={filterRef} type="text" value={tableFilter} onChange={e => setTableFilter(e.target.value)} placeholder={isMobile ? "Filter fields…" : "🔍 Filter fields… (Press '/' to focus)"} style={{ width: "100%", maxWidth: isMobile ? "none" : "340px", height: "32px", padding: "0 10px", borderRadius: "6px", fontSize: "16px", border: "1px solid " + t.border, background: t.inputBg, color: t.text, outline: "none" }} />
        )}
      </div>

      {subView === "table" ? (
        <FieldSections result={result} t={t} onTagClick={onTagClick} filterText={tableFilter} isMobile={isMobile} />
      ) : (
        <Walkthrough result={result} originalInput={originalInput} t={t} />
      )}
    </div>
  );
}

// ─── Order Lifecycle View ─────────────────────────────────────────────────────
const EXEC_TYPE_LABEL = {
  "0": "New", "1": "Partial Fill", "2": "Fill", "3": "Done for Day",
  "4": "Canceled", "5": "Replaced", "6": "Pending Cancel",
  "7": "Stopped", "8": "Rejected", "9": "Suspended",
  "A": "Pending New", "B": "Calculated", "C": "Expired",
  "D": "Restated", "E": "Pending Replace", "F": "Trade",
  "G": "Trade Correct", "H": "Trade Cancel", "I": "Order Status",
};
const ORD_STATUS_LABEL = {
  "0":"New","1":"Partially Filled","2":"Filled","3":"Done for Day",
  "4":"Canceled","5":"Replaced","6":"Pending Cancel","7":"Stopped",
  "8":"Rejected","9":"Suspended","A":"Pending New","B":"Calculated",
  "C":"Expired","D":"Accepted for Bidding","E":"Pending Replace",
};
const STATUS_COLOR = (s, t) => {
  if (["2","F"].includes(s)) return t.green;
  if (["4","8","C"].includes(s)) return t.red;
  if (["1","E","6"].includes(s)) return t.yellow;
  return t.accent;
};

function OrderLifecycleView({ messages, t, onSelectMessage }) {
  // Panel closed by default — user opens when needed
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedChains, setExpandedChains] = useState(new Set());

  const toggleChain = (key) => setExpandedChains(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const chains = useMemo(() => {
    const idMap = buildRelatedIdMap(messages);
    const groups = {};
    messages.forEach((m, i) => {
      if (!m.clOrdID && !["New Order Single","Execution Report","Order Cancel Request","Order Cancel/Replace Request","Order Cancel Reject"].includes(m.msgTypeName)) return;
      const key = m.clOrdID ? idMap[m.clOrdID] : null;
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...m, _oi: i });
    });
    return Object.entries(groups).map(([key, msgs]) => {
      msgs.sort((a, b) => a._oi - b._oi);
      const symbol   = msgs.find(m => m.symbol)?.symbol || "—";
      const side     = msgs.find(m => m.side)?.side;
      const sideLabel = side === "1" ? "Buy" : side === "2" ? "Sell" : side || "";
      const qty      = msgs.find(m => m.orderQty)?.orderQty || "";
      const price    = msgs.find(m => m.price)?.price || "";
      const last     = msgs[msgs.length - 1];
      const finalStatus = last.ordStatus || last.execType || null;
      return { key, msgs, symbol, sideLabel, qty, price, finalStatus, first: msgs[0], last };
    }).sort((a, b) => a.first._oi - b.first._oi);
  }, [messages]);

  if (chains.length === 0) return null;

  const toMs = (s) => {
    if (!s) return NaN;
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(s);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime() + (m[7] ? parseInt(m[7].padEnd(3,"0").slice(0,3)) : 0);
    return NaN;
  };

  // Filled/cancelled/rejected are terminal
  const isTerminal = (s) => ["2","4","8","C"].includes(s);

  const filledCount  = chains.filter(c => c.finalStatus === "2").length;
  const cancelCount  = chains.filter(c => ["4","8","C"].includes(c.finalStatus)).length;
  const pendingCount = chains.length - filledCount - cancelCount;

  return (
    <div style={{ marginBottom: "16px", border: "1px solid " + t.border, borderRadius: "10px", overflow: "hidden", background: t.panel }}>

      {/* ── Outer header — always visible, click to collapse/expand panel ── */}
      <div
        onClick={() => setPanelOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px", background: t.panelAlt, cursor: "pointer", userSelect: "none", borderBottom: panelOpen ? "1px solid " + t.border : "none" }}
        onMouseEnter={e => e.currentTarget.style.background = t.page}
        onMouseLeave={e => e.currentTarget.style.background = t.panelAlt}
      >
        {/* Title */}
        <span style={{ fontSize: "11px", fontWeight: 700, color: t.textMuted, letterSpacing: "0.3px", whiteSpace: "nowrap" }}>ORDER LIFECYCLE</span>

        {/* Summary chips — always visible even when closed */}
        <span style={{ fontSize: "10px", padding: "1px 8px", borderRadius: "20px", background: t.accentBg, color: t.accent, border: "0.5px solid " + t.accent, fontWeight: 600 }}>{chains.length} order{chains.length !== 1 ? "s" : ""}</span>
        {filledCount  > 0 && <span style={{ fontSize: "10px", padding: "1px 8px", borderRadius: "20px", background: t.greenBg,  color: t.green,  border: "0.5px solid " + t.green  }}>✓ {filledCount} filled</span>}
        {cancelCount  > 0 && <span style={{ fontSize: "10px", padding: "1px 8px", borderRadius: "20px", background: t.redBg,    color: t.red,    border: "0.5px solid " + t.red    }}>✕ {cancelCount} cancelled</span>}
        {pendingCount > 0 && <span style={{ fontSize: "10px", padding: "1px 8px", borderRadius: "20px", background: t.yellowBg, color: t.yellow, border: "0.5px solid " + t.yellow }}>⏳ {pendingCount} pending</span>}

        <div style={{ flex: 1 }} />

        {/* Expand all / collapse all — only when panel is open */}
        {panelOpen && (
          <button
            onClick={e => { e.stopPropagation(); expandedChains.size > 0 ? setExpandedChains(new Set()) : setExpandedChains(new Set(chains.map(c => c.key))); }}
            style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "6px", border: "1px solid " + t.border, background: "transparent", color: t.textFaint, cursor: "pointer" }}
          >{expandedChains.size > 0 ? "Collapse all" : "Expand all"}</button>
        )}

        {/* Panel chevron */}
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transition: "transform 0.2s", transform: panelOpen ? "rotate(180deg)" : "none", flexShrink: 0 }}>
          <path d="M2 4.5l4.5 4.5 4.5-4.5" stroke={t.textFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* ── Panel body — hidden when closed ── */}
      {panelOpen && (
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {chains.map(({ key, msgs, symbol, sideLabel, qty, price, finalStatus }) => {
            const isExp        = expandedChains.has(key);
            const statusColor  = finalStatus ? STATUS_COLOR(finalStatus, t) : t.textFaint;
            const statusLabel  = ORD_STATUS_LABEL[finalStatus] || EXEC_TYPE_LABEL[finalStatus] || finalStatus || "In Progress";
            const terminal     = isTerminal(finalStatus);

            return (
              <div key={key} style={{ border: "1px solid " + (isExp ? t.accent + "55" : t.border), borderRadius: "8px", overflow: "hidden", transition: "border-color 0.15s" }}>

                {/* ── Chain summary row ── */}
                <div
                  onClick={() => toggleChain(key)}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px", cursor: "pointer", background: isExp ? t.accentBg + "66" : "transparent", transition: "background 0.12s" }}
                  onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = t.panelAlt; }}
                  onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Glowing status dot */}
                  <div style={{ position: "relative", width: "10px", height: "10px", flexShrink: 0 }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: statusColor, opacity: 0.3, transform: "scale(1.8)" }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: statusColor }} />
                  </div>

                  {/* Symbol */}
                  <span style={{ fontSize: "13px", fontWeight: 700, color: t.text, minWidth: "55px" }}>{symbol}</span>

                  {/* Side badge */}
                  {sideLabel && (
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 8px", borderRadius: "20px", background: sideLabel === "Buy" ? t.accentBg : t.redBg, color: sideLabel === "Buy" ? t.accent : t.red, border: "0.5px solid " + (sideLabel === "Buy" ? t.accent : t.red) }}>{sideLabel}</span>
                  )}

                  {/* Qty @ Price */}
                  {qty   && <span style={{ fontSize: "11px", color: t.textMuted }}>Qty <b style={{ color: t.text }}>{qty}</b></span>}
                  {price && <span style={{ fontSize: "11px", color: t.textMuted }}>@ <b style={{ color: t.text }}>{price}</b></span>}

                  <div style={{ flex: 1 }} />

                  {/* Mini step track — colored squares showing message sequence */}
                  <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                    {msgs.map((m, i) => {
                      const b = badgeFor(m.msgTypeName, t);
                      const isLast = i === msgs.length - 1;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                          <div title={m.msgTypeName} style={{ width: isLast ? "10px" : "8px", height: isLast ? "10px" : "8px", borderRadius: isLast ? "50%" : "2px", background: b.border, border: isLast ? "2px solid " + statusColor : "none", flexShrink: 0 }} />
                          {i < msgs.length - 1 && <div style={{ width: "8px", height: "1px", background: t.borderSub }} />}
                        </div>
                      );
                    })}
                    {msgs.length > 10 && <span style={{ fontSize: "9px", color: t.textFaint, marginLeft: "2px" }}>+{msgs.length - 10}</span>}
                  </div>

                  {/* Status label */}
                  <span style={{ fontSize: "11px", fontWeight: 700, color: statusColor, minWidth: "80px", textAlign: "right" }}>{statusLabel}</span>

                  {/* Msg count */}
                  <span style={{ fontSize: "10px", color: t.textFaint, minWidth: "40px", textAlign: "right" }}>{msgs.length} msg</span>

                  {/* Row chevron */}
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ transition: "transform 0.18s", transform: isExp ? "rotate(180deg)" : "none", flexShrink: 0 }}>
                    <path d="M2 4l3.5 3.5L9 4" stroke={t.textFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* ── Expanded step timeline ── */}
                {isExp && (
                  <div style={{ borderTop: "1px solid " + t.borderSub, padding: "12px 14px 14px 14px" }}>
                    <div style={{ display: "flex", gap: "0" }}>
                      {/* Left rail */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginRight: "12px", flexShrink: 0 }}>
                        {msgs.map((m, i) => {
                          const b = badgeFor(m.msgTypeName, t);
                          const isLast = i === msgs.length - 1;
                          return (
                            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                              {/* Connector line above dot (except first) */}
                              {i > 0 && <div style={{ width: "2px", height: "18px", background: terminal && isLast ? t.red + "66" : t.border }} />}
                              {/* Dot */}
                              <div style={{
                                width: "12px", height: "12px", borderRadius: "50%", flexShrink: 0,
                                background: isLast ? statusColor : b.border,
                                border: "2px solid " + (isLast ? statusColor : b.border),
                                boxShadow: isLast ? "0 0 6px " + statusColor + "88" : "none",
                                zIndex: 1,
                              }} />
                              {/* Connector line below dot (except last) */}
                              {!isLast && <div style={{ width: "2px", flex: 1, minHeight: "18px", background: t.border }} />}
                            </div>
                          );
                        })}
                      </div>

                      {/* Right content */}
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0" }}>
                        {msgs.map((m, i) => {
                          const b = badgeFor(m.msgTypeName, t);
                          const isLast = i === msgs.length - 1;
                          const prev = msgs[i - 1];
                          const dtMs = prev ? toMs(m.sendingTime) - toMs(prev.sendingTime) : null;
                          const dtLabel = dtMs !== null && !isNaN(dtMs) && dtMs >= 0
                            ? (dtMs < 1000 ? `+${dtMs}ms` : `+${(dtMs/1000).toFixed(2)}s`) : null;
                          const execLabel   = m.execType  ? (EXEC_TYPE_LABEL[m.execType]   || m.execType)  : null;
                          const statusLbl   = m.ordStatus ? (ORD_STATUS_LABEL[m.ordStatus] || m.ordStatus) : null;
                          const sColor      = m.ordStatus ? STATUS_COLOR(m.ordStatus, t) : b.border;
                          const timeStr     = m.sendingTime ? (m.sendingTime.split("-")[1] || m.sendingTime) : "";

                          return (
                            <div key={i} style={{ minHeight: i < msgs.length - 1 ? "50px" : "auto" }}>
                              {/* Delay badge between steps */}
                              {dtLabel && i > 0 && (
                                <div style={{ fontSize: "9px", color: t.purple, fontFamily: "monospace", padding: "2px 0 2px 2px", height: "18px", display: "flex", alignItems: "center" }}>{dtLabel}</div>
                              )}
                              {/* Step card */}
                              <div
                                onClick={() => onSelectMessage && onSelectMessage(m._oi)}
                                style={{ padding: "7px 10px", borderRadius: "6px", cursor: "pointer", border: "1px solid transparent", marginBottom: "0", background: isLast ? statusColor + "11" : "transparent", transition: "all 0.1s" }}
                                onMouseEnter={e => { e.currentTarget.style.background = t.panelAlt; e.currentTarget.style.borderColor = t.border; }}
                                onMouseLeave={e => { e.currentTarget.style.background = isLast ? statusColor + "11" : "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "20px", background: b.bg, color: b.fg, border: "0.5px solid " + b.border }}>{m.msgTypeName || m.msgType}</span>
                                  {execLabel && <span style={{ fontSize: "10px", color: t.textMuted }}>ExecType: <b style={{ color: t.text }}>{execLabel}</b></span>}
                                  {statusLbl && <span style={{ fontSize: "10px", fontWeight: 600, color: sColor }}>{statusLbl}</span>}
                                  {m.lastQty && <span style={{ fontSize: "10px", color: t.textMuted }}>Filled: <b style={{ color: t.green }}>{m.lastQty}</b></span>}
                                  {m.lastPx  && <span style={{ fontSize: "10px", color: t.textMuted }}>@ <b style={{ color: t.text }}>{m.lastPx}</b></span>}
                                  <span style={{ marginLeft: "auto", fontSize: "9px", color: t.textFaint, fontFamily: "monospace" }}>{timeStr}</span>
                                </div>
                                {m.summary && <div style={{ fontSize: "11px", color: t.textMuted, marginTop: "3px" }}>{m.summary}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



function abbrevMsgType(msgTypeName, msgType) {
  const map = {
    "New Order Single":                  "NOS",
    "Execution Report":                  "ExecRpt",
    "Order Cancel Request":              "CxlReq",
    "Order Cancel/Replace Request":      "Cxl/Rep",
    "Order Cancel Reject":               "CxlRej",
    "Logon":                             "Logon",
    "Logout":                            "Logout",
    "Heartbeat":                         "HB",
    "Test Request":                      "TestReq",
    "Resend Request":                    "Resend",
    "Sequence Reset":                    "SeqRst",
    "Reject":                            "Reject",
    "Business Message Reject":           "BizRej",
    "New Order List":                    "NOL",
    "Market Data Request":               "MDReq",
    "Market Data Snapshot/Full Refresh": "MD-Full",
    "Market Data Incremental Refresh":   "MD-Incr",
    "Market Data Request Reject":        "MD-Rej",
    "Quote Request":                     "QuoteReq",
    "Quote":                             "Quote",
    "Allocation Instruction":            "Alloc",
    "Allocation Instruction Ack":        "AllocAck",
    "Trade Capture Report":              "TrdCapt",
    "Order Mass Status Request":         "MassStat",
  };
  return map[msgTypeName] || msgTypeName || msgType || "?";
}

// ─── Session / Log Result ────────────────────────────────────────────────────
function SessionResult({ messages, t, onTagClick, filterRef, tableFilter, setTableFilter, isMobile }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailMode, setDetailMode] = useState("table");
  const [logFilter, setLogFilter] = useState("");
  const [spikeMs, setSpikeMs] = useState(500); // latency spike threshold in ms
  const tableRef = useRef(null);

  const idMap = buildRelatedIdMap(messages);
  const sel = messages[selectedIdx] || null;
  const selGroupKey = sel && sel.clOrdID ? idMap[sel.clOrdID] : null;

  // Pre-build O(1) index lookup — avoids indexOf per row during render
  const originalIndexMap = useMemo(() => new Map(messages.map((m, i) => [m, i])), [messages]);

  const filterLower = logFilter.trim().toLowerCase();
  const filteredMessages = (filterLower
    ? messages.filter(m =>
        abbrevMsgType(m.msgTypeName, m.msgType).toLowerCase().includes(filterLower) ||
        (m.msgTypeName || "").toLowerCase().includes(filterLower) ||
        (m.summary || "").toLowerCase().includes(filterLower) ||
        (m.senderCompID || "").toLowerCase().includes(filterLower) ||
        (m.targetCompID || "").toLowerCase().includes(filterLower)
      )
    : messages
  ).map(m => ({ ...m, _oi: originalIndexMap.get(m) ?? 0 }));

  // Arrow key navigation — J/K or ↑/↓
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, messages.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [messages.length]);

  // Scroll selected row into view when navigating with keyboard
  useEffect(() => {
    if (!tableRef.current) return;
    const row = tableRef.current.querySelector(`tr[data-idx="${selectedIdx}"]`);
    if (row) row.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const dtColor = (deltaStr) => {
    if (!deltaStr || deltaStr === "—") return t.purple;
    const ms = deltaStr.includes("s") && !deltaStr.includes("ms")
      ? parseFloat(deltaStr) * 1000
      : parseFloat(deltaStr);
    if (ms >= spikeMs) return t.red;
    if (ms >= spikeMs / 2) return t.yellow;
    return t.purple;
  };

  const cellBase = {
    padding: "5px 6px",
    fontSize: "11px",
    verticalAlign: "middle",
    borderBottom: "1px solid " + t.borderSub,
  };

  // Type summary pills
  const typeSummary = useMemo(() => {
    const counts = {};
    messages.forEach(m => { const n = m.msgTypeName || m.msgType || "?"; counts[n] = (counts[n] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [messages]);

  // JSON export of selected message
  const exportJSON = () => {
    if (!sel) return;
    const fields = [...sel.components.header, ...sel.components.body, ...sel.components.trailer];
    const obj = {};
    fields.forEach(f => { obj[f.name || f.tag] = f.raw; });
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `fix-msg-${selectedIdx + 1}.json`; a.click();
    URL.revokeObjectURL(url);
  };
    const headers = ["#", "Time", "Type", "Direction", "Summary", "Δt"];
    const rows = messages.map((m, i) => {
      const dt = i > 0 ? calculateTimeDelta(m.sendingTime, messages[i - 1].sendingTime) : "";
      const time = m.sendingTime ? (m.sendingTime.split("-")[1] || m.sendingTime) : "";
      const dir = `${m.senderCompID || ""}→${m.targetCompID || ""}`;
      return [i + 1, time, m.msgTypeName || m.msgType || "", dir, m.summary || "", dt || ""].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fix-session.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: "20px" }}>
      {/* ── Order lifecycle view ── */}
      <OrderLifecycleView messages={messages} t={t} onSelectMessage={(idx) => { setSelectedIdx(idx); setDetailMode("table"); setTableFilter(""); }} />

      {/* ── Type summary pills — clickable to filter ── */}
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "10px", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: t.textFaint, fontWeight: 600, letterSpacing: "0.4px", flexShrink: 0 }}>TYPES</span>
        {typeSummary.map(([name, count]) => {
          const b = badgeFor(name, t);
          const isActive = logFilter === name;
          return (
            <span key={name} onClick={() => setLogFilter(isActive ? "" : name)}
              style={{ fontSize: "10px", fontWeight: 600, padding: "2px 9px", borderRadius: "20px", background: isActive ? b.border : b.bg, color: isActive ? "#fff" : b.fg, border: "0.5px solid " + b.border, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
              title={"Filter by " + name}
            >
              {name} {count}
            </span>
          );
        })}
        {logFilter && !typeSummary.find(([n]) => n === logFilter) && (
          <button onClick={() => setLogFilter("")} style={{ fontSize: "10px", color: t.red, background: "none", border: "none", cursor: "pointer" }}>✕ clear</button>
        )}
      </div>

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
      {/* ── Left: Log table ── */}
      <div style={{ flex: isMobile ? "none" : "0 0 580px", width: isMobile ? "100%" : undefined, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: t.textMuted, whiteSpace: "nowrap" }}>
            TIMELINE · {messages.length}{filterLower && filteredMessages.length !== messages.length ? ` · ${filteredMessages.length}` : ""} MSG
          </span>
          <div style={{ display: "flex", gap: "5px", alignItems: "center", flexWrap: "nowrap" }}>
            <button onClick={exportCSV} title="Export as CSV" style={{ height: "26px", padding: "0 8px", borderRadius: "6px", fontSize: "11px", border: "1px solid " + t.border, background: t.panelAlt, color: t.textMuted, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>⬇{!isMobile && " CSV"}</button>
            <button onClick={exportJSON} title="Export selected as JSON" disabled={!sel} style={{ height: "26px", padding: "0 8px", borderRadius: "6px", fontSize: "11px", border: "1px solid " + t.border, background: t.panelAlt, color: sel ? t.textMuted : t.textFaint, cursor: sel ? "pointer" : "default", whiteSpace: "nowrap", flexShrink: 0 }}>⬇{!isMobile && " JSON"}</button>
            <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
              <span style={{ fontSize: "10px", color: t.textFaint }}>🔴</span>
              <input type="number" value={spikeMs} onChange={e => setSpikeMs(Number(e.target.value))} min={1} style={{ width: isMobile ? "44px" : "52px", height: "24px", padding: "0 4px", fontSize: "16px", border: "1px solid " + t.border, borderRadius: "4px", background: t.inputBg, color: t.text, textAlign: "right" }} />
              <span style={{ fontSize: "10px", color: t.textFaint }}>ms</span>
            </div>
            <input value={logFilter} onChange={e => setLogFilter(e.target.value)} placeholder="Filter…" style={{ height: "26px", padding: "0 8px", borderRadius: "6px", fontSize: "14px", border: "1px solid " + t.border, background: t.inputBg, color: t.text, outline: "none", minWidth: 0, flex: 1, maxWidth: isMobile ? "100px" : "140px" }} />
          </div>
        </div>

        <Card t={t} style={{ overflow: "hidden", padding: 0 }}>
          <div ref={tableRef} style={{ overflowY: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "28px" }} />
                <col style={{ width: isMobile ? "70px" : "86px" }} />
                {!isMobile && <col style={{ width: "96px" }} />}
                <col style={{ width: isMobile ? "120px" : "148px" }} />
                {!isMobile && <col />}
                <col style={{ width: isMobile ? "50px" : "50px" }} />
              </colgroup>
              <thead>
                <tr style={{ background: t.panelAlt, position: "sticky", top: 0, zIndex: 1, boxShadow: "0 1px 0 " + t.border }}>
                  {(isMobile
                    ? [["#","right"],["Time","left"],["Type","left"],["Δt","right"]]
                    : [["#","right"],["Time","left"],["Dir","left"],["Type","left"],["Summary","left"],["Δt","right"]]
                  ).map(([label, align]) => (
                    <th key={label} style={{ padding: "6px 8px", fontSize: "10px", fontWeight: 700, color: t.textFaint, textAlign: align, borderBottom: "2px solid " + t.border, letterSpacing: "0.5px" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((m) => {
                  const i = m._oi; // original index — O(1), not O(n)
                  const isSel = i === selectedIdx;
                  const isRel = selGroupKey && m.clOrdID && idMap[m.clOrdID] === selGroupKey && !isSel;
                  const timeDelta = i > 0 ? calculateTimeDelta(m.sendingTime, messages[i - 1].sendingTime) : null;
                  const badge = badgeFor(m.msgTypeName, t);
                  const timeStr = m.sendingTime ? (m.sendingTime.split("-")[1] || m.sendingTime) : `#${i + 1}`;
                  const rowBg = isSel ? t.accentBg : isRel ? t.yellowBg : "transparent";
                  const fullName = m.msgTypeName || m.msgType || "Unknown";

                  return (
                    <tr
                      key={m.logIndex ?? i}
                      data-idx={i}
                      onClick={() => { setSelectedIdx(i); setDetailMode("table"); setTableFilter(""); }}
                      style={{ background: rowBg, borderLeft: isSel ? "4px solid " + t.accent : isRel ? "3px solid " + t.yellow : "3px solid transparent", cursor: "pointer", transition: "background 0.08s" }}
                      onMouseEnter={e => { if (!isSel && !isRel) e.currentTarget.style.background = t.panelAlt; }}
                      onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                    >
                      <td style={{ ...cellBase, textAlign: "right", color: t.textFaint, fontFamily: "monospace", paddingRight: "6px" }}>{i + 1}</td>
                      <td style={{ ...cellBase, fontFamily: "monospace", color: t.textMuted, fontSize: "10px", paddingLeft: "8px" }}>{timeStr}</td>
                      {!isMobile && <td style={{ ...cellBase, fontFamily: "monospace", color: t.textFaint, fontSize: "10px", paddingLeft: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.senderCompID}→{m.targetCompID}</td>}
                      <td style={{ ...cellBase, paddingLeft: "8px" }}>
                        <span style={{ display: "inline-block", fontSize: "10px", fontWeight: 600, padding: "1px 8px", borderRadius: "20px", background: badge.bg, color: badge.fg, border: "0.5px solid " + badge.border, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: isMobile ? "110px" : "144px" }}>
                          {fullName}
                        </span>
                      </td>
                      {!isMobile && <td style={{ ...cellBase, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: "8px" }}>{m.summary}</td>}
                      <td style={{ ...cellBase, textAlign: "right", fontFamily: "monospace", fontSize: "10px", paddingRight: "8px", color: dtColor(timeDelta), fontWeight: timeDelta && parseFloat(timeDelta) * (timeDelta.includes("s") && !timeDelta.includes("ms") ? 1000 : 1) >= spikeMs ? 700 : 400 }}>
                        {timeDelta || "—"}
                      </td>
                    </tr>
                  );
                })}
                {filteredMessages.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "40px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: "24px", marginBottom: "8px" }}>🔍</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: t.textMuted, marginBottom: "4px" }}>No messages match</div>
                    <div style={{ fontSize: "11px", color: t.textFaint }}>"{logFilter}"</div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── Right: Detail panel ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {sel ? (
          <div>
            <ValidationBanner result={sel} t={t} />
            <ExecutionSummaryVisualizer result={sel} t={t} />
            {sel.rawMessage && (
              <div style={{ marginBottom: "12px" }}>
                <ThemedAnatomyBar result={sel} originalInput={sel.rawMessage} t={t} />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: "8px", marginBottom: "12px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {["table", "walkthrough"].map(v => (
                  <button key={v} onClick={() => setDetailMode(v)} style={{ padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: detailMode === v ? 600 : 400, border: "1.5px solid " + (detailMode === v ? t.accent : t.border), background: detailMode === v ? t.accentBg : "transparent", color: detailMode === v ? t.accent : t.textMuted, cursor: "pointer", transition: "all 0.12s", flex: isMobile ? 1 : "none", textAlign: "center" }}>
                    {v === "table" ? "⊞ Table" : "▶ Walkthrough"}
                  </button>
                ))}
              </div>
              {detailMode === "table" && (
                <input ref={filterRef} type="text" value={tableFilter} onChange={e => setTableFilter(e.target.value)} placeholder={isMobile ? "Filter fields…" : "🔍 Filter fields… (Press '/' to focus)"} style={{ width: "100%", maxWidth: isMobile ? "none" : "340px", height: "32px", padding: "0 10px", borderRadius: "6px", fontSize: "16px", border: "1px solid " + t.border, background: t.inputBg, color: t.text, outline: "none" }} />
              )}
            </div>
            {detailMode === "table" ? (
              <FieldSections result={sel} t={t} onTagClick={onTagClick} filterText={tableFilter} isMobile={isMobile} />
            ) : sel.rawMessage ? (
              <Walkthrough result={sel} originalInput={sel.rawMessage} t={t} />
            ) : null}
          </div>
        ) : null}
      </div>
      </div>  {/* end inner flex row */}
    </div>
  );
}

// ─── Unified Input ────────────────────────────────────────────────────────────
function UnifiedInput({ t, onSingleResult, onLogResult, onClearAll, input, setInput, isMobile }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("fix-history") || "[]"); } catch { return []; } });
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef(null);
  const fileRef = useRef(null);

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e) => { if (historyRef.current && !historyRef.current.contains(e.target)) setShowHistory(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHistory]);

  const isLog = countFixStarts(input) > 1;
  const mode = input.trim() ? (isLog ? "log" : "single") : null;
  const containsSOH = input.includes("\x01");

  // SOH conversion: keep textarea unchanged, convert internally before sending
  const normalizeForSend = (text) => text.replace(/\x01/g, "|");

  const saveHistory = (text) => {
    const entry = { text, time: Date.now(), count: countFixStarts(text), label: fileName || (text.slice(0, 60) + "…") };
    const next = [entry, ...history.filter(h => h.text !== text)].slice(0, 10);
    setHistory(next);
    localStorage.setItem("fix-history", JSON.stringify(next));
  };

  const handleFile = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // Accept by content, not just extension — FIX logs come as .txt .log .fix .csv or no extension
    const r = new FileReader();
    r.onload = ev => {
      const text = ev.target.result;
      if (!text.includes("8=FIX")) { setError("File does not appear to contain FIX messages (no '8=FIX' found)."); e.target.value = ""; return; }
      setInput(text); setFileName(f.name); setError(null);
    };
    r.readAsText(f);
    e.target.value = "";
  };

  const handleSubmit = async (overrideInput) => {
    const raw = overrideInput || input;
    if (!raw.trim()) return;
    setLoading(true); setError(null);
    const body = normalizeForSend(raw);
    const rawIsLog = countFixStarts(raw) > 1;
    try {
      if (rawIsLog) {
        const res = await fetch(API_LOG, { method: "POST", headers: { "Content-Type": "text/plain" }, body });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.message || `Server error ${res.status}`); return; }
        const d = await res.json();
        saveHistory(raw);
        onLogResult(d.messages, raw);
      } else {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.message || `Server error ${res.status}`); return; }
        const d = await res.json();
        saveHistory(raw);
        onSingleResult(d, raw);
      }
    } catch {
      setError("Could not reach the backend. If this is the first request in a while, the service may be cold-starting (~30s). Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <Card t={t}>
      <div style={{ padding: isMobile ? "10px 12px" : "14px 18px", borderBottom: "1px solid " + t.border }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {!isMobile && <div style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Paste a FIX message or log</div>}
            {mode && <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: mode === "log" ? t.purpleBg : t.accentBg, color: mode === "log" ? t.purple : t.accent, border: "1px solid " + (mode === "log" ? t.purple : t.accent) }}>{mode === "log" ? "LOG · " + countFixStarts(input) + " MSG" : "SINGLE"}</span>}
            {containsSOH && <span style={{ padding: "2px 6px", background: t.yellowBg, color: t.yellow, border: "1px solid " + t.yellow, borderRadius: "4px", fontSize: "10px", fontWeight: 600 }}>⚠️ SOH</span>}
          </div>
          {/* Action buttons — wrap on mobile */}
          <div style={{ display: "flex", gap: "5px", alignItems: "center", flexWrap: "wrap" }}>
            {history.length > 0 && (
              <div ref={historyRef} style={{ position: "relative" }}>
                <Btn t={t} onClick={() => setShowHistory(v => !v)}>🕐{!isMobile && " History"}</Btn>
                {showHistory && (
                  <div style={{ position: "absolute", right: 0, top: "36px", zIndex: 50, background: t.panel, border: "1px solid " + t.border, borderRadius: "8px", boxShadow: t.shadowMd, minWidth: isMobile ? "240px" : "300px", maxHeight: "280px", overflowY: "auto" }}>
                    {history.map((h, i) => (
                      <div key={i} onClick={() => { setInput(h.text); setShowHistory(false); setFileName(null); setError(null); }}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: i < history.length - 1 ? "1px solid " + t.borderSub : "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = t.panelAlt}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div style={{ fontSize: "11px", color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</div>
                        <div style={{ fontSize: "10px", color: t.textFaint, marginTop: "2px" }}>{new Date(h.time).toLocaleString()} · {h.count} msg{h.count !== 1 ? "s" : ""}</div>
                      </div>
                    ))}
                    <div onClick={() => { setHistory([]); localStorage.removeItem("fix-history"); setShowHistory(false); }}
                      style={{ padding: "8px 12px", cursor: "pointer", color: t.red, fontSize: "11px", textAlign: "center", borderTop: "1px solid " + t.border }}
                      onMouseEnter={e => e.currentTarget.style.background = t.redBg}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >Clear history</div>
                  </div>
                )}
              </div>
            )}
            <Btn t={t} onClick={() => fileRef.current && fileRef.current.click()}>📁{!isMobile && " Upload"}</Btn>
            <input ref={fileRef} type="file" accept=".txt,.log,.fix,.csv" onChange={handleFile} style={{ display: "none" }} />
            <Btn t={t} onClick={() => { setInput("8=FIX.4.2|9=458|35=W|34=3|49=TT_PRICE|52=20260615-10:25:15.627|56=QALGOMARKET|15=USD|48=14347306835933645772|55=GC|100=XCEC|107=Gold 100 oz|167=FUT|200=202608|205=27|207=CME|262=218888029250001|268=10|269=0|270=43593|271=3|290=1|269=1|270=43598|271=1|290=1|269=Y|270=43591|271=1|290=1|269=Z|270=43603|271=1|290=1|269=B|271=58663|269=x|270=43597|271=1|269=6|270=42388|272=20260612|273=00:00:00|269=4|270=42894|269=7|270=43661|269=8|270=42834|460=2|461=F|541=20260827|18211=M|10=180|"); setFileName(null); setError(null); }}>Group</Btn>
            <Btn t={t} onClick={() => { setInput(["8=FIX.4.4|9=61|35=A|49=EXEC|56=BANZAI|34=1|52=20260613-23:24:06|10=097|","8=FIX.4.4|9=116|35=D|49=BANZAI|56=EXEC|34=2|52=20260613-23:24:42|11=ORD1001|55=MSFT|54=1|38=10000|40=2|44=12.3|10=199|","8=FIX.4.4|9=123|35=8|49=EXEC|56=BANZAI|34=2|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC1|150=0|39=0|55=MSFT|10=233|"].join("\n")); setFileName(null); setError(null); }}>Sample</Btn>
            {input && <Btn t={t} onClick={() => { setInput(""); setFileName(null); setError(null); onClearAll(); }}>Clear</Btn>}
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "10px 12px" : "14px 18px" }}>
        {fileName && <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "8px" }}>📁 {fileName}</div>}
        <textarea
          value={input}
          onChange={e => { setInput(e.target.value); setFileName(null); }}
          onPaste={e => {
            // Auto-parse 400ms after paste if it looks like a complete FIX message
            setTimeout(() => {
              const pasted = e.target.value || "";
              if (pasted.includes("8=FIX") && pasted.includes("10=")) {
                handleSubmit(pasted);
              }
            }, 400);
          }}
          rows={isMobile ? 4 : 5}
          placeholder={isMobile ? "Paste FIX message or log…" : "8=FIX.4.4|9=...|35=D|...  — or paste raw production messages containing binary SOH lines"}
          style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "13px", padding: "10px 12px", border: "1px solid " + t.border, borderRadius: "8px", background: t.inputBg, color: t.text, resize: "vertical" }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }}
        />
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px", flexWrap: "wrap" }}>
          <PrimaryBtn onClick={handleSubmit} loading={loading} disabled={!input.trim()} t={t}>Parse Data</PrimaryBtn>
          {!isMobile && <span style={{ fontSize: "11px", color: t.textMuted }}>🔒 Privacy First: Messages transit encrypted and are never stored or logged on disk.</span>}
          {isMobile && <span style={{ fontSize: "10px", color: t.textFaint }}>🔒 Encrypted · Never stored</span>}
        </div>
        {error && <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "8px", background: t.redBg, border: "1px solid " + t.red, color: t.red, fontSize: "12px" }}>{error}</div>}
      </div>
    </Card>
  );
}

// ─── Local tag metadata map (avoids firing an API call just to look up a name) ─
// Keyed by tag number; values match the shape expected by onTagClick / TagPanel.
const LOCAL_TAG_META = Object.fromEntries(
  POPULAR_TAGS.map(([tag, name]) => [
    tag,
    { tag, name, raw: "", meaning: "", decoded: "", why: "", referenceUrl: `https://www.onixs.biz/fix-dictionary/4.4/tagNum_${tag}.html` },
  ])
);

// ─── Popular Tags Grid ────────────────────────────────────────────────────────
function PopularTagsGrid({ t, onTagClick }) {
  const [loadingTag, setLoadingTag] = useState(null);
  const [lookupError, setLookupError] = useState(null);

  const doLookup = useCallback(async (tagNum) => {
    // Use the locally-known metadata immediately so the panel opens without a
    // network round-trip.  Then try to enrich it with live backend data (which
    // includes the "why" explanation and any enum decoding) in the background.
    const local = LOCAL_TAG_META[tagNum];
    if (local) onTagClick(local);

    setLoadingTag(tagNum);
    setLookupError(null);
    try {
      const syn = "8=FIX.4.4|9=10|35=0|" + tagNum + "=X|10=000|";
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: syn });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      const f = d.sequence ? d.sequence.find(f => String(f.tag) === String(tagNum)) : null;
      if (f) onTagClick(f); // update panel with richer data if available
    } catch {
      // Don't close the panel — the local metadata is already showing.
      // Surface a non-intrusive hint that the backend may be cold-starting.
      setLookupError(tagNum);
    } finally {
      setLoadingTag(null);
    }
  }, [onTagClick]);

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: t.textMuted, marginBottom: "10px" }}>
        COMMON TAGS — click to look up
      </div>
      {lookupError && (
        <div style={{ marginBottom: "8px", fontSize: "11px", color: t.yellow, background: t.yellowBg, border: "1px solid " + t.yellow, borderRadius: "6px", padding: "6px 10px" }}>
          ⚠ Backend enrichment unavailable — showing local data. The service may be starting up (this can take ~30s on first load).
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "6px" }}>
        {POPULAR_TAGS.map(([tag, name]) => (
          <button key={tag} onClick={() => doLookup(tag)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: "8px", border: "1px solid " + t.border, background: t.panel, cursor: "pointer", opacity: loadingTag === tag ? 0.6 : 1, transition: "opacity 0.15s" }}>
            <div style={{ fontSize: "10px", color: t.textFaint, fontFamily: "monospace" }}>TAG {tag}</div>
            <div style={{ fontSize: "13px", color: t.text, fontWeight: 600, marginTop: "2px" }}>{name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
// ─── URL permalink helpers ────────────────────────────────────────────────────
function encodeShare(text) {
  try {
    // btoa needs latin1 — encode UTF-8 first via encodeURIComponent
    return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
  } catch { return null; }
}
function decodeShare(b64) {
  try {
    return decodeURIComponent(Array.from(atob(b64), c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
  } catch { return null; }
}

// ─── Mobile breakpoint hook ───────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

export default function App() {
  const [themeName, setThemeName] = useState(() => localStorage.getItem("fix-theme") || "dark");
  const t = T[themeName];
  const toggleTheme = () => setThemeName(n => {
    const next = n === "dark" ? "light" : "dark";
    localStorage.setItem("fix-theme", next);
    return next;
  });

  const [singleResult, setSingleResult]   = useState(null);
  const [singleInput,  setSingleInput]    = useState("");
  const [logMessages,  setLogMessages]    = useState(null);
  const [tagPanel,     setTagPanel]       = useState(null);
  const [tableFilter,  setTableFilter]    = useState("");
  const [textareaInput, setTextareaInput] = useState("");
  const [shareToast,   setShareToast]     = useState(false);
  const filterRef = useRef(null);

  // Load shared message from URL on first mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("msg");
    if (shared) {
      const decoded = decodeShare(shared);
      if (decoded) {
        setTextareaInput(decoded);
        // Remove ?msg= from URL without reload so bookmark is clean
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);


  // Tab Favicon Injector
  useEffect(() => {
    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" rx="20" fill="%230969da"/>
        <path d="M25 75V55M50 75V30M75 75V45" stroke="white" stroke-width="10" stroke-linecap="round"/>
      </svg>
    `.trim().replace(/\s+/g, " ");
    
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = "data:image/svg+xml," + svgIcon;
    document.title = "FIX Protocol Parser & Analyzer";
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const inInput = document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT";
      // '/' → focus field filter
      if (e.key === "/" && !inInput) { e.preventDefault(); if (filterRef.current) filterRef.current.focus(); }
      // Escape → close tag panel
      if (e.key === "Escape") { setTagPanel(null); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSingleResult = (result, input) => {
    setSingleResult(result);
    setSingleInput(input);
    setLogMessages(null);
    setTableFilter("");
  };

  const handleLogResult = (messages) => {
    setLogMessages(messages);
    setSingleResult(null);
    setSingleInput("");
    setTableFilter("");
  };

  const handleHomeReset = () => {
    setSingleResult(null);
    setSingleInput("");
    setLogMessages(null);
    setTableFilter("");
    setTagPanel(null);
    setTextareaInput("");
  };

  const isMobile = useIsMobile();

  const hasResult = singleResult || logMessages;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; width: 100%; }
        body { background: ${t.page}; display: block !important; }
        #root { max-width: none !important; margin: 0 !important; padding: 0 !important; text-align: left !important; }
        @media (max-width: 767px) {
          .hide-mobile { display: none !important; }
          .mobile-full { width: 100% !important; min-width: 0 !important; flex: 1 1 auto !important; }
          .mobile-stack { flex-direction: column !important; }
          .mobile-pad { padding: 12px !important; }
          .mobile-font-sm { font-size: 10px !important; }
          input, textarea { font-size: 16px !important; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: t.page, color: t.text, fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", width: "100%" }}>
        
        {/* Header */}
        <header style={{
          position: "sticky", top: 0, zIndex: 100,
          background: t.header,
          borderBottom: "1px solid " + t.border,
          display: "flex", alignItems: "center",
          padding: isMobile ? "0 12px" : "0 24px",
          height: isMobile ? "48px" : "54px",
          gap: isMobile ? "8px" : "16px", width: "100%",
          boxShadow: "0 1px 0 " + t.border + ", 0 2px 8px rgba(0,0,0,0.08)",
        }}>
          {/* Logo */}
          <div onClick={handleHomeReset} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", flexShrink: 0 }} title="Home">
            <div style={{
              width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
              background: "linear-gradient(135deg, " + t.accent + ", " + t.purple + ")",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", fontWeight: 800, color: "#fff",
              boxShadow: "0 2px 8px " + t.accent + "44",
            }}>F</div>
            {!isMobile && (
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: t.text, lineHeight: 1.1, letterSpacing: "-0.2px" }}>
                  <span style={{ color: t.accent }}>FIX</span> Parser
                </div>
                <div style={{ fontSize: "9px", color: t.textFaint, letterSpacing: "0.8px", fontWeight: 600 }}>PROTOCOL ANALYSER</div>
              </div>
            )}
          </div>

          {!isMobile && <div style={{ width: "1px", height: "28px", background: t.border }} />}

          <div style={{ flex: 1 }} />

          {/* Tag search — shorter on mobile */}
          <HeaderTagSearch t={t} onResult={f => setTagPanel(f)} isMobile={isMobile} />

          {/* Share button */}
          {textareaInput.trim() && (
            <button
              onClick={() => {
                const encoded = encodeShare(textareaInput);
                if (!encoded) return;
                const url = `${window.location.origin}${window.location.pathname}?msg=${encoded}`;
                navigator.clipboard.writeText(url).then(() => { setShareToast(true); setTimeout(() => setShareToast(false), 2500); });
              }}
              title="Copy shareable link"
              style={{ height: "32px", padding: isMobile ? "0 8px" : "0 12px", borderRadius: "6px", fontSize: "12px", border: "1px solid " + t.border, background: "transparent", color: t.textMuted, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px", transition: "border-color 0.15s, color 0.15s", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}
            >{isMobile ? "🔗" : "🔗 Share"}</button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            style={{ height: "32px", padding: isMobile ? "0 8px" : "0 12px", borderRadius: "6px", fontSize: "12px", border: "1px solid " + t.border, background: "transparent", color: t.textMuted, cursor: "pointer", flexShrink: 0, transition: "border-color 0.15s, color 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.textMuted; e.currentTarget.style.color = t.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}
          >{themeName === "dark" ? "☀" : "🌙"}{!isMobile && (themeName === "dark" ? " Light" : " Dark")}</button>
        </header>

        {/* Share toast */}
        {shareToast && (
          <div style={{
            position: "fixed", bottom: "28px", left: "50%", transform: "translateX(-50%)",
            zIndex: 9999, background: t.green, color: "#fff",
            padding: "10px 20px", borderRadius: "8px",
            fontSize: "13px", fontWeight: 600,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            pointerEvents: "none",
            display: "flex", alignItems: "center", gap: "8px",
            animation: "toastIn 0.25s ease",
          }}>
            <style>{`@keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
            <span style={{ fontSize: "16px" }}>✓</span> Link copied to clipboard
          </div>
        )}

        <main style={{ flex: 1, padding: isMobile ? "12px" : "24px", width: "100%" }}>
          <UnifiedInput t={t} onSingleResult={handleSingleResult} onLogResult={handleLogResult} onClearAll={handleHomeReset} input={textareaInput} setInput={setTextareaInput} isMobile={isMobile} />
          {singleResult && (
            <SingleResult result={singleResult} originalInput={singleInput} t={t} onTagClick={f => setTagPanel(f)} filterRef={filterRef} tableFilter={tableFilter} setTableFilter={setTableFilter} isMobile={isMobile} />
          )}
          {logMessages && (
            <SessionResult messages={logMessages} t={t} onTagClick={f => setTagPanel(f)} filterRef={filterRef} tableFilter={tableFilter} setTableFilter={setTableFilter} isMobile={isMobile} />
          )}
          {!hasResult && <PopularTagsGrid t={t} onTagClick={f => setTagPanel(f)} />}
        </main>
      </div>

      {tagPanel && <TagPanel field={tagPanel} onClose={() => setTagPanel(null)} t={t} isMobile={isMobile} />}
    </>
  );
}

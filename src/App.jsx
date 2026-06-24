import { useState, useEffect, useRef, useCallback } from "react";

// ─── Backend URLs ─────────────────────────────────────────────────────────────
const API     = "https://fix-parser-backend.onrender.com/api/parse";
const API_LOG = "https://fix-parser-backend.onrender.com/api/parse-log";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  dark: {
    page:      "#0d1117",
    header:    "#161b22",
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
    shadowMd:  "0 8px 24px rgba(0,0,0,0.5)",
    sections: {
      header:  { bg: "rgba(88,166,255,0.08)",  border: "#58a6ff", label: "HEADER",  text: "#79c0ff" },
      body:    { bg: "rgba(63,185,80,0.08)",   border: "#3fb950", label: "BODY",    text: "#56d364" },
      trailer: { bg: "rgba(227,179,65,0.08)",  border: "#e3b341", label: "TRAILER", text: "#d29922" },
    },
  },
  light: {
    page:      "#f6f8fa",
    header:    "#ffffff",
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
    shadowMd:  "0 8px 24px rgba(0,0,0,0.1)",
    sections: {
      header:  { bg: "rgba(9,105,218,0.06)",  border: "#0969da", label: "HEADER",  text: "#0550ae" },
      body:    { bg: "rgba(26,127,55,0.06)",  border: "#1a7f37", label: "BODY",    text: "#116329" },
      trailer: { bg: "rgba(154,103,0,0.06)",  border: "#9a6700", label: "TRAILER", text: "#7d4e00" },
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
    <button onClick={onClick} disabled={disabled} style={{
      padding: "5px 12px", borderRadius: "6px", cursor: disabled ? "default" : "pointer",
      fontSize: "12px", fontWeight: 500,
      border: "1px solid " + (t ? t.border : "#30363d"),
      background: disabled ? (t ? t.panelAlt : "transparent") : (t ? t.panel : "#21262d"),
      color: disabled ? (t ? t.textFaint : "#484f58") : (t ? t.text : "#e6edf3"),
      transition: "border-color 0.15s", ...style,
    }}>{children}</button>
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
    <button onClick={onClick} disabled={disabled || loading} style={{
      padding: "8px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
      border: "none", cursor: disabled || loading ? "default" : "pointer",
      background: disabled || loading ? t.textFaint : t.accent,
      color: "#fff", transition: "opacity 0.15s", ...style,
    }}>{loading ? "Processing…" : children}</button>
  );
}

function Card({ children, t, style = {} }) {
  return (
    <div style={{
      background: t.panel, border: "1px solid " + t.border,
      borderRadius: "10px", overflow: "hidden", ...style,
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
  return (
    <div style={{
      padding: "10px 16px", borderRadius: "8px", marginBottom: "14px",
      background: ok ? t.greenBg : t.redBg,
      border: "1px solid " + (ok ? t.green : t.red),
      color: ok ? t.green : t.red,
    }}>
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: !ok && result.validationErrors?.length ? "6px" : 0 }}>
        {ok ? "✓ Valid" : "✗ Validation errors"}{" "}
        <span style={{ fontWeight: 400, color: t.textMuted }}>· {result.msgTypeName}</span>
      </div>
      {!ok && result.validationErrors?.map((e, i) => (
        <div key={i} style={{ fontSize: "12px", marginTop: "3px" }}>· {e}</div>
      ))}
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
                display: "inline-block", padding: "1px 5px", marginRight: "2px",
                borderRadius: "3px", cursor: "pointer",
                transition: "all 0.15s",
                background: isCurrent ? sc.border : sc.bg,
                color: isCurrent ? "#fff" : sc.text,
                fontWeight: isCurrent ? 700 : 400,
              }}
            >{part}</span>
          );
        })}
      </div>

      {hoveredField && (
        <div style={{
          position: "fixed", top: tooltipPos.y, left: tooltipPos.x,
          background: t.header, border: "1px solid " + t.border, borderRadius: "6px",
          padding: "8px 12px", boxShadow: t.shadowMd, zIndex: 500, pointerEvents: "none",
          fontFamily: "system-ui, sans-serif", fontSize: "12px", minWidth: "200px"
        }}>
          <div style={{ fontWeight: 700, color: t.accent, fontFamily: "monospace" }}>Tag {hoveredField.tag} · {hoveredField.name}</div>
          <div style={{ marginTop: "4px", color: t.text }}>Value: <code style={{ fontFamily: "monospace", color: t.green }}>{hoveredField.raw}</code></div>
          <div style={{ color: t.textMuted, fontSize: "11px", marginTop: "2px" }}>Meaning: {hoveredField.meaning}</div>
        </div>
      )}
    </div>
  );
}

// ─── Field Table ──────────────────────────────────────────────────────────────
function FieldTable({ rows, sectionKey, t, onTagClick, filterText }) {
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

  const renderRawTable = (fieldsList) => (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: "52px" }} />   {/* Tag */}
        <col style={{ width: "190px" }} />  {/* Field Name */}
        <col style={{ width: "180px" }} />  {/* Raw Value */}
        <col />                             {/* Meaning — flex fill */}
        <col style={{ width: "32px" }} />   {/* ↗ button */}
      </colgroup>
      <thead>
        <tr style={{ borderBottom: "1px solid " + t.border }}>
          {["Tag", "Field Name", "Raw Value", "Meaning", ""].map((h, i) => (
            <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: t.textFaint, letterSpacing: "0.4px", whiteSpace: "nowrap" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fieldsList.map((r, i) => (
          <tr key={i} style={{ borderBottom: i < fieldsList.length - 1 ? "1px solid " + t.borderSub : "none" }}>
            <td style={{ padding: "6px 10px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "11px", fontWeight: 700, color: sc.text, whiteSpace: "nowrap" }}>{r.tag}</td>
            <td style={{ padding: "6px 10px", fontSize: "12px", color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.name}
              {r.isUnknownTag && <span style={{ fontSize: "10px", color: t.red, marginLeft: "5px" }}>unknown</span>}
            </td>
            <td style={{ padding: "6px 10px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "11px", color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.raw}</td>
            <td style={{ padding: "6px 10px", fontSize: "12px", color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meaning}</td>
            <td style={{ padding: "6px 4px", textAlign: "center" }}>
              <button onClick={() => onTagClick && onTagClick(r)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: t.accent, padding: "2px 4px", borderRadius: "4px" }}>↗</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "5px 12px", borderRadius: "6px 6px 0 0", background: sc.border,
      }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", letterSpacing: "0.8px" }}>{sc.label}</span>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>{filteredRows.length} field{rows.length !== 1 ? "s" : ""}</span>
      </div>
      
      <div style={{ border: "1px solid " + t.border, borderTop: "none", borderRadius: "0 0 6px 6px", background: t.panel, overflow: "hidden" }}>
        {baseFields.length > 0 && renderRawTable(baseFields)}
        
        {Object.keys(groupsMap).map((gIdx) => (
          <div key={gIdx} style={{ margin: "10px", padding: "10px", background: t.panelAlt, borderLeft: "3px solid " + t.purple, borderRadius: "6px", boxShadow: t.shadow }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: t.purple, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
              📦 Repeating Entry Sequence Block #{parseInt(gIdx) + 1}
            </div>
            {renderRawTable(groupsMap[gIdx])}
          </div>
        ))}
      </div>
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
function TagPanel({ field, onClose, t }) {
  if (!field) return null;
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "380px",
      background: t.panel, borderLeft: "1px solid " + t.border,
      boxShadow: t.shadowMd, zIndex: 200, display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid " + t.border }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Tag Reference</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.textMuted, fontSize: "20px" }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "baseline", marginBottom: "20px" }}>
          <span style={{ fontFamily: "monospace", fontSize: "40px", fontWeight: 700, color: t.accent }}>{field.tag}</span>
          <span style={{ fontSize: "22px", fontWeight: 700, color: t.text }}>{field.name}</span>
        </div>
        {field.why && (
          <div style={{ borderLeft: "3px solid " + t.accent, padding: "10px 14px", background: t.panelAlt, borderRadius: "0 8px 8px 0" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: t.accent }}>WHY THIS MATTERS</div>
            <div style={{ fontSize: "13px", color: t.textMuted, marginTop: "4px" }}>{field.why}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Header Tag Search ────────────────────────────────────────────────────────
function HeaderTagSearch({ t, onResult }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (tagNum) => {
    if (!/^\d+$/.test(String(tagNum).trim())) return;
    setLoading(true);
    try {
      const syn = "8=FIX.4.4|9=10|35=0|" + tagNum + "=X|10=000|";
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: syn });
      const d = await res.json();
      const f = d.sequence ? d.sequence.find(f => String(f.tag) === String(tagNum)) : null;
      if (f) onResult(f);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [onResult]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: "10px", fontSize: "12px", color: t.textFaint }}>⌗</span>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") doSearch(query); }} placeholder="Tag lookup…" style={{ paddingLeft: "28px", height: "32px", borderRadius: "6px", fontSize: "12px", width: "140px", border: "1px solid " + t.border, background: t.inputBg, color: t.text, outline: "none" }} />
      </div>
      <button onClick={() => doSearch(query)} style={{ height: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "12px", background: t.accentBg, color: t.accent, border: "1px solid " + t.accent, cursor: "pointer" }}>Look up</button>
    </div>
  );
}

// ─── Single Message Result ────────────────────────────────────────────────────
function SingleResult({ result, originalInput, t, onTagClick, filterRef, tableFilter, setTableFilter }) {
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
          <div key={k} style={{ padding: "7px 12px", background: t.panel, border: "1px solid " + t.border, borderRadius: "7px", flex: "1 1 160px" }}>
            <div style={{ fontSize: "10px", color: t.textMuted }}>{k.toUpperCase()}</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: t.text, fontFamily: "monospace" }}>{v}</div>
          </div>
        ))}
      </div>

      <ValidationBanner result={result} t={t} />
      <ExecutionSummaryVisualizer result={result} t={t} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["table", "walkthrough"].map(v => (
            <button key={v} onClick={() => setSubView(v)} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", border: "1px solid " + (subView === v ? t.accent : t.border), background: subView === v ? t.accentBg : t.panel, color: subView === v ? t.accent : t.textMuted, cursor: "pointer" }}>{v === "table" ? "Table" : "Walkthrough"}</button>
          ))}
        </div>

        {subView === "table" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", maxWidth: "400px" }}>
            <input ref={filterRef} type="text" value={tableFilter} onChange={e => setTableFilter(e.target.value)} placeholder="🔍 Filter fields... (Press '/' to focus)" style={{ width: "100%", height: "32px", padding: "0 10px", borderRadius: "6px", fontSize: "12px", border: "1px solid " + t.border, background: t.inputBg, color: t.text, outline: "none" }} />
          </div>
        )}
      </div>

      {subView === "table" ? (
        <>
          <FieldTable rows={result.components.header}  sectionKey="header"  t={t} onTagClick={onTagClick} filterText={tableFilter} />
          <FieldTable rows={result.components.body}    sectionKey="body"    t={t} onTagClick={onTagClick} filterText={tableFilter} />
          <FieldTable rows={result.components.trailer} sectionKey="trailer" t={t} onTagClick={onTagClick} filterText={tableFilter} />
        </>
      ) : (
        <Walkthrough result={result} originalInput={originalInput} t={t} />
      )}
    </div>
  );
}

// ─── MsgType abbreviation map for the log table ──────────────────────────────
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
function SessionResult({ messages, t, onTagClick, filterRef, tableFilter, setTableFilter }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailMode, setDetailMode] = useState("table");
  const [logFilter, setLogFilter] = useState("");

  const idMap = buildRelatedIdMap(messages);
  const sel = messages[selectedIdx] || null;
  const selGroupKey = sel && sel.clOrdID ? idMap[sel.clOrdID] : null;

  const filterLower = logFilter.trim().toLowerCase();
  const filteredMessages = filterLower
    ? messages.filter(m =>
        abbrevMsgType(m.msgTypeName, m.msgType).toLowerCase().includes(filterLower) ||
        (m.msgTypeName || "").toLowerCase().includes(filterLower) ||
        (m.summary || "").toLowerCase().includes(filterLower) ||
        (m.senderCompID || "").toLowerCase().includes(filterLower) ||
        (m.targetCompID || "").toLowerCase().includes(filterLower)
      )
    : messages;

  const cellBase = {
    padding: "5px 6px",
    fontSize: "11px",
    verticalAlign: "middle",
    borderBottom: "1px solid " + t.borderSub,
  };

  return (
    <div style={{ marginTop: "20px", display: "flex", gap: "16px", alignItems: "flex-start" }}>

      {/* ── Left: Log table ── */}
      <div style={{ flex: "0 0 560px", minWidth: "320px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: t.textMuted, whiteSpace: "nowrap" }}>
            TIMELINE · {messages.length} MESSAGES
            {filterLower && filteredMessages.length !== messages.length ? ` · ${filteredMessages.length} shown` : ""}
          </span>
          <input
            value={logFilter}
            onChange={e => setLogFilter(e.target.value)}
            placeholder="Filter type, summary, party…"
            style={{ height: "26px", padding: "0 8px", borderRadius: "6px", fontSize: "11px", border: "1px solid " + t.border, background: t.inputBg, color: t.text, outline: "none", width: "200px", flexShrink: 0 }}
          />
        </div>

        <Card t={t} style={{ overflow: "hidden", padding: 0 }}>
          <div style={{ overflowY: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "32px" }} />  {/* # */}
                <col style={{ width: "90px" }} />  {/* Time */}
                <col style={{ width: "160px" }} /> {/* Type — wider now Direction removed */}
                <col />                            {/* Summary — flex fill */}
                <col style={{ width: "54px" }} />  {/* Δt */}
              </colgroup>
              <thead>
                <tr style={{ background: t.panelAlt, position: "sticky", top: 0, zIndex: 1 }}>
                  {[["#","right"],["Time","left"],["Type","left"],["Summary","left"],["Δt","right"]].map(([label, align]) => (
                    <th key={label} style={{ padding: "5px 8px", fontSize: "10px", fontWeight: 600, color: t.textFaint, textAlign: align, borderBottom: "1px solid " + t.border, letterSpacing: "0.3px" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((m) => {
                  const i = messages.indexOf(m);
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
                      onClick={() => { setSelectedIdx(i); setDetailMode("table"); setTableFilter(""); }}
                      style={{
                        background: rowBg,
                        borderLeft: "3px solid " + (isSel ? t.accent : isRel ? t.yellow : "transparent"),
                        cursor: "pointer",
                        transition: "background 0.08s",
                      }}
                      onMouseEnter={e => { if (!isSel && !isRel) e.currentTarget.style.background = t.panelAlt; }}
                      onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                    >
                      <td style={{ ...cellBase, textAlign: "right", color: t.textFaint, fontFamily: "monospace", paddingRight: "6px" }}>{i + 1}</td>
                      <td style={{ ...cellBase, fontFamily: "monospace", color: t.textMuted, fontSize: "10px", paddingLeft: "8px" }}>{timeStr}</td>
                      <td style={{ ...cellBase, paddingLeft: "8px" }}>
                        <span style={{
                          display: "inline-block", fontSize: "10px", fontWeight: 600,
                          padding: "1px 8px", borderRadius: "20px",
                          background: badge.bg, color: badge.fg, border: "0.5px solid " + badge.border,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "152px",
                        }}>
                          {fullName}
                        </span>
                      </td>
                      <td style={{ ...cellBase, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: "8px" }}>
                        {m.summary}
                      </td>
                      <td style={{ ...cellBase, textAlign: "right", fontFamily: "monospace", color: t.purple, fontSize: "10px", paddingRight: "8px" }}>
                        {timeDelta || "—"}
                      </td>
                    </tr>
                  );
                })}
                {filteredMessages.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: t.textFaint, fontSize: "12px" }}>
                      No messages match "{logFilter}"
                    </td>
                  </tr>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {["table", "walkthrough"].map(v => (
                  <button key={v} onClick={() => setDetailMode(v)} style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "12px", border: "1px solid " + (detailMode === v ? t.accent : t.border), background: detailMode === v ? t.accentBg : t.panel, color: detailMode === v ? t.accent : t.textMuted, cursor: "pointer" }}>
                    {v === "table" ? "Table" : "Walkthrough"}
                  </button>
                ))}
              </div>
              {detailMode === "table" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", maxWidth: "400px" }}>
                  <input ref={filterRef} type="text" value={tableFilter} onChange={e => setTableFilter(e.target.value)} placeholder="🔍 Filter fields… (Press '/' to focus)" style={{ width: "100%", height: "32px", padding: "0 10px", borderRadius: "6px", fontSize: "12px", border: "1px solid " + t.border, background: t.inputBg, color: t.text, outline: "none" }} />
                </div>
              )}
            </div>
            {detailMode === "table" ? (
              <>
                <FieldTable rows={sel.components.header}  sectionKey="header"  t={t} onTagClick={onTagClick} filterText={tableFilter} />
                <FieldTable rows={sel.components.body}    sectionKey="body"    t={t} onTagClick={onTagClick} filterText={tableFilter} />
                <FieldTable rows={sel.components.trailer} sectionKey="trailer" t={t} onTagClick={onTagClick} filterText={tableFilter} />
              </>
            ) : sel.rawMessage ? (
              <Walkthrough result={sel} originalInput={sel.rawMessage} t={t} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Unified Input ────────────────────────────────────────────────────────────
function UnifiedInput({ t, onSingleResult, onLogResult, onClearAll, input, setInput }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const fileRef = useRef(null);

  const isLog = countFixStarts(input) > 1;
  const mode = input.trim() ? (isLog ? "log" : "single") : null;
  const containsSOH = input.includes("\x01");

  const convertSOHToPipes = () => {
    setInput(input.replace(/\x01/g, "|"));
  };

  const handleFile = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (![".txt", ".log"].some(x => f.name.toLowerCase().endsWith(x))) {
      setError("Upload a .txt or .log file"); e.target.value = ""; return;
    }
    const r = new FileReader();
    r.onload = ev => { setInput(ev.target.result); setFileName(f.name); setError(null); };
    r.readAsText(f);
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(null);
    try {
      if (isLog) {
        const res = await fetch(API_LOG, { method: "POST", headers: { "Content-Type": "text/plain" }, body: input });
        const d = await res.json();
        onLogResult(d.messages, input);
      } else {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: input });
        const d = await res.json();
        onSingleResult(d, input);
      }
    } catch (e) {
      setError("Could not reach the backend. If this is the first request in a while, the service may be cold-starting (~30s). Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <Card t={t}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid " + t.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Paste a FIX message or log</div>
            <div style={{ fontSize: "11px", color: t.textMuted, marginTop: "1px" }}>Secure SSL TLS encrypted verification engine</div>
          </div>
          {containsSOH && (
            <button onClick={convertSOHToPipes} style={{ padding: "3px 8px", background: t.yellowBg, color: t.yellow, border: "1px solid " + t.yellow, borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>⚠️ Hidden SOH Detected · Click to Fix</button>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {mode && <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px", background: mode === "log" ? t.purpleBg : t.accentBg, color: mode === "log" ? t.purple : t.accent, border: "1px solid " + (mode === "log" ? t.purple : t.accent) }}>{mode === "log" ? "LOG · " + countFixStarts(input) + " MSG" : "SINGLE MSG"}</span>}
          <Btn t={t} onClick={() => fileRef.current && fileRef.current.click()}>📁 Upload</Btn>
          <input ref={fileRef} type="file" accept=".txt,.log" onChange={handleFile} style={{ display: "none" }} />
          <Btn t={t} onClick={() => { setInput("8=FIX.4.2|9=458|35=W|34=3|49=TT_PRICE|52=20260615-10:25:15.627|56=QALGOMARKET|15=USD|48=14347306835933645772|55=GC|100=XCEC|107=Gold 100 oz|167=FUT|200=202608|205=27|207=CME|262=218888029250001|268=10|269=0|270=43593|271=3|290=1|269=1|270=43598|271=1|290=1|269=Y|270=43591|271=1|290=1|269=Z|270=43603|271=1|290=1|269=B|271=58663|269=x|270=43597|271=1|269=6|270=42388|272=20260612|273=00:00:00|269=4|270=42894|269=7|270=43661|269=8|270=42834|460=2|461=F|541=20260827|18211=M|10=180|"); setFileName(null); setError(null); }}>Sample Group</Btn>
          <Btn t={t} onClick={() => { setInput(["8=FIX.4.4|9=61|35=A|49=EXEC|56=BANZAI|34=1|52=20260613-23:24:06|10=097|","8=FIX.4.4|9=116|35=D|49=BANZAI|56=EXEC|34=2|52=20260613-23:24:42|11=ORD1001|55=MSFT|54=1|38=10000|40=2|44=12.3|10=199|","8=FIX.4.4|9=123|35=8|49=EXEC|56=BANZAI|34=2|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC1|150=0|39=0|55=MSFT|10=233|"].join("\n")); setFileName(null); setError(null); }}>Sample log</Btn>
          {input && <Btn t={t} onClick={() => { setInput(""); setFileName(null); setError(null); onClearAll(); }}>Clear</Btn>}
        </div>
      </div>

      <div style={{ padding: "14px 18px" }}>
        {fileName && <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "8px" }}>📁 {fileName}</div>}
        <textarea value={input} onChange={e => { setInput(e.target.value); setFileName(null); }} rows={5} placeholder="8=FIX.4.4|9=...|35=D|...  — or paste raw production messages containing binary SOH lines" style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "12px", padding: "10px 12px", border: "1px solid " + t.border, borderRadius: "8px", background: t.inputBg, color: t.text, resize: "vertical" }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }} />
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px" }}>
          <PrimaryBtn onClick={handleSubmit} loading={loading} disabled={!input.trim()} t={t}>Parse Data</PrimaryBtn>
          <span style={{ fontSize: "11px", color: t.textMuted }}>🔒 Privacy First: Messages transit encrypted and are never stored or logged on disk.</span>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "6px" }}>
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
export default function App() {
  const [themeName, setThemeName] = useState("dark");
  const t = T[themeName];

  const [textareaInput, setTextareaInput] = useState("");
  const [singleResult, setSingleResult] = useState(null);
  const [singleInput, setSingleInput] = useState("");
  const [logMessages, setLogMessages] = useState(null);
  const [tagPanel, setTagPanel] = useState(null);
  
  const [tableFilter, setTableFilter] = useState("");
  const filterRef = useRef(null);

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

  // Shortcuts Key Handler Focus Shortcut ('/')
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        if (filterRef.current) filterRef.current.focus();
      }
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

  const hasResult = singleResult || logMessages;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; width: 100%; }
        body { background: ${t.page}; display: block !important; }
        #root { max-width: none !important; margin: 0 !important; padding: 0 !important; text-align: left !important; }
      `}</style>

      <div style={{ minHeight: "100vh", background: t.page, color: t.text, fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", width: "100%" }}>
        
        {/* Header */}
        <header style={{ position: "sticky", top: 0, zIndex: 100, background: t.header, borderBottom: "1px solid " + t.border, display: "flex", alignItems: "center", padding: "0 24px", height: "52px", gap: "16px", width: "100%" }}>
          
          {/* Reset Logo Trigger Link */}
          <div onClick={handleHomeReset} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }} title="Return to Homepage">
            <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800, color: "#fff" }}>F</div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: t.text, lineHeight: 1.1 }}><span style={{ color: t.accent }}>FIX</span> Parser</div>
              <div style={{ fontSize: "9px", color: t.textFaint, letterSpacing: "0.5px" }}>PROTOCOL ANALYSIS</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />
          <HeaderTagSearch t={t} onResult={f => setTagPanel(f)} />
          <button onClick={() => setThemeName(n => n === "dark" ? "light" : "dark")} style={{ height: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "12px", border: "1px solid " + t.border, background: "transparent", color: t.textMuted, cursor: "pointer" }}>
            {themeName === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
        </header>

        <main style={{ flex: 1, padding: "24px", width: "100%" }}>
          <UnifiedInput t={t} onSingleResult={handleSingleResult} onLogResult={handleLogResult} onClearAll={handleHomeReset} input={textareaInput} setInput={setTextareaInput} />

          {singleResult && (
            <SingleResult result={singleResult} originalInput={singleInput} t={t} onTagClick={f => setTagPanel(f)} filterRef={filterRef} tableFilter={tableFilter} setTableFilter={setTableFilter} />
          )}
          {logMessages && (
            <SessionResult messages={logMessages} t={t} onTagClick={f => setTagPanel(f)} filterRef={filterRef} tableFilter={tableFilter} setTableFilter={setTableFilter} />
          )}
          {!hasResult && <PopularTagsGrid t={t} onTagClick={f => setTagPanel(f)} />}
        </main>
      </div>

      {tagPanel && <TagPanel field={tagPanel} onClose={() => setTagPanel(null)} t={t} />}
    </>
  );
}

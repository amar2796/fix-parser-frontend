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

// Generates text format copy sequences
function exportFieldsToMarkdown(result) {
  let md = `### FIX Message Analysis (${result.msgTypeName})\n\n| Tag | Field Name | Raw Value | Meaning |\n|---|---|---|---|\n`;
  const allFields = [...result.components.header, ...result.components.body, ...result.components.trailer];
  allFields.forEach(f => {
    md += `| **${f.tag}** | ${f.name} | \`${f.raw}\` | ${f.meaning} |\n`;
  });
  return md;
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
      border: `1px solid ${t ? t.border : "#30363d"}`,
      background: disabled ? (t ? t.panelAlt : "transparent") : (t ? t.panel : "#21262d"),
      color: disabled ? (t ? t.textFaint : "#484f58") : (t ? t.text : "#e6edf3"),
      transition: "border-color 0.15s", ...style,
    }}>{children}</button>
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
      background: t.panel, border: `1px solid ${t.border}`,
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
      background: s.bg, color: s.fg, border: `1px solid ${s.border}`, whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

function ValidationBanner({ result, t }) {
  const ok = result.isValid;
  return (
    <div style={{
      padding: "10px 16px", borderRadius: "8px", marginBottom: "14px",
      background: ok ? t.greenBg : t.redBg,
      border: `1px solid ${ok ? t.green : t.red}`,
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
  let delim = "|";
  if (originalInput.includes("\x01")) delim = "\x01";
  else if (originalInput.includes(";")) delim = ";";
  else if (originalInput.includes("^") && !originalInput.includes("|")) delim = "^";
  const parts = originalInput.split(delim).filter(p => p.length > 0);
  const seq = result.sequence || [];
  return (
    <div style={{
      background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: "8px",
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
          <span key={i} onClick={() => onClickField && onClickField(i)}
            title={field ? `Tag ${field.tag} · ${field.name} = ${field.raw}` : part}
            style={{
              display: "inline-block", padding: "1px 5px", marginRight: "2px",
              borderRadius: "3px", cursor: onClickField ? "pointer" : "default",
              transition: "all 0.15s",
              background: isCurrent ? sc.border : (stepIdx !== null ? "transparent" : sc.bg),
              color: isCurrent ? "#fff" : (stepIdx !== null && !isCurrent ? t.textFaint : sc.text),
              fontWeight: isCurrent ? 700 : 400,
              transform: isCurrent ? "scale(1.06)" : "scale(1)",
            }}
          >{part}</span>
        );
      })}
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

  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "5px 12px", borderRadius: "6px 6px 0 0", background: sc.border,
      }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", letterSpacing: "0.8px" }}>{sc.label}</span>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>{filteredRows.length} of {rows.length} field{rows.length !== 1 ? "s" : ""}</span>
      </div>
      <div style={{ border: `1px solid ${t.border}`, borderTop: "none", borderRadius: "0 0 6px 6px", background: sc.bg, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${t.border}` }}>
              {["Tag", "Field Name", "Raw Value", "Meaning", ""].map((h, i) => (
                <th key={i} style={{ padding: "6px 12px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: t.textMuted, letterSpacing: "0.4px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, i) => (
              <tr key={i} style={{ borderBottom: i < filteredRows.length - 1 ? `1px solid ${t.borderSub}` : "none" }}>
                <td style={{ padding: "7px 12px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "12px", fontWeight: 600, color: sc.text, whiteSpace: "nowrap" }}>{r.tag}</td>
                <td style={{ padding: "7px 12px", fontSize: "13px", color: t.text, whiteSpace: "nowrap" }}>
                  {r.name}
                  {r.isGroupStart && <span style={{ fontSize: "10px", color: t.textFaint, marginLeft: "5px" }}>#{r.groupIndex + 1}</span>}
                  {r.isUnknownTag && <span style={{ fontSize: "10px", color: t.red, marginLeft: "5px" }}>unknown</span>}
                </td>
                <td style={{ padding: "7px 12px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "12px", color: t.textMuted, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.raw}</td>
                <td style={{ padding: "7px 12px", fontSize: "13px", color: t.text }}>{r.meaning}</td>
                <td style={{ padding: "7px 12px" }}>
                  <button onClick={() => onTagClick && onTagClick(r)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: t.accent, padding: "2px 6px", borderRadius: "4px" }}>↗</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <ThemedAnatomyBar result={result} originalInput={originalInput}
        stepIdx={step} onClickField={i => { setPlaying(false); setStep(i); }} t={t} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" }}>
        <span style={{ fontSize: "12px", color: t.textMuted }}>
          Field <strong style={{ color: t.text }}>{step + 1}</strong> of {seq.length}
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <select value={speed} onChange={e => setSpeed(e.target.value)} style={{
            padding: "4px 8px", borderRadius: "6px", fontSize: "12px",
            border: `1px solid ${t.border}`, background: t.panel, color: t.text,
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
        <div style={{ height: "100%", borderRadius: "2px", background: sc.border, width: `${((step + 1) / seq.length) * 100}%`, transition: "width 0.3s ease" }} />
      </div>

      <div style={{
        border: `1px solid ${sc.border}`, borderRadius: "10px", padding: "20px",
        background: sc.bg, opacity: fade ? 1 : 0,
        transform: fade ? "translateY(0)" : "translateY(4px)", transition: "opacity 0.2s, transform 0.2s",
      }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: sc.border, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
          {sc.label} SECTION{cur.isGroupStart ? ` · ENTRY #${cur.groupIndex + 1}` : ""}
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
        <div style={{ borderLeft: `3px solid ${sc.border}`, paddingLeft: "12px", padding: "10px 14px", background: t.panelAlt, borderRadius: "0 8px 8px 0", marginBottom: "10px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: sc.border, letterSpacing: "0.8px", marginBottom: "4px" }}>WHY THIS MATTERS</div>
          <div style={{ fontSize: "13px", color: t.textMuted, lineHeight: 1.6 }}>{cur.why}</div>
        </div>
        {cur.referenceUrl && (
          <a href={cur.referenceUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: "6px", fontSize: "12px", color: t.accent }}>
            View official spec for tag {cur.tag} ↗
          </a>
        )}
      </div>

      <div style={{ display: "flex", gap: "3px", marginTop: "12px", flexWrap: "wrap" }}>
        {seq.map((f, i) => {
          const s2 = sectionOf(f, result);
          const sc2 = t.sections[s2];
          const isAct = i === step;
          return (
            <button key={i} onClick={() => { setPlaying(false); setStep(i); }} title={`${f.tag} ${f.name}`}
              style={{
                width: "26px", height: "26px", fontSize: "9px", borderRadius: "4px",
                border: isAct ? `2px solid ${sc2.border}` : `1px solid ${t.border}`,
                background: isAct ? sc2.border : sc2.bg,
                color: isAct ? "#fff" : t.textMuted, cursor: "pointer",
                fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
                transition: "all 0.1s",
              }}>{f.tag}</button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tag Panel (slide-in from right) ─────────────────────────────────────────
function TagPanel({ field, onClose, t }) {
  if (!field) return null;
  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "380px",
      background: t.panel, borderLeft: `1px solid ${t.border}`,
      boxShadow: t.shadowMd, zIndex: 200,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${t.border}` }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Tag Reference</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.textMuted, fontSize: "20px", lineHeight: 1, padding: "2px 6px" }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "baseline", marginBottom: "20px" }}>
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "40px", fontWeight: 700, color: t.accent, lineHeight: 1 }}>{field.tag}</span>
          <span style={{ fontSize: "22px", fontWeight: 700, color: t.text }}>{field.name}</span>
        </div>
        {field.raw !== undefined && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "6px", letterSpacing: "0.5px" }}>VALUE IN THIS MESSAGE</div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "10px 14px", background: t.panelAlt, border: `1px solid ${t.border}`, borderRadius: "8px" }}>
              <code style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace", fontSize: "14px", color: t.accent }}>{field.raw}</code>
              <span style={{ color: t.textMuted }}>→</span>
              <span style={{ fontSize: "14px", color: t.text, fontWeight: 500 }}>{field.meaning}</span>
            </div>
          </div>
        )}
        {field.why && (
          <div style={{ borderLeft: `3px solid ${t.accent}`, paddingLeft: "14px", padding: "12px 14px", background: t.panelAlt, borderRadius: "0 8px 8px 0", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: t.accent, letterSpacing: "0.8px", marginBottom: "6px" }}>WHY THIS MATTERS</div>
            <div style={{ fontSize: "13px", color: t.textMuted, lineHeight: 1.6 }}>{field.why}</div>
          </div>
        )}
        {field.isUnknownTag && (
          <div style={{ padding: "10px 14px", background: t.redBg, border: `1px solid ${t.red}`, borderRadius: "8px", fontSize: "13px", color: t.red, marginBottom: "16px" }}>
            This tag isn't in our built-in dictionary yet.
          </div>
        )}
        {field.referenceUrl && (
          <a href={field.referenceUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", background: t.accentBg, border: `1px solid ${t.accent}`, color: t.accent, fontSize: "13px", fontWeight: 500, textDecoration: "none" }}>
            View official FIX spec ↗
          </a>
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
      const syn = `8=FIX.4.4|9=10|35=0|${tagNum}=X|10=000|`;
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: syn });
      const d = await res.json();
      const f = d.sequence ? d.sequence.find(f => String(f.tag) === String(tagNum)) : null;
      if (f) onResult(f);
      else onResult({ tag: tagNum, name: "Unknown", why: "Tag not found in dictionary.", isUnknownTag: true, referenceUrl: `https://www.onixs.biz/fix-dictionary/4.4/tagNum_${tagNum}.html` });
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [onResult]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: "10px", fontSize: "12px", color: t.textFaint, pointerEvents: "none" }}>⌗</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { doSearch(query); } }}
          placeholder="Tag lookup…"
          style={{
            paddingLeft: "28px", paddingRight: "10px", height: "32px",
            borderRadius: "6px", fontSize: "12px", width: "140px",
            border: `1px solid ${t.border}`, background: t.inputBg, color: t.text,
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
            outline: "none",
          }}
        />
      </div>
      <button onClick={() => doSearch(query)} disabled={loading || !query.trim()} style={{
        height: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500,
        border: `1px solid ${t.accent}`, background: t.accentBg, color: t.accent,
        cursor: loading || !query.trim() ? "default" : "pointer",
      }}>{loading ? "…" : "Look up"}</button>
    </div>
  );
}

// ─── Single Message Result ────────────────────────────────────────────────────
function SingleResult({ result, originalInput, t, onTagClick }) {
  const [subView, setSubView] = useState("table");
  const [tableFilter, setTableFilter] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const mdContent = exportFieldsToMarkdown(result);
    navigator.clipboard.writeText(mdContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ marginTop: "20px" }}>
      <ThemedAnatomyBar result={result} originalInput={originalInput} t={t} />

      <div style={{ display: "flex", gap: "8px", margin: "12px 0", flexWrap: "wrap" }}>
        {[
          ["Delimiter", result.delimiterDetected === "^" ? "SOH" : result.delimiterDetected],
          ["Fields",    result.totalFields],
          ["Checksum",  `${result.checksum.actual} (calc ${result.checksum.calculated})`],
          ["Body len",  `${result.bodyLength.actual} (calc ${result.bodyLength.calculated})`],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: "7px 12px", background: t.panel, border: `1px solid ${t.border}`, borderRadius: "7px", flex: "1 1 160px" }}>
            <div style={{ fontSize: "10px", color: t.textMuted, letterSpacing: "0.4px", marginBottom: "2px" }}>{k.toUpperCase()}</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: t.text, fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace" }}>{v}</div>
          </div>
        ))}
      </div>

      <ValidationBanner result={result} t={t} />

      {/* Advanced Filter and Control Strip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["table", "walkthrough"].map(v => (
            <button key={v} onClick={() => setSubView(v)} style={{
              padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 500,
              border: `1px solid ${subView === v ? t.accent : t.border}`,
              background: subView === v ? t.accentBg : t.panel,
              color: subView === v ? t.accent : t.textMuted, cursor: "pointer",
            }}>{v === "table" ? "Table" : "Walkthrough"}</button>
          ))}
        </div>

        {subView === "table" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", maxWidth: "400px" }}>
            <input 
              type="text"
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              placeholder="🔍 Filter tags, names, or values..."
              style={{
                width: "100%", height: "32px", padding: "0 10px", borderRadius: "6px", fontSize: "12px",
                border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, outline: "none"
              }}
            />
            <Btn t={t} onClick={handleCopy} style={{ whiteSpace: "nowrap", borderColor: copied ? t.green : t.border, color: copied ? t.green : t.text }}>
              {copied ? "✓ Copied MD" : "📋 Copy Table"}
            </Btn>
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

// ─── Session / Log Result ────────────────────────────────────────────────────
function SessionResult({ messages, t, onTagClick }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailMode, setDetailMode] = useState("table");
  const [tableFilter, setTableFilter] = useState("");
  const [copied, setCopied] = useState(false);

  const idMap = buildRelatedIdMap(messages);
  const sel = messages[selectedIdx] || null;
  const selGroupKey = sel && sel.clOrdID ? idMap[sel.clOrdID] : null;

  const handleCopy = () => {
    if (!sel) return;
    const mdContent = exportFieldsToMarkdown(sel);
    navigator.clipboard.writeText(mdContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ marginTop: "20px", display: "flex", gap: "16px", alignItems: "flex-start" }}>
      <div style={{ flex: "0 0 300px", minWidth: "240px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: t.textMuted, letterSpacing: "0.5px", marginBottom: "8px", padding: "0 2px" }}>
          TIMELINE · {messages.length} MESSAGES
        </div>
        <Card t={t} style={{ overflow: "hidden" }}>
          <div style={{ overflowY: "auto", maxHeight: "70vh" }}>
            {messages.map((m, i) => {
              const isSel = i === selectedIdx;
              const isRel = selGroupKey && m.clOrdID && idMap[m.clOrdID] === selGroupKey && !isSel;
              return (
                <div key={i} onClick={() => { setSelectedIdx(i); setDetailMode("table"); setTableFilter(""); }}
                  style={{
                    padding: "10px 14px", cursor: "pointer",
                    borderBottom: `1px solid ${t.borderSub}`,
                    borderLeft: `3px solid ${isSel ? t.accent : isRel ? t.yellow : "transparent"}`,
                    background: isSel ? t.accentBg : isRel ? t.yellowBg : "transparent",
                    transition: "background 0.1s",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10px", color: t.textFaint, fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace" }}>
                      {m.sendingTime ? m.sendingTime.split("-")[1] : `#${i + 1}`}
                    </span>
                    <span style={{ fontSize: "10px", color: t.textFaint }}>{m.senderCompID}→{m.targetCompID}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Badge text={m.msgTypeName} t={t} />
                    {!m.isValid && <span style={{ fontSize: "10px", color: t.red }}>⚠</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: t.text, fontWeight: 500 }}>{m.summary}</div>
                  {m.clOrdID && (
                    <div style={{ fontSize: "10px", color: t.textFaint, marginTop: "3px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace" }}>
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
        {sel ? (
          <div>
            <ValidationBanner result={sel} t={t} />
            {sel.rawMessage && <div style={{ marginBottom: "12px" }}><ThemedAnatomyBar result={sel} originalInput={sel.rawMessage} t={t} /></div>}
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {["table", "walkthrough"].map(v => (
                  <button key={v} onClick={() => setDetailMode(v)} style={{
                    padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500,
                    border: `1px solid ${detailMode === v ? t.accent : t.border}`,
                    background: detailMode === v ? t.accentBg : t.panel,
                    color: detailMode === v ? t.accent : t.textMuted, cursor: "pointer",
                  }}>{v === "table" ? "Table" : "Walkthrough"}</button>
                ))}
              </div>

              {detailMode === "table" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", maxWidth: "400px" }}>
                  <input 
                    type="text"
                    value={tableFilter}
                    onChange={e => setTableFilter(e.target.value)}
                    placeholder="🔍 Filter tags, names, or values..."
                    style={{
                      width: "100%", height: "32px", padding: "0 10px", borderRadius: "6px", fontSize: "12px",
                      border: `1px solid ${t.border}`, background: t.inputBg, color: t.text, outline: "none"
                    }}
                  />
                  <Btn t={t} onClick={handleCopy} style={{ whiteSpace: "nowrap", borderColor: copied ? t.green : t.border, color: copied ? t.green : t.text }}>
                    {copied ? "✓ Copied MD" : "📋 Copy Table"}
                  </Btn>
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
        ) : (
          <div style={{ padding: "48px", textAlign: "center", color: t.textFaint, fontSize: "13px", border: `1px dashed ${t.border}`, borderRadius: "10px" }}>
            Select a message from the timeline
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Unified Input ────────────────────────────────────────────────────────────
function UnifiedInput({ t, onSingleResult, onLogResult, onClearAll }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const fileRef = useRef(null);

  const isLog = countFixStarts(input) > 1;
  const mode = input.trim() ? (isLog ? "log" : "single") : null;

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
        if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
        const d = await res.json();
        onLogResult(d.messages, input);
      } else {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: input });
        if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
        const d = await res.json();
        onSingleResult(d, input);
      }
    } catch (e) {
      setError(e.message || "Backend may be waking up (cold start ~50s). Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <Card t={t}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Paste a FIX message or log</div>
          <div style={{ fontSize: "11px", color: t.textMuted, marginTop: "1px" }}>
            Single message or multi-message log · delimiter &amp; garbage auto-detected
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {mode && (
            <span style={{
              fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", padding: "3px 8px", borderRadius: "20px",
              background: mode === "log" ? t.purpleBg : t.accentBg,
              color: mode === "log" ? t.purple : t.accent,
              border: `1px solid ${mode === "log" ? t.purple : t.accent}`,
            }}>{mode === "log" ? `LOG · ${countFixStarts(input)} MSG` : "SINGLE MSG"}</span>
          )}
          <Btn t={t} onClick={() => fileRef.current && fileRef.current.click()}>📁 Upload</Btn>
          <input ref={fileRef} type="file" accept=".txt,.log" onChange={handleFile} style={{ display: "none" }} />
          <Btn t={t} onClick={() => { setInput("8=FIX.4.4|9=120|35=D|49=SENDER|56=TARGET|34=12|52=20260613-18:15:00|11=ClOrd123|55=AAPL|54=1|38=100|40=2|44=150.00|60=20260613-18:15:00|10=068|"); setFileName(null); setError(null); }}>Sample</Btn>
          <Btn t={t} onClick={() => { setInput([
            "8=FIX.4.4|9=61|35=A|49=EXEC|56=BANZAI|34=1|52=20260613-23:24:06|98=0|108=30|10=097|",
            "8=FIX.4.4|9=116|35=D|49=BANZAI|56=EXEC|34=2|52=20260613-23:24:42|11=ORD1001|55=MSFT|54=1|38=10000|40=2|44=12.3|60=20260613-23:24:42|10=199|",
            "8=FIX.4.4|9=123|35=8|49=EXEC|56=BANZAI|34=2|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC1|150=0|39=0|55=MSFT|54=1|38=10000|14=0|6=0|10=233|",
            "8=FIX.4.4|9=133|35=8|49=EXEC|56=BANZAI|34=3|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC2|150=2|39=2|55=MSFT|54=1|38=10000|32=10000|31=12.3|14=10000|6=12.3|10=011|",
            "8=FIX.4.4|9=112|35=D|49=BANZAI|56=EXEC|34=4|52=20260613-23:25:12|11=ORD1002|55=SPY|54=1|38=10000|40=2|44=10|60=20260613-23:25:12|10=003|",
            "8=FIX.4.4|9=119|35=8|49=EXEC|56=BANZAI|34=4|52=20260613-23:25:12|37=EXECORD2|11=ORD1002|17=EXEC3|150=0|39=0|55=SPY|54=1|38=10000|14=0|6=0|10=144|",
            "8=FIX.4.4|9=98|35=F|49=BANZAI|56=EXEC|34=5|52=20260613-23:25:16|11=ORD1003|41=ORD1002|55=SPY|54=1|60=20260613-23:25:16|10=078|",
            "8=FIX.4.4|9=86|35=3|49=EXEC|56=BANZAI|34=5|52=20260613-23:25:16|45=5|58=Unsupported message type|372=F|373=3|10=066|",
          ].join("\n")); setFileName(null); setError(null); }}>Sample log</Btn>
          {input && <Btn t={t} onClick={() => { setInput(""); setFileName(null); setError(null); onClearAll(); }}>Clear</Btn>}
        </div>
      </div>

      <div style={{ padding: "14px 18px" }}>
        {fileName && <div style={{ fontSize: "11px", color: t.textMuted, marginBottom: "8px" }}>📁 {fileName}</div>}
        <textarea
          value={input}
          onChange={e => { setInput(e.target.value); setFileName(null); }}
          rows={5}
          placeholder="8=FIX.4.4|9=...|35=D|...  — or paste a multi-message log"
          style={{
            width: "100%", boxSizing: "border-box",
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace",
            fontSize: "12px", padding: "10px 12px",
            border: `1px solid ${t.border}`, borderRadius: "8px",
            background: t.inputBg, color: t.text, resize: "vertical", lineHeight: 1.6,
            outline: "none",
          }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }}
        />
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px" }}>
          <PrimaryBtn onClick={handleSubmit} loading={loading} disabled={!input.trim()} t={t}>
            {mode === "log" ? "Parse log →" : "Parse message →"}
          </PrimaryBtn>
          <span style={{ fontSize: "11px", color: t.textFaint }}>or Ctrl+Enter</span>
          {loading && <span style={{ fontSize: "12px", color: t.textMuted }}>Contacting backend — may take ~50s on first wake…</span>}
        </div>
        {error && (
          <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "8px", background: t.redBg, border: `1px solid ${t.red}`, color: t.red, fontSize: "12px" }}>
            {error}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Popular Tags Quick Reference ─────────────────────────────────────────────
function PopularTagsGrid({ t, onTagClick }) {
  const doLookup = useCallback(async (tagNum) => {
    try {
      const syn = `8=FIX.4.4|9=10|35=0|${tagNum}=X|10=000|`;
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain" }, body: syn });
      const d = await res.json();
      const f = d.sequence ? d.sequence.find(f => String(f.tag) === String(tagNum)) : null;
      if (f) onTagClick(f);
    } catch { /* silent */ }
  }, [onTagClick]);

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: t.textMuted, letterSpacing: "0.5px", marginBottom: "10px" }}>COMMON TAGS — click to look up</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "6px" }}>
        {POPULAR_TAGS.map(([tag, name]) => (
          <button key={tag} onClick={() => doLookup(tag)} style={{
            textAlign: "left", padding: "10px 12px", borderRadius: "8px",
            border: `1px solid ${t.border}`, background: t.panel,
            cursor: "pointer", transition: "border-color 0.15s",
          }}>
            <div style={{ fontSize: "10px", color: t.textFaint, letterSpacing: "0.4px", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace" }}>TAG {tag}</div>
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

  const [singleResult, setSingleResult] = useState(null);
  const [singleInput, setSingleInput] = useState("");
  const [logMessages, setLogMessages] = useState(null);
  const [tagPanel, setTagPanel] = useState(null);

  const handleSingleResult = (result, input) => {
    setSingleResult(result);
    setSingleInput(input);
    setLogMessages(null);
  };

  const handleLogResult = (messages) => {
    setLogMessages(messages);
    setSingleResult(null);
    setSingleInput("");
  };

  const handleClearAll = () => {
    setSingleResult(null);
    setSingleInput("");
    setLogMessages(null);
  };

  const hasResult = singleResult || logMessages;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; width: 100%; }
        body { background: ${t.page}; display: block !important; }
        #root { max-width: none !important; margin: 0 !important; padding: 0 !important; text-align: left !important; }
        button { font-family: inherit; }
        textarea, input, select { font-family: inherit; }
        a { text-decoration: none; }
      `}</style>

      <div style={{
        minHeight: "100vh", background: t.page, color: t.text,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex", flexDirection: "column", width: "100%"
      }}>

        {/* ── Header ── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 100,
          background: t.header, borderBottom: `1px solid ${t.border}`,
          display: "flex", alignItems: "center",
          padding: "0 24px", height: "52px", gap: "16px",
          boxShadow: themeName === "dark" ? "0 1px 0 #30363d" : "0 1px 0 #d0d7de",
          width: "100%"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "6px",
              background: t.accent, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "13px", fontWeight: 800, color: "#fff",
            }}>F</div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: t.text, lineHeight: 1.1 }}>
                <span style={{ color: t.accent }}>FIX</span> Parser
              </div>
              <div style={{ fontSize: "9px", color: t.textFaint, letterSpacing: "0.5px" }}>PROTOCOL ANALYSIS</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />
          <HeaderTagSearch t={t} onResult={f => setTagPanel(f)} />

          <button onClick={() => setThemeName(n => n === "dark" ? "light" : "dark")} style={{
            height: "32px", padding: "0 12px", borderRadius: "6px", fontSize: "12px",
            border: `1px solid ${t.border}`, background: "transparent", color: t.textMuted,
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
          }}>
            <span>{themeName === "dark" ? "☀" : "🌙"}</span>
            {themeName === "dark" ? "Light" : "Dark"}
          </button>
        </header>

        {/* ── Main content ── */}
        <main style={{ flex: 1, padding: "24px", width: "100%", boxSizing: "border-box" }}>
          
          <UnifiedInput 
            t={t} 
            onSingleResult={handleSingleResult} 
            onLogResult={handleLogResult} 
            onClearAll={handleClearAll} 
          />

          {singleResult && (
            <SingleResult result={singleResult} originalInput={singleInput} t={t} onTagClick={f => setTagPanel(f)} />
          )}
          {logMessages && (
            <SessionResult messages={logMessages} t={t} onTagClick={f => setTagPanel(f)} />
          )}

          {!hasResult && (
            <PopularTagsGrid t={t} onTagClick={f => setTagPanel(f)} />
          )}
        </main>
      </div>

      {tagPanel && <TagPanel field={tagPanel} onClose={() => setTagPanel(null)} t={t} />}
    </>
  );
}

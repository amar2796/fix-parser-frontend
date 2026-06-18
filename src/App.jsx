import { useState, useEffect, useRef } from "react";

const BACKEND_URL = "https://fix-parser-backend.onrender.com/api/parse";
const BACKEND_LOG_URL = "https://fix-parser-backend.onrender.com/api/parse-log";

const SPEED_OPTIONS = {
  slow: 3000,
  normal: 1800,
  fast: 800,
};

// ---------- Theme system ----------
const THEMES = {
  dark: {
    bg: "#0f1115",
    panelBg: "#1a1d24",
    panelBgAlt: "#21252e",
    border: "#2c313c",
    text: "#e6e8eb",
    textMuted: "#9a9fa8",
    textFaint: "#6b7280",
    accent: "#4f8ef7",
    inputBg: "#14161b",
    sections: {
      header: { bg: "rgba(79,142,247,0.12)", border: "#4f8ef7", label: "Header", fg: "#8fb8ff" },
      body: { bg: "rgba(67,196,122,0.12)", border: "#43c47a", label: "Body", fg: "#7fe0a8" },
      trailer: { bg: "rgba(240,180,41,0.12)", border: "#f0b429", label: "Trailer", fg: "#f7d178" },
    },
    valid: { bg: "rgba(67,196,122,0.12)", border: "#43c47a", fg: "#7fe0a8" },
    invalid: { bg: "rgba(240,82,82,0.12)", border: "#f05252", fg: "#ff9b9b" },
  },
  light: {
    bg: "#f7f8fa",
    panelBg: "#ffffff",
    panelBgAlt: "#f3f4f6",
    border: "#e2e5ea",
    text: "#1a1d24",
    textMuted: "#5b6270",
    textFaint: "#8a909c",
    accent: "#1976d2",
    inputBg: "#ffffff",
    sections: {
      header: { bg: "#e3f2fd", border: "#1976d2", label: "Header", fg: "#0d47a1" },
      body: { bg: "#e8f5e9", border: "#388e3c", label: "Body", fg: "#1b5e20" },
      trailer: { bg: "#fffde7", border: "#fbc02d", label: "Trailer", fg: "#8d6e00" },
    },
    valid: { bg: "#e8f5e9", border: "#388e3c", fg: "#1b5e20" },
    invalid: { bg: "#ffebee", border: "#e57373", fg: "#b71c1c" },
  },
};

function badgeStyleForMsgType(msgTypeName, theme) {
  const name = (msgTypeName || "").toLowerCase();
  if (theme === "dark") {
    if (name.includes("reject")) return { bg: "rgba(240,82,82,0.15)", fg: "#ff9b9b", border: "#f05252" };
    if (name.includes("cancel")) return { bg: "rgba(240,160,41,0.15)", fg: "#ffc168", border: "#f0a029" };
    if (name.includes("execution") || name.includes("fill")) return { bg: "rgba(67,196,122,0.15)", fg: "#7fe0a8", border: "#43c47a" };
    if (name.includes("new order")) return { bg: "rgba(79,142,247,0.15)", fg: "#8fb8ff", border: "#4f8ef7" };
    if (name.includes("logon") || name.includes("logout") || name.includes("heartbeat") || name.includes("test request")) {
      return { bg: "rgba(186,104,200,0.15)", fg: "#dba8e6", border: "#ba68c8" };
    }
    return { bg: "rgba(144,164,174,0.15)", fg: "#c2ccd1", border: "#90a4ae" };
  }
  if (name.includes("reject")) return { bg: "#ffebee", fg: "#c62828", border: "#e57373" };
  if (name.includes("cancel")) return { bg: "#fff3e0", fg: "#e65100", border: "#ffb74d" };
  if (name.includes("execution") || name.includes("fill")) return { bg: "#e8f5e9", fg: "#2e7d32", border: "#81c784" };
  if (name.includes("new order")) return { bg: "#e3f2fd", fg: "#1565c0", border: "#64b5f6" };
  if (name.includes("logon") || name.includes("logout") || name.includes("heartbeat") || name.includes("test request")) {
    return { bg: "#f3e5f5", fg: "#6a1b9a", border: "#ba68c8" };
  }
  return { bg: "#eceff1", fg: "#37474f", border: "#90a4ae" };
}

function Badge({ text, theme }) {
  const style = badgeStyleForMsgType(text, theme);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: "bold",
        background: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function FieldTable({ rows, sectionKey, t }) {
  const style = t.sections[sectionKey];
  if (!rows || rows.length === 0) return null;

  return (
    <div style={{ marginBottom: "20px" }}>
      <div
        style={{
          background: style.border,
          color: "#fff",
          padding: "6px 12px",
          fontWeight: "bold",
          borderRadius: "6px 6px 0 0",
          fontSize: "13px",
        }}
      >
        {style.label}
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${t.border}`, borderTop: "none", borderRadius: "0 0 6px 6px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: style.bg, minWidth: "500px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${style.border}` }}>
              <th style={{ padding: "8px 10px", color: t.textMuted, fontSize: "12px" }}>Tag</th>
              <th style={{ padding: "8px 10px", color: t.textMuted, fontSize: "12px" }}>Field Name</th>
              <th style={{ padding: "8px 10px", color: t.textMuted, fontSize: "12px" }}>Raw Value</th>
              <th style={{ padding: "8px 10px", color: t.textMuted, fontSize: "12px" }}>Meaning</th>
              <th style={{ padding: "8px 10px", color: t.textMuted, fontSize: "12px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", color: t.text }}>{r.tag}</td>
                <td style={{ padding: "8px 10px", color: t.text }}>
                  {r.name}
                  {r.isGroupStart && (
                    <span style={{ fontSize: "11px", color: t.textFaint, marginLeft: "6px" }}>
                      (group #{r.groupIndex + 1})
                    </span>
                  )}
                  {r.isUnknownTag && (
                    <span style={{ fontSize: "11px", color: t.invalid.fg, marginLeft: "6px" }}>· unrecognized</span>
                  )}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", color: t.text }}>{r.raw}</td>
                <td style={{ padding: "8px 10px", color: t.text }}>{r.meaning}</td>
                <td style={{ padding: "8px 10px" }}>
                  {r.referenceUrl && (
                    <a
                      href={r.referenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "11px", color: t.accent, textDecoration: "none" }}
                    >
                      reference ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sectionOf(field, result) {
  if (result.components.header.some((f) => f.stepIndex === field.stepIndex)) return "header";
  if (result.components.trailer.some((f) => f.stepIndex === field.stepIndex)) return "trailer";
  return "body";
}

function buildRawSegments(originalInput) {
  let delim = "|";
  if (originalInput.includes("\x01")) delim = "\x01";
  else if (originalInput.includes(";")) delim = ";";
  else if (originalInput.includes("^") && !originalInput.includes("|")) delim = "^";
  return originalInput.split(delim).filter((p) => p.length > 0);
}

function MessageBuildupView({ originalInput, seq, stepIdx, result, t }) {
  const rawParts = buildRawSegments(originalInput);

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        background: t.inputBg,
        color: t.textMuted,
        padding: "14px",
        borderRadius: "6px",
        marginBottom: "16px",
        wordBreak: "break-all",
        lineHeight: "1.8",
        border: `1px solid ${t.border}`,
      }}
    >
      {rawParts.map((part, i) => {
        const field = seq[i];
        const section = field ? sectionOf(field, result) : "body";
        const style = t.sections[section];
        const isRevealed = i <= stepIdx;
        const isCurrent = i === stepIdx;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              padding: "2px 4px",
              marginRight: "2px",
              borderRadius: "3px",
              transition: "all 0.25s ease",
              background: isRevealed ? style.border : "transparent",
              color: isRevealed ? "#fff" : t.textFaint,
              fontWeight: isCurrent ? "bold" : "normal",
              transform: isCurrent ? "scale(1.08)" : "scale(1)",
              boxShadow: isCurrent ? `0 0 0 2px ${t.panelBg}, 0 0 8px ${style.border}` : "none",
            }}
          >
            {part}
          </span>
        );
      })}
    </div>
  );
}

function WalkthroughView({ result, originalInput, t }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [fade, setFade] = useState(true);
  const intervalRef = useRef(null);

  const seq = result.sequence;
  const current = seq[stepIdx];
  const section = sectionOf(current, result);
  const style = t.sections[section];

  const goNext = () => setStepIdx((i) => Math.min(i + 1, seq.length - 1));
  const goPrev = () => {
    setIsPlaying(false);
    setStepIdx((i) => Math.max(i - 1, 0));
  };
  const jumpTo = (i) => {
    setIsPlaying(false);
    setStepIdx(i);
  };

  useEffect(() => {
    setFade(false);
    const tmr = setTimeout(() => setFade(true), 30);
    return () => clearTimeout(tmr);
  }, [stepIdx]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setStepIdx((i) => {
          if (i >= seq.length - 1) {
            setIsPlaying(false);
            return i;
          }
          return i + 1;
        });
      }, SPEED_OPTIONS[speed]);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, seq.length]);

  const togglePlay = () => {
    if (stepIdx >= seq.length - 1) setStepIdx(0);
    setIsPlaying((p) => !p);
  };

  return (
    <div>
      <MessageBuildupView originalInput={originalInput} seq={seq} stepIdx={stepIdx} result={result} t={t} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ fontSize: "13px", color: t.textMuted }}>
          Field {stepIdx + 1} of {seq.length}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: "4px", border: `1px solid ${t.border}`, background: t.inputBg, color: t.text }}
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
          <button onClick={togglePlay} style={playBtnStyle(isPlaying, t)}>
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={goPrev} disabled={stepIdx === 0} style={navBtnStyle(stepIdx === 0, t)}>
            ← Prev
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              goNext();
            }}
            disabled={stepIdx === seq.length - 1}
            style={navBtnStyle(stepIdx === seq.length - 1, t)}
          >
            Next →
          </button>
        </div>
      </div>

      <div style={{ height: "6px", background: t.border, borderRadius: "3px", marginBottom: "20px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${((stepIdx + 1) / seq.length) * 100}%`,
            background: style.border,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div
        style={{
          border: `2px solid ${style.border}`,
          borderRadius: "8px",
          padding: "20px",
          background: style.bg,
          opacity: fade ? 1 : 0,
          transform: fade ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.25s ease, transform 0.25s ease",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: "bold", color: style.border, textTransform: "uppercase", marginBottom: "8px" }}>
          {style.label} Section
          {current.isGroupStart && ` · Repeating Group Entry #${current.groupIndex + 1}`}
        </div>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: t.textMuted }}>Tag Number</div>
            <div style={{ fontSize: "28px", fontWeight: "bold", fontFamily: "monospace", color: t.text }}>{current.tag}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: t.textMuted }}>Field Name</div>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: t.text }}>{current.name}</div>
          </div>
        </div>

        <div style={{ marginTop: "16px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: t.textMuted }}>Raw Value</div>
            <div
              style={{
                fontSize: "18px",
                fontFamily: "monospace",
                background: t.panelBg,
                padding: "4px 10px",
                borderRadius: "4px",
                display: "inline-block",
                color: t.text,
                border: `1px solid ${t.border}`,
              }}
            >
              {current.raw}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: t.textMuted }}>Meaning</div>
            <div style={{ fontSize: "18px", color: t.text }}>{current.meaning}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: "18px",
            padding: "12px 14px",
            background: t.panelBg,
            borderRadius: "6px",
            borderLeft: `4px solid ${style.border}`,
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "bold", color: style.border, textTransform: "uppercase", marginBottom: "4px" }}>
            Why this matters
          </div>
          <div style={{ fontSize: "14px", color: t.text, lineHeight: "1.5" }}>{current.why}</div>
        </div>

        {current.referenceUrl && (
          <div style={{ marginTop: "10px" }}>
            <a href={current.referenceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: t.accent }}>
              Look up tag {current.tag} in the official FIX dictionary ↗
            </a>
          </div>
        )}

        {current.isGroupCounter && (
          <div style={{ marginTop: "12px", fontSize: "13px", color: t.textMuted, fontStyle: "italic" }}>
            This field tells the parser how many repeating entries follow.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "4px", marginTop: "16px", flexWrap: "wrap" }}>
        {seq.map((f, i) => {
          const s = sectionOf(f, result);
          const isActive = i === stepIdx;
          return (
            <button
              key={i}
              onClick={() => jumpTo(i)}
              title={`${f.tag} ${f.name}`}
              style={{
                width: "28px",
                height: "28px",
                fontSize: "10px",
                border: isActive ? `2px solid ${t.sections[s].border}` : `1px solid ${t.border}`,
                background: isActive ? t.sections[s].border : t.sections[s].bg,
                color: isActive ? "#fff" : t.text,
                borderRadius: "4px",
                cursor: "pointer",
                fontFamily: "monospace",
                transition: "all 0.15s ease",
              }}
            >
              {f.tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TagSearchView({ t }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearched(true);

    const tagNum = /^\d+$/.test(trimmed) ? trimmed : null;

    if (tagNum) {
      try {
        const synthetic = `8=FIX.4.4|9=10|35=0|${tagNum}=X|10=000|`;
        const res = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: synthetic,
        });
        const data = await res.json();
        const field = data.sequence ? data.sequence.find((f) => String(f.tag) === tagNum) : null;
        if (field) {
          setResults([field]);
        } else {
          setResults([]);
        }
      } catch (e) {
        setResults([]);
      }
    } else {
      setResults([]);
    }
  };

  return (
    <div>
      <p style={{ color: t.textMuted, marginTop: 0 }}>
        Look up any FIX tag by number to see its name, common values, and a link to the official reference —
        no message needed.
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Enter a tag number, e.g. 54"
          style={{
            flex: 1,
            padding: "10px 14px",
            fontSize: "15px",
            borderRadius: "4px",
            border: `1px solid ${t.border}`,
            background: t.inputBg,
            color: t.text,
          }}
        />
        <button onClick={handleSearch} style={primaryBtnStyle(t)}>
          Search
        </button>
      </div>

      {searched && results.length === 0 && (
        <div style={{ marginTop: "16px", color: t.textMuted, fontSize: "14px" }}>
          {/^\d+$/.test(query.trim()) ? (
            <>
              Tag {query.trim()} not found or backend unreachable. You can still check the{" "}
              <a
                href={`https://www.onixs.biz/fix-dictionary/4.4/tagNum_${query.trim()}.html`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: t.accent }}
              >
                official FIX dictionary ↗
              </a>
              .
            </>
          ) : (
            "Please enter a numeric tag number (e.g. 54 for Side)."
          )}
        </div>
      )}

      {results.map((field, i) => (
        <div
          key={i}
          style={{
            marginTop: "20px",
            border: `1px solid ${t.border}`,
            borderRadius: "8px",
            padding: "20px",
            background: t.panelBgAlt,
          }}
        >
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "12px", color: t.textMuted }}>Tag Number</div>
              <div style={{ fontSize: "28px", fontWeight: "bold", fontFamily: "monospace", color: t.text }}>{field.tag}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: t.textMuted }}>Field Name</div>
              <div style={{ fontSize: "22px", fontWeight: "bold", color: t.text }}>{field.name}</div>
            </div>
          </div>
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              background: t.panelBg,
              borderRadius: "6px",
              borderLeft: `4px solid ${t.accent}`,
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: "bold", color: t.accent, textTransform: "uppercase", marginBottom: "4px" }}>
              Why this matters
            </div>
            <div style={{ fontSize: "14px", color: t.text, lineHeight: "1.5" }}>{field.why}</div>
          </div>
          {field.isUnknownTag && (
            <div style={{ marginTop: "10px", fontSize: "13px", color: t.invalid.fg }}>
              This tag isn't in our built-in dictionary yet.
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <a href={field.referenceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: t.accent }}>
              View full official definition ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildRelatedIdMap(messages) {
  const parent = {};
  const find = (x) => {
    if (!(x in parent)) parent[x] = x;
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  messages.forEach((m) => {
    if (m.clOrdID) find(m.clOrdID);
    if (m.origClOrdID) {
      find(m.origClOrdID);
      if (m.clOrdID) union(m.clOrdID, m.origClOrdID);
    }
  });

  const groupKeyForId = {};
  Object.keys(parent).forEach((id) => {
    groupKeyForId[id] = find(id);
  });

  return groupKeyForId;
}

function SessionView({ t }) {
  const [logInput, setLogInput] = useState("");
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [detailMode, setDetailMode] = useState("table");
  const [fileName, setFileName] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const allowedExtensions = [".txt", ".log"];
    const lowerName = file.name.toLowerCase();
    const isAllowed = allowedExtensions.some((ext) => lowerName.endsWith(ext));
    if (!isAllowed) {
      setError("Please upload a .txt or .log file.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      setLogInput(evt.target.result);
      setFileName(file.name);
      setError(null);
      setMessages(null);
      setSelectedIdx(null);
    };
    reader.onerror = () => {
      setError("Could not read that file. Please try again or paste the log text directly.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const loadSample = () => {
    const sample = [
      "8=FIX.4.4|9=61|35=A|49=EXEC|56=BANZAI|34=1|52=20260613-23:24:06|98=0|108=30|10=097|",
      "8=FIX.4.4|9=116|35=D|49=BANZAI|56=EXEC|34=2|52=20260613-23:24:42|11=ORD1001|55=MSFT|54=1|38=10000|40=2|44=12.3|60=20260613-23:24:42|10=199|",
      "8=FIX.4.4|9=123|35=8|49=EXEC|56=BANZAI|34=2|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC1|150=0|39=0|55=MSFT|54=1|38=10000|14=0|6=0|10=233|",
      "8=FIX.4.4|9=133|35=8|49=EXEC|56=BANZAI|34=3|52=20260613-23:24:42|37=EXECORD1|11=ORD1001|17=EXEC2|150=2|39=2|55=MSFT|54=1|38=10000|32=10000|31=12.3|14=10000|6=12.3|10=011|",
      "8=FIX.4.4|9=112|35=D|49=BANZAI|56=EXEC|34=4|52=20260613-23:25:12|11=ORD1002|55=SPY|54=1|38=10000|40=2|44=10|60=20260613-23:25:12|10=003|",
      "8=FIX.4.4|9=119|35=8|49=EXEC|56=BANZAI|34=4|52=20260613-23:25:12|37=EXECORD2|11=ORD1002|17=EXEC3|150=0|39=0|55=SPY|54=1|38=10000|14=0|6=0|10=144|",
      "8=FIX.4.4|9=98|35=F|49=BANZAI|56=EXEC|34=5|52=20260613-23:25:16|11=ORD1003|41=ORD1002|55=SPY|54=1|60=20260613-23:25:16|10=078|",
      "8=FIX.4.4|9=86|35=3|49=EXEC|56=BANZAI|34=5|52=20260613-23:25:16|45=5|58=Unsupported message type|372=F|373=3|10=066|",
    ].join("");
    setLogInput(sample);
  };

  const handleProcess = async () => {
    setLoading(true);
    setError(null);
    setMessages(null);
    setSelectedIdx(null);
    try {
      const res = await fetch(BACKEND_LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: logInput,
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Server error");
      }
      const data = await res.json();
      setMessages(data.messages);
      if (data.messages && data.messages.length > 0) setSelectedIdx(0);
    } catch (err) {
      setError(err.message || "Failed to reach backend. It may be waking up (cold start) — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const groupKeyForId = messages ? buildRelatedIdMap(messages) : {};
  const selectedMsg = messages && selectedIdx !== null ? messages[selectedIdx] : null;
  const selectedGroupKey = selectedMsg && selectedMsg.clOrdID ? groupKeyForId[selectedMsg.clOrdID] : null;

  return (
    <div>
      <p style={{ color: t.textMuted, marginTop: 0 }}>
        Paste a whole log, or upload a <code>.txt</code>/<code>.log</code> file — multiple FIX messages back to
        back. Stray text, timestamps, or blank lines mixed in are automatically ignored.
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={loadSample} style={navBtnStyle(false, t)}>
          Load Sample Data
        </button>
        <button onClick={() => fileInputRef.current && fileInputRef.current.click()} style={navBtnStyle(false, t)}>
          📁 Upload File
        </button>
        <input ref={fileInputRef} type="file" accept=".txt,.log" onChange={handleFileSelect} style={{ display: "none" }} />
        <button
          onClick={() => {
            setLogInput("");
            setMessages(null);
            setSelectedIdx(null);
            setError(null);
            setFileName(null);
          }}
          style={navBtnStyle(false, t)}
        >
          Clear
        </button>
        {fileName && (
          <span style={{ fontSize: "12px", color: t.textMuted }}>
            Loaded: <strong>{fileName}</strong>
          </span>
        )}
      </div>

      <textarea
        value={logInput}
        onChange={(e) => {
          setLogInput(e.target.value);
          if (fileName) setFileName(null);
        }}
        rows={6}
        placeholder="Paste a multi-message FIX log here, click Load Sample Data, or upload a .txt/.log file..."
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: "12px",
          padding: "10px",
          boxSizing: "border-box",
          border: `1px solid ${t.border}`,
          borderRadius: "4px",
          background: t.inputBg,
          color: t.text,
        }}
      />

      <button onClick={handleProcess} disabled={loading || !logInput.trim()} style={primaryBtnStyle(t, loading)}>
        {loading ? "Processing..." : "Process Log"}
      </button>

      {loading && <p style={{ color: t.textMuted, marginTop: "10px" }}>Contacting backend — may take up to 50 seconds if it's waking up from sleep...</p>}

      {error && (
        <div style={{ marginTop: "16px", padding: "12px", background: t.invalid.bg, border: `1px solid ${t.invalid.border}`, borderRadius: "4px", color: t.invalid.fg }}>
          {error}
        </div>
      )}

      {messages && (
        <div style={{ marginTop: "20px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 380px", minWidth: "320px" }}>
            <div style={{ fontWeight: "bold", marginBottom: "8px", color: t.text }}>Timeline · {messages.length} messages</div>
            <div style={{ border: `1px solid ${t.border}`, borderRadius: "6px", maxHeight: "560px", overflowY: "auto" }}>
              {messages.map((m, i) => {
                const isSelected = i === selectedIdx;
                const isRelated = selectedGroupKey !== null && m.clOrdID && groupKeyForId[m.clOrdID] === selectedGroupKey && !isSelected;
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    style={{
                      padding: "10px 12px",
                      borderBottom: `1px solid ${t.border}`,
                      cursor: "pointer",
                      background: isSelected ? t.sections.header.bg : isRelated ? t.sections.trailer.bg : "transparent",
                      borderLeft: isSelected ? `4px solid ${t.accent}` : isRelated ? `4px solid ${t.sections.trailer.border}` : "4px solid transparent",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: t.textFaint, fontFamily: "monospace" }}>{m.sendingTime || `#${i}`}</span>
                      <span style={{ fontSize: "11px", color: t.textFaint }}>
                        {m.senderCompID} → {m.targetCompID}
                      </span>
                    </div>
                    <div style={{ marginBottom: "4px" }}>
                      <Badge text={m.msgTypeName} theme={t === THEMES.dark ? "dark" : "light"} />
                      {!m.isValid && <span style={{ marginLeft: "6px", fontSize: "11px", color: t.invalid.fg, fontWeight: "bold" }}>⚠ invalid</span>}
                    </div>
                    <div style={{ fontSize: "13px", color: t.text }}>{m.summary}</div>
                    {m.clOrdID && (
                      <div style={{ fontSize: "11px", color: t.textFaint, marginTop: "2px", fontFamily: "monospace" }}>
                        ClOrdID: {m.clOrdID}
                        {m.origClOrdID && ` (orig: ${m.origClOrdID})`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ flex: "1 1 420px", minWidth: "320px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontWeight: "bold", color: t.text }}>Detail</div>
              {selectedMsg && (
                <div>
                  <button onClick={() => setDetailMode("table")} style={tabStyle(detailMode === "table", t)}>
                    Table
                  </button>
                  <button onClick={() => setDetailMode("walkthrough")} style={tabStyle(detailMode === "walkthrough", t)}>
                    Walkthrough
                  </button>
                </div>
              )}
            </div>

            {!selectedMsg && (
              <div style={{ color: t.textMuted, fontSize: "13px", padding: "20px", textAlign: "center", border: `1px dashed ${t.border}`, borderRadius: "6px" }}>
                Select a message from the timeline to see its details.
              </div>
            )}

            {selectedMsg && (
              <div>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "4px",
                    marginBottom: "12px",
                    background: selectedMsg.isValid ? t.valid.bg : t.invalid.bg,
                    border: `2px solid ${selectedMsg.isValid ? t.valid.border : t.invalid.border}`,
                    color: selectedMsg.isValid ? t.valid.fg : t.invalid.fg,
                    fontWeight: "bold",
                    fontSize: "13px",
                  }}
                >
                  {selectedMsg.isValid ? "✓ Valid" : "✗ Validation Errors"}
                  {!selectedMsg.isValid && (
                    <ul style={{ marginTop: "6px", fontWeight: "normal", fontSize: "12px" }}>
                      {selectedMsg.validationErrors.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {detailMode === "table" ? (
                  <div style={{ maxHeight: "500px", overflowY: "auto" }}>
                    <FieldTable rows={selectedMsg.components.header} sectionKey="header" t={t} />
                    <FieldTable rows={selectedMsg.components.body} sectionKey="body" t={t} />
                    <FieldTable rows={selectedMsg.components.trailer} sectionKey="trailer" t={t} />
                  </div>
                ) : (
                  <WalkthroughView result={selectedMsg} originalInput={selectedMsg.rawMessage} t={t} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [input, setInput] = useState(
    "8=FIX.4.4|9=120|35=D|49=SENDER|56=TARGET|34=12|52=20260613-18:15:00|11=ClOrd123|55=AAPL|54=1|38=100|40=2|44=150.00|60=20260613-18:15:00|10=068|"
  );
  const [result, setResult] = useState(null);
  const [parsedInput, setParsedInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  const [appMode, setAppMode] = useState("single");
  const [themeName, setThemeName] = useState("dark");

  const t = THEMES[themeName];

  const handleParse = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: input,
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Server error");
      }
      const data = await res.json();
      setResult(data);
      setParsedInput(input);
    } catch (err) {
      setError(err.message || "Failed to reach backend. It may be waking up (cold start) — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: t.bg, minHeight: "100vh", width: "100%", color: t.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          borderBottom: `1px solid ${t.border}`,
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: t.panelBg,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "20px", fontWeight: "bold", color: t.accent }}>FIX Parser</span>
          <span style={{ fontSize: "12px", color: t.textFaint }}>FIX Protocol Message Analysis Tool</span>
        </div>
        <button
          onClick={() => setThemeName(themeName === "dark" ? "light" : "dark")}
          style={{
            padding: "6px 14px",
            borderRadius: "4px",
            border: `1px solid ${t.border}`,
            background: t.panelBgAlt,
            color: t.text,
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          {themeName === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px", width: "100%", boxSizing: "border-box" }}>
        <div style={{ marginBottom: "24px", borderBottom: `1px solid ${t.border}` }}>
          <button onClick={() => setAppMode("single")} style={modeTabStyle(appMode === "single", t)}>
            Single Message
          </button>
          <button onClick={() => setAppMode("session")} style={modeTabStyle(appMode === "session", t)}>
            Session / Log View
          </button>
          <button onClick={() => setAppMode("lookup")} style={modeTabStyle(appMode === "lookup", t)}>
            Tag Lookup
          </button>
        </div>

        {appMode === "session" && <SessionView t={t} />}
        {appMode === "lookup" && <TagSearchView t={t} />}

        {appMode === "single" && (
          <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div
              style={{
                flex: "0 0 380px",
                minWidth: "320px",
                background: t.panelBg,
                border: `1px solid ${t.border}`,
                borderRadius: "10px",
                padding: "20px",
                boxShadow: themeName === "dark" ? "0 1px 3px rgba(0,0,0,0.3)" : "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <p style={{ color: t.textMuted, marginTop: 0, fontSize: "13px" }}>
                Paste a FIX protocol message below. Delimiter (<code>|</code>, SOH, <code>;</code>, <code>^</code>) is auto-detected.
              </p>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={7}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  padding: "10px",
                  boxSizing: "border-box",
                  border: `1px solid ${t.border}`,
                  borderRadius: "6px",
                  background: t.inputBg,
                  color: t.text,
                  resize: "vertical",
                }}
              />

              <button
                onClick={handleParse}
                disabled={loading || !input.trim()}
                style={{ ...primaryBtnStyle(t, loading), width: "100%", boxSizing: "border-box" }}
              >
                {loading ? "Parsing..." : "Parse FIX Message"}
              </button>

              {loading && <p style={{ color: t.textMuted, marginTop: "10px", fontSize: "13px" }}>Contacting backend — may take up to 50 seconds if it's waking up from sleep...</p>}

              {error && (
                <div style={{ marginTop: "16px", padding: "12px", background: t.invalid.bg, border: `1px solid ${t.invalid.border}`, borderRadius: "6px", color: t.invalid.fg, fontSize: "13px" }}>
                  {error}
                </div>
              )}

              {result && (
                <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: `1px solid ${t.border}` }}>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "6px",
                      marginBottom: "12px",
                      background: result.isValid ? t.valid.bg : t.invalid.bg,
                      border: `2px solid ${result.isValid ? t.valid.border : t.invalid.border}`,
                      color: result.isValid ? t.valid.fg : t.invalid.fg,
                      fontWeight: "bold",
                      fontSize: "13px",
                    }}
                  >
                    {result.isValid ? "✓ Valid" : "✗ Errors Found"}
                    {" · "}
                    <span style={{ fontWeight: "normal" }}>{result.msgTypeName}</span>
                    {!result.isValid && (
                      <ul style={{ marginTop: "8px", fontWeight: "normal", paddingLeft: "18px" }}>
                        {result.validationErrors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div style={{ fontSize: "12px", color: t.textMuted, lineHeight: "1.8" }}>
                    <div>
                      <strong style={{ color: t.text }}>Delimiter:</strong>{" "}
                      <code>{result.delimiterDetected === "^" ? "SOH (\\x01)" : result.delimiterDetected}</code>
                    </div>
                    <div>
                      <strong style={{ color: t.text }}>CheckSum:</strong> {result.checksum.calculated} (calc) / {result.checksum.actual} (actual)
                    </div>
                    <div>
                      <strong style={{ color: t.text }}>BodyLength:</strong> {result.bodyLength.calculated} (calc) / {result.bodyLength.actual} (actual)
                    </div>
                    <div>
                      <strong style={{ color: t.text }}>Total Fields:</strong> {result.totalFields}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: "1 1 520px", minWidth: "320px" }}>
              {!result && (
                <div
                  style={{
                    border: `1px dashed ${t.border}`,
                    borderRadius: "10px",
                    padding: "60px 24px",
                    textAlign: "center",
                    color: t.textFaint,
                  }}
                >
                  Parsed results will appear here once you parse a message.
                </div>
              )}

              {result && (
                <div>
                  <div style={{ marginBottom: "16px" }}>
                    <button onClick={() => setViewMode("table")} style={tabStyle(viewMode === "table", t)}>
                      Table View
                    </button>
                    <button onClick={() => setViewMode("walkthrough")} style={tabStyle(viewMode === "walkthrough", t)}>
                      Step-by-Step Walkthrough
                    </button>
                  </div>

                  {viewMode === "table" ? (
                    <>
                      <FieldTable rows={result.components.header} sectionKey="header" t={t} />
                      <FieldTable rows={result.components.body} sectionKey="body" t={t} />
                      <FieldTable rows={result.components.trailer} sectionKey="trailer" t={t} />
                    </>
                  ) : (
                    <WalkthroughView result={result} originalInput={parsedInput} t={t} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function modeTabStyle(active, t) {
  return {
    padding: "10px 20px",
    marginRight: "8px",
    border: "none",
    borderBottom: active ? `3px solid ${t.accent}` : "3px solid transparent",
    background: "transparent",
    color: active ? t.accent : t.textMuted,
    cursor: "pointer",
    fontWeight: active ? "bold" : "normal",
    fontSize: "15px",
  };
}

function tabStyle(active, t) {
  return {
    padding: "8px 16px",
    marginRight: "8px",
    border: active ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
    background: active ? t.accent : t.panelBgAlt,
    color: active ? "#fff" : t.text,
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: active ? "bold" : "normal",
  };
}

function navBtnStyle(disabled, t) {
  return {
    padding: "6px 14px",
    border: `1px solid ${t.border}`,
    background: disabled ? t.panelBgAlt : t.panelBg,
    color: disabled ? t.textFaint : t.text,
    borderRadius: "4px",
    cursor: disabled ? "default" : "pointer",
  };
}

function playBtnStyle(isPlaying, t) {
  return {
    padding: "6px 16px",
    border: "none",
    background: isPlaying ? t.invalid.border : t.valid.border,
    color: "#fff",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  };
}

function primaryBtnStyle(t, loading) {
  return {
    marginTop: "10px",
    padding: "10px 24px",
    fontSize: "15px",
    fontWeight: "bold",
    background: loading ? t.textFaint : t.accent,
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: loading ? "default" : "pointer",
  };
}

export default App;

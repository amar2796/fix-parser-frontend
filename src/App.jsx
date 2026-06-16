import { useState, useEffect, useRef } from "react";

const BACKEND_URL = "https://fix-parser-backend.onrender.com/api/parse";

const SECTION_STYLES = {
  header: { bg: "#e3f2fd", border: "#1976d2", label: "Header" },
  body: { bg: "#e8f5e9", border: "#388e3c", label: "Body" },
  trailer: { bg: "#fffde7", border: "#fbc02d", label: "Trailer" },
};

const SPEED_OPTIONS = {
  slow: 3000,
  normal: 1800,
  fast: 800,
};

function FieldTable({ rows, sectionKey }) {
  const style = SECTION_STYLES[sectionKey];
  if (!rows || rows.length === 0) return null;

  return (
    <div style={{ marginBottom: "20px" }}>
      <div
        style={{
          background: style.border,
          color: "#fff",
          padding: "6px 12px",
          fontWeight: "bold",
          borderRadius: "4px 4px 0 0",
        }}
      >
        {style.label}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: style.bg, minWidth: "500px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${style.border}` }}>
              <th style={{ padding: "6px 10px" }}>Tag</th>
              <th style={{ padding: "6px 10px" }}>Field Name</th>
              <th style={{ padding: "6px 10px" }}>Raw Value</th>
              <th style={{ padding: "6px 10px" }}>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{r.tag}</td>
                <td style={{ padding: "6px 10px" }}>
                  {r.name}
                  {r.isGroupStart && (
                    <span style={{ fontSize: "11px", color: "#888", marginLeft: "6px" }}>
                      (group #{r.groupIndex + 1})
                    </span>
                  )}
                </td>
                <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{r.raw}</td>
                <td style={{ padding: "6px 10px" }}>{r.meaning}</td>
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

// Builds the raw FIX string with each field's character range, so we can highlight
// the portion already "revealed" as the user steps through.
function buildRawSegments(originalInput, seq, delimDisplay) {
  // We reconstruct segments by re-splitting on the detected delimiter character
  // present in the original input (best effort — falls back gracefully).
  let delim = "|";
  if (originalInput.includes("\x01")) delim = "\x01";
  else if (originalInput.includes(";")) delim = ";";
  else if (originalInput.includes("^") && !originalInput.includes("|")) delim = "^";
  else if (originalInput.includes("|")) delim = "|";

  const rawParts = originalInput.split(delim).filter((p) => p.length > 0);
  return rawParts; // one string per field, in order, like "8=FIX.4.4"
}

function MessageBuildupView({ originalInput, seq, stepIdx, result }) {
  const rawParts = buildRawSegments(originalInput, seq);

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        background: "#1e1e1e",
        color: "#ddd",
        padding: "14px",
        borderRadius: "6px",
        marginBottom: "16px",
        wordBreak: "break-all",
        lineHeight: "1.8",
      }}
    >
      {rawParts.map((part, i) => {
        const field = seq[i];
        const section = field ? sectionOf(field, result) : "body";
        const style = SECTION_STYLES[section];
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
              color: isRevealed ? "#fff" : "#555",
              fontWeight: isCurrent ? "bold" : "normal",
              transform: isCurrent ? "scale(1.08)" : "scale(1)",
              boxShadow: isCurrent ? `0 0 0 2px #fff, 0 0 8px ${style.border}` : "none",
            }}
          >
            {part}
          </span>
        );
      })}
    </div>
  );
}

function WalkthroughView({ result, originalInput }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const [fade, setFade] = useState(true);
  const intervalRef = useRef(null);

  const seq = result.sequence;
  const current = seq[stepIdx];
  const section = sectionOf(current, result);
  const style = SECTION_STYLES[section];

  const goNext = () => setStepIdx((i) => Math.min(i + 1, seq.length - 1));
  const goPrev = () => {
    setIsPlaying(false);
    setStepIdx((i) => Math.max(i - 1, 0));
  };
  const jumpTo = (i) => {
    setIsPlaying(false);
    setStepIdx(i);
  };

  // Trigger fade animation whenever step changes
  useEffect(() => {
    setFade(false);
    const t = setTimeout(() => setFade(true), 30);
    return () => clearTimeout(t);
  }, [stepIdx]);

  // Auto-play loop
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
      <MessageBuildupView originalInput={originalInput} seq={seq} stepIdx={stepIdx} result={result} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ fontSize: "13px", color: "#666" }}>
          Field {stepIdx + 1} of {seq.length}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
          <button onClick={togglePlay} style={playBtnStyle(isPlaying)}>
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={goPrev} disabled={stepIdx === 0} style={navBtnStyle(stepIdx === 0)}>
            ← Prev
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              goNext();
            }}
            disabled={stepIdx === seq.length - 1}
            style={navBtnStyle(stepIdx === seq.length - 1)}
          >
            Next →
          </button>
        </div>
      </div>

      <div style={{ height: "6px", background: "#eee", borderRadius: "3px", marginBottom: "20px", overflow: "hidden" }}>
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
          {SECTION_STYLES[section].label} Section
          {current.isGroupStart && ` · Repeating Group Entry #${current.groupIndex + 1}`}
        </div>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#777" }}>Tag Number</div>
            <div style={{ fontSize: "28px", fontWeight: "bold", fontFamily: "monospace" }}>{current.tag}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#777" }}>Field Name</div>
            <div style={{ fontSize: "22px", fontWeight: "bold" }}>{current.name}</div>
          </div>
        </div>

        <div style={{ marginTop: "16px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#777" }}>Raw Value</div>
            <div
              style={{
                fontSize: "18px",
                fontFamily: "monospace",
                background: "#fff",
                padding: "4px 10px",
                borderRadius: "4px",
                display: "inline-block",
              }}
            >
              {current.raw}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#777" }}>Meaning</div>
            <div style={{ fontSize: "18px" }}>{current.meaning}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: "18px",
            padding: "12px 14px",
            background: "rgba(255,255,255,0.7)",
            borderRadius: "6px",
            borderLeft: `4px solid ${style.border}`,
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "bold", color: style.border, textTransform: "uppercase", marginBottom: "4px" }}>
            Why this matters
          </div>
          <div style={{ fontSize: "14px", color: "#333", lineHeight: "1.5" }}>{current.why}</div>
        </div>

        {current.isGroupCounter && (
          <div style={{ marginTop: "12px", fontSize: "13px", color: "#555", fontStyle: "italic" }}>
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
                border: isActive ? `2px solid ${SECTION_STYLES[s].border}` : "1px solid #ccc",
                background: isActive ? SECTION_STYLES[s].border : SECTION_STYLES[s].bg,
                color: isActive ? "#fff" : "#333",
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

function App() {
  const [input, setInput] = useState(
    "8=FIX.4.4|9=120|35=D|49=SENDER|56=TARGET|34=12|52=20260613-18:15:00|11=ClOrd123|55=AAPL|54=1|38=100|40=2|44=150.00|60=20260613-18:15:00|10=068|"
  );
  const [result, setResult] = useState(null);
  const [parsedInput, setParsedInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("table");

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
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "4px" }}>FIX Message Parser</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Paste a FIX protocol message below. Delimiter (<code>|</code>, SOH, <code>;</code>, <code>^</code>) is auto-detected.
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={5}
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: "13px",
          padding: "10px",
          boxSizing: "border-box",
          border: "1px solid #ccc",
          borderRadius: "4px",
        }}
      />

      <button
        onClick={handleParse}
        disabled={loading || !input.trim()}
        style={{
          marginTop: "10px",
          padding: "10px 24px",
          fontSize: "15px",
          fontWeight: "bold",
          background: loading ? "#aaa" : "#1976d2",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Parsing..." : "Parse FIX Message"}
      </button>

      {loading && (
        <p style={{ color: "#888", marginTop: "10px" }}>
          Contacting backend — may take up to 50 seconds if it's waking up from sleep...
        </p>
      )}

      {error && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            background: "#ffebee",
            border: "1px solid #e57373",
            borderRadius: "4px",
            color: "#c62828",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "24px" }}>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "4px",
              marginBottom: "16px",
              background: result.isValid ? "#e8f5e9" : "#ffebee",
              border: `2px solid ${result.isValid ? "#388e3c" : "#e57373"}`,
              color: result.isValid ? "#2e7d32" : "#c62828",
              fontWeight: "bold",
            }}
          >
            {result.isValid ? "✓ Valid FIX Message" : "✗ Validation Errors Found"}
            {" · "}
            <span style={{ fontWeight: "normal" }}>{result.msgTypeName}</span>
            {!result.isValid && (
              <ul style={{ marginTop: "8px", fontWeight: "normal" }}>
                {result.validationErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: "flex", gap: "16px", marginBottom: "16px", fontSize: "13px", color: "#555", flexWrap: "wrap" }}>
            <div>
              <strong>Delimiter:</strong>{" "}
              <code>{result.delimiterDetected === "^" ? "SOH (\\x01)" : result.delimiterDetected}</code>
            </div>
            <div>
              <strong>CheckSum:</strong> calculated {result.checksum.calculated}, actual {result.checksum.actual}
            </div>
            <div>
              <strong>BodyLength:</strong> calculated {result.bodyLength.calculated}, actual {result.bodyLength.actual}
            </div>
            <div>
              <strong>Total Fields:</strong> {result.totalFields}
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <button onClick={() => setViewMode("table")} style={tabStyle(viewMode === "table")}>
              Table View
            </button>
            <button onClick={() => setViewMode("walkthrough")} style={tabStyle(viewMode === "walkthrough")}>
              Step-by-Step Walkthrough
            </button>
          </div>

          {viewMode === "table" ? (
            <>
              <FieldTable rows={result.components.header} sectionKey="header" />
              <FieldTable rows={result.components.body} sectionKey="body" />
              <FieldTable rows={result.components.trailer} sectionKey="trailer" />
            </>
          ) : (
            <WalkthroughView result={result} originalInput={parsedInput} />
          )}
        </div>
      )}
    </div>
  );
}

function tabStyle(active) {
  return {
    padding: "8px 16px",
    marginRight: "8px",
    border: active ? "2px solid #1976d2" : "1px solid #ccc",
    background: active ? "#1976d2" : "#fff",
    color: active ? "#fff" : "#333",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: active ? "bold" : "normal",
  };
}

function navBtnStyle(disabled) {
  return {
    padding: "6px 14px",
    border: "1px solid #ccc",
    background: disabled ? "#f0f0f0" : "#fff",
    color: disabled ? "#aaa" : "#333",
    borderRadius: "4px",
    cursor: disabled ? "default" : "pointer",
  };
}

function playBtnStyle(isPlaying) {
  return {
    padding: "6px 16px",
    border: "none",
    background: isPlaying ? "#e57373" : "#388e3c",
    color: "#fff",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  };
}

export default App;

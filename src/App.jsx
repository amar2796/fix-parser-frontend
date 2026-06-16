import { useState } from "react";

const BACKEND_URL = "https://fix-parser-backend.onrender.com/api/parse";

const SECTION_STYLES = {
  header: { bg: "#e3f2fd", border: "#1976d2", label: "Header" },
  body: { bg: "#e8f5e9", border: "#388e3c", label: "Body" },
  trailer: { bg: "#fffde7", border: "#fbc02d", label: "Trailer" },
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

function WalkthroughView({ result }) {
  const [stepIdx, setStepIdx] = useState(0);
  const seq = result.sequence;
  const current = seq[stepIdx];
  const section = sectionOf(current, result);
  const style = SECTION_STYLES[section];

  const goNext = () => setStepIdx((i) => Math.min(i + 1, seq.length - 1));
  const goPrev = () => setStepIdx((i) => Math.max(i - 1, 0));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "13px", color: "#666" }}>
          Field {stepIdx + 1} of {seq.length}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={goPrev} disabled={stepIdx === 0} style={navBtnStyle(stepIdx === 0)}>
            ← Prev
          </button>
          <button onClick={goNext} disabled={stepIdx === seq.length - 1} style={navBtnStyle(stepIdx === seq.length - 1)}>
            Next →
          </button>
        </div>
      </div>

      {/* progress bar */}
      <div style={{ height: "6px", background: "#eee", borderRadius: "3px", marginBottom: "20px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${((stepIdx + 1) / seq.length) * 100}%`,
            background: style.border,
            transition: "width 0.2s ease",
          }}
        />
      </div>

      <div
        style={{
          border: `2px solid ${style.border}`,
          borderRadius: "8px",
          padding: "20px",
          background: style.bg,
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
            <div style={{ fontSize: "18px", fontFamily: "monospace", background: "#fff", padding: "4px 10px", borderRadius: "4px", display: "inline-block" }}>
              {current.raw}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#777" }}>Meaning</div>
            <div style={{ fontSize: "18px" }}>{current.meaning}</div>
          </div>
        </div>

        {current.isGroupCounter && (
          <div style={{ marginTop: "16px", fontSize: "13px", color: "#555", fontStyle: "italic" }}>
            This field tells the parser how many repeating entries follow.
          </div>
        )}
      </div>

      {/* mini timeline of all fields, click to jump */}
      <div style={{ display: "flex", gap: "4px", marginTop: "16px", flexWrap: "wrap" }}>
        {seq.map((f, i) => {
          const s = sectionOf(f, result);
          const isActive = i === stepIdx;
          return (
            <button
              key={i}
              onClick={() => setStepIdx(i)}
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("table"); // "table" or "walkthrough"

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
            <button
              onClick={() => setViewMode("table")}
              style={tabStyle(viewMode === "table")}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode("walkthrough")}
              style={tabStyle(viewMode === "walkthrough")}
            >
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
            <WalkthroughView result={result} />
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

export default App;

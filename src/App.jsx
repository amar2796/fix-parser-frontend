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
      <table style={{ width: "100%", borderCollapse: "collapse", background: style.bg }}>
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
              <td style={{ padding: "6px 10px" }}>{r.name}</td>
              <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{r.raw}</td>
              <td style={{ padding: "6px 10px" }}>{r.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [input, setInput] = useState(
    "8=FIX.4.4|9=99|35=D|49=SENDER|56=TARGET|34=12|52=20260613-18:15:00|11=ClOrd123|55=AAPL|54=1|38=100|40=2|44=150.00|10=160|"
  );
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
            {!result.isValid && (
              <ul style={{ marginTop: "8px", fontWeight: "normal" }}>
                {result.validationErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: "flex", gap: "16px", marginBottom: "16px", fontSize: "13px", color: "#555" }}>
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
          </div>

          <FieldTable rows={result.components.header} sectionKey="header" />
          <FieldTable rows={result.components.body} sectionKey="body" />
          <FieldTable rows={result.components.trailer} sectionKey="trailer" />
        </div>
      )}
    </div>
  );
}

export default App;

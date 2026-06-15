import { useState } from "react";

function App() {
  const [result, setResult] = useState(null);

  const testBackend = async () => {
    const res = await fetch("https://fix-parser-backend.onrender.com/api/parse", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "8=FIX.4.4|9=112|35=D|"
    });
    const data = await res.json();
    setResult(data);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>FIX Parser - Test</h1>
      <button onClick={testBackend}>Test Backend</button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}

export default App;

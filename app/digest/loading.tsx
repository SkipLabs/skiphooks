import "./digest.css";

export default function Loading() {
  return (
    <div className="dig-page">
      <main className="dig-container">
        <div className="dig-header">
          <h1 className="dig-title">
            <span>skiphooks</span> / digest
          </h1>
          <span className="dig-subtitle">weekly cross-group summary</span>
        </div>
        <div className="loading-skeleton" style={{ height: "12rem", borderRadius: "6px" }} />
      </main>
    </div>
  );
}

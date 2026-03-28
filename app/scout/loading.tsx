import "./scout.css";

export default function Loading() {
  return (
    <div className="cfg-page">
      <main className="cfg-container">
        <div className="cfg-header">
          <h1 className="cfg-title">
            <span>skiphooks</span> / scout
          </h1>
          <span className="cfg-subtitle">reddit dashboard</span>
        </div>
        <div className="loading-skeleton" style={{ height: "4rem", marginBottom: "1rem", borderRadius: "6px" }} />
        <div className="loading-skeleton" style={{ height: "3rem", marginBottom: "1rem", borderRadius: "6px" }} />
        <div className="loading-skeleton" style={{ height: "8rem", borderRadius: "6px" }} />
      </main>
    </div>
  );
}

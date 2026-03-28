import "./summary.css";

export default function Loading() {
  return (
    <div className="sum-page">
      <main className="sum-container">
        <div className="sum-header">
          <h1 className="sum-title">
            <span>skiphooks</span> / summary
          </h1>
          <span className="sum-subtitle">weekly digest</span>
        </div>
        <div className="loading-skeleton" style={{ height: "12rem", borderRadius: "6px" }} />
      </main>
    </div>
  );
}

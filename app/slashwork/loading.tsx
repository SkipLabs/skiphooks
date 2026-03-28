import "./slashwork.css";

export default function Loading() {
  return (
    <div className="sw-page">
      <main className="sw-container">
        <div className="sw-header">
          <h1 className="sw-title">
            <span>skiphooks</span> / slashwork
          </h1>
          <span className="sw-subtitle">database state</span>
        </div>
        <div className="loading-skeleton" style={{ height: "2.5rem", marginBottom: "1.5rem" }} />
        <div className="sw-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="sw-section">
              <div className="sw-section-header">
                <div className="loading-skeleton" style={{ height: "0.75rem", width: "6rem" }} />
              </div>
              <div className="loading-skeleton" style={{ height: "5rem", margin: "0.875rem" }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

import { Suspense } from "react";
import { getUserMappings } from "@/src/db";
import MappingsClient from "./mappings-client";
import "./mappings.css";

export const dynamic = "force-dynamic";

async function MappingsSection() {
  const mappings = await getUserMappings();
  return <MappingsClient initialMappings={mappings} />;
}

function SectionSkeleton() {
  return (
    <div className="map-section">
      <div className="map-section-header">
        <div className="map-skeleton" style={{ height: "0.75rem", width: "6rem" }} />
      </div>
      <div className="map-skeleton map-skeleton--table" />
    </div>
  );
}

export default function MappingsPage() {
  return (
    <div className="map-page">
      <main className="map-container">
        <div className="map-header">
          <h1 className="map-title">
            <span>skiphooks</span> / mappings
          </h1>
          <span className="map-subtitle">github → slashwork usernames</span>
        </div>

        <Suspense fallback={<SectionSkeleton />}>
          <MappingsSection />
        </Suspense>
      </main>
    </div>
  );
}

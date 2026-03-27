import type {
  SkipService,
  Context,
  EagerCollection,
  Resource,
  Json,
} from "@skipruntime/core";
import { postgresExternalService } from "./postgres-adapter";

type DbSlashworkGroup = {
  slashwork_id: string;
  name: string;
  discovered_at: string;
  last_seen_at: string;
};

type ServiceInputs = {
  [key: string]: never;
};

type ServiceOutputs = {
  slashworkGroups: EagerCollection<string, DbSlashworkGroup>;
};

class DiscoveredGroupsResource implements Resource<ServiceOutputs> {
  constructor(_params: Json) {}

  instantiate(
    collections: ServiceOutputs,
    _context: Context,
  ): EagerCollection<string, DbSlashworkGroup> {
    return collections.slashworkGroups;
  }
}

export const skipService: SkipService<ServiceInputs, ServiceOutputs> = {
  externalServices: {
    postgres: postgresExternalService,
  },

  resources: {
    discoveredGroups: DiscoveredGroupsResource,
  },

  initialData: {},

  createGraph(
    _inputs: ServiceInputs,
    context: Context,
  ): ServiceOutputs {
    const slashworkGroups = context.useExternalResource<string, DbSlashworkGroup>({
      service: "postgres",
      identifier: "slashwork_groups",
      params: { key: { col: "slashwork_id", type: "TEXT" } },
    });

    return { slashworkGroups };
  },
};

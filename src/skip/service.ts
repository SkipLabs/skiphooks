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

type DbAuthToken = {
  name: string;
  token: string;
};

type DbGroup = {
  name: string;
  slashwork_id: string;
  auth_token: string;
};

type DbRoute = {
  name: string;
  group_name: string | null;
  stream_id: string | null;
  auth_token: string | null;
};

type ServiceInputs = {
  [key: string]: never;
};

type ServiceOutputs = {
  slashworkGroups: EagerCollection<string, DbSlashworkGroup>;
  authTokens: EagerCollection<string, DbAuthToken>;
  groups: EagerCollection<string, DbGroup>;
  routes: EagerCollection<string, DbRoute>;
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

class AuthTokensResource implements Resource<ServiceOutputs> {
  constructor(_params: Json) {}

  instantiate(
    collections: ServiceOutputs,
    _context: Context,
  ): EagerCollection<string, DbAuthToken> {
    return collections.authTokens;
  }
}

class GroupsResource implements Resource<ServiceOutputs> {
  constructor(_params: Json) {}

  instantiate(
    collections: ServiceOutputs,
    _context: Context,
  ): EagerCollection<string, DbGroup> {
    return collections.groups;
  }
}

class RoutesResource implements Resource<ServiceOutputs> {
  constructor(_params: Json) {}

  instantiate(
    collections: ServiceOutputs,
    _context: Context,
  ): EagerCollection<string, DbRoute> {
    return collections.routes;
  }
}

export const skipService: SkipService<ServiceInputs, ServiceOutputs> = {
  externalServices: {
    postgres: postgresExternalService,
  },

  resources: {
    discoveredGroups: DiscoveredGroupsResource,
    authTokens: AuthTokensResource,
    groups: GroupsResource,
    routes: RoutesResource,
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

    const authTokens = context.useExternalResource<string, DbAuthToken>({
      service: "postgres",
      identifier: "auth_tokens",
      params: { key: { col: "name", type: "TEXT" } },
    });

    const groups = context.useExternalResource<string, DbGroup>({
      service: "postgres",
      identifier: "groups",
      params: { key: { col: "name", type: "TEXT" } },
    });

    const routes = context.useExternalResource<string, DbRoute>({
      service: "postgres",
      identifier: "routes",
      params: { key: { col: "name", type: "TEXT" } },
    });

    return { slashworkGroups, authTokens, groups, routes };
  },
};

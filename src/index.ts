#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as gtm from "./gtm-client.js";
import {
  CreateTagSchema,
  CreateTriggerSchema,
  CreateVariableSchema,
  UpdateTagSchema,
  UpdateTriggerSchema,
  UpdateVariableSchema,
  readLocationScope,
  writeLocationScope,
} from "./schemas.js";

const server = new McpServer({ name: "gtm-mcp-server", version: "0.2.0" });
const outputSchema = { data: z.unknown() };

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
const additive = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};
const mutating = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: { data },
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

async function run<T>(operation: () => Promise<T>) {
  try {
    return json(await operation());
  } catch (error) {
    return errorResult(error);
  }
}

server.registerTool(
  "gtm_list_accounts",
  {
    description: "List every GTM account accessible to the authenticated Google user.",
    outputSchema,
    annotations: readOnly,
  },
  async () => run(() => gtm.listAccounts())
);

server.registerTool(
  "gtm_list_containers",
  {
    description: "List every container in a GTM account.",
    inputSchema: { account: readLocationScope.account },
    outputSchema,
    annotations: readOnly,
  },
  async ({ account }) => run(() => gtm.listContainers(account))
);

server.registerTool(
  "gtm_list_workspaces",
  {
    description: "List every workspace in a GTM container.",
    inputSchema: { account: readLocationScope.account, container: readLocationScope.container },
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container }) => run(() => gtm.listWorkspaces(account, container))
);

server.registerTool(
  "gtm_create_workspace",
  {
    description: "Create a dedicated GTM workspace. Prefer this before making automated changes.",
    inputSchema: {
      account: readLocationScope.account,
      container: readLocationScope.container,
      name: z.string().trim().min(1),
      description: z.string().optional(),
    },
    outputSchema,
    annotations: additive,
  },
  async ({ account, container, name, description }) =>
    run(() => gtm.createWorkspace(account, container, { name, description }))
);

server.registerTool(
  "gtm_workspace_status",
  {
    description: "Show modified entities and merge conflicts in a workspace.",
    inputSchema: readLocationScope,
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container, workspace }) =>
    run(() => gtm.getWorkspaceStatus(account, container, workspace))
);

server.registerTool(
  "gtm_sync_workspace",
  {
    description:
      "Sync a workspace with the latest container version. This can modify workspace entities and reveal conflicts.",
    inputSchema: writeLocationScope,
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace }) =>
    run(() => gtm.syncWorkspace(account, container, workspace))
);

server.registerTool(
  "gtm_quick_preview_workspace",
  {
    description:
      "Compile a workspace into a temporary preview and report compiler/sync errors. It never publishes the container.",
    inputSchema: writeLocationScope,
    outputSchema,
    annotations: additive,
  },
  async ({ account, container, workspace }) =>
    run(() => gtm.quickPreviewWorkspace(account, container, workspace))
);

// ---- Tags ----

server.registerTool(
  "gtm_list_tags",
  {
    description: "List every tag in a workspace draft, following all result pages.",
    inputSchema: readLocationScope,
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container, workspace }) => run(() => gtm.listTags(account, container, workspace))
);

server.registerTool(
  "gtm_get_tag",
  {
    description: "Get one tag by ID from a workspace draft.",
    inputSchema: { ...readLocationScope, tagId: z.string().trim().min(1) },
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container, workspace, tagId }) =>
    run(() => gtm.getTag(account, container, workspace, tagId))
);

server.registerTool(
  "gtm_create_tag",
  {
    description: "Create a tag in an explicitly selected workspace. The container is not published.",
    inputSchema: CreateTagSchema,
    outputSchema,
    annotations: additive,
  },
  async ({ account, container, workspace, ...tag }) =>
    run(() => gtm.createTag(account, container, workspace, tag))
);

server.registerTool(
  "gtm_update_tag",
  {
    description:
      "Safely update selected tag fields by fetching and merging the current tag and checking its fingerprint.",
    inputSchema: UpdateTagSchema,
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, tagId, ...changes }) =>
    run(() => gtm.updateTag(account, container, workspace, tagId, changes))
);

server.registerTool(
  "gtm_delete_tag",
  {
    description: "Delete a tag from an explicitly selected workspace draft.",
    inputSchema: { ...writeLocationScope, tagId: z.string().trim().min(1) },
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, tagId }) =>
    run(async () => {
      await gtm.deleteTag(account, container, workspace, tagId);
      return { deleted: tagId };
    })
);

server.registerTool(
  "gtm_revert_tag",
  {
    description: "Revert workspace changes to a tag using optimistic fingerprint protection.",
    inputSchema: { ...writeLocationScope, tagId: z.string().trim().min(1) },
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, tagId }) =>
    run(() => gtm.revertTag(account, container, workspace, tagId))
);

// ---- Triggers ----

server.registerTool(
  "gtm_list_triggers",
  {
    description: "List every trigger in a workspace, following all result pages.",
    inputSchema: readLocationScope,
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container, workspace }) =>
    run(() => gtm.listTriggers(account, container, workspace))
);

server.registerTool(
  "gtm_get_trigger",
  {
    description: "Get one trigger by ID from a workspace.",
    inputSchema: { ...readLocationScope, triggerId: z.string().trim().min(1) },
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container, workspace, triggerId }) =>
    run(() => gtm.getTrigger(account, container, workspace, triggerId))
);

server.registerTool(
  "gtm_create_trigger",
  {
    description: "Create a trigger in an explicitly selected workspace draft.",
    inputSchema: CreateTriggerSchema,
    outputSchema,
    annotations: additive,
  },
  async ({ account, container, workspace, ...trigger }) =>
    run(() => gtm.createTrigger(account, container, workspace, trigger))
);

server.registerTool(
  "gtm_update_trigger",
  {
    description: "Safely update selected trigger fields with fingerprint conflict protection.",
    inputSchema: UpdateTriggerSchema,
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, triggerId, ...changes }) =>
    run(() => gtm.updateTrigger(account, container, workspace, triggerId, changes))
);

server.registerTool(
  "gtm_delete_trigger",
  {
    description: "Delete a trigger from an explicitly selected workspace draft.",
    inputSchema: { ...writeLocationScope, triggerId: z.string().trim().min(1) },
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, triggerId }) =>
    run(async () => {
      await gtm.deleteTrigger(account, container, workspace, triggerId);
      return { deleted: triggerId };
    })
);

server.registerTool(
  "gtm_revert_trigger",
  {
    description: "Revert workspace changes to a trigger with fingerprint protection.",
    inputSchema: { ...writeLocationScope, triggerId: z.string().trim().min(1) },
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, triggerId }) =>
    run(() => gtm.revertTrigger(account, container, workspace, triggerId))
);

// ---- Variables ----

server.registerTool(
  "gtm_list_variables",
  {
    description: "List every user-defined variable in a workspace, following all result pages.",
    inputSchema: readLocationScope,
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container, workspace }) =>
    run(() => gtm.listVariables(account, container, workspace))
);

server.registerTool(
  "gtm_get_variable",
  {
    description: "Get one user-defined variable by ID from a workspace.",
    inputSchema: { ...readLocationScope, variableId: z.string().trim().min(1) },
    outputSchema,
    annotations: readOnly,
  },
  async ({ account, container, workspace, variableId }) =>
    run(() => gtm.getVariable(account, container, workspace, variableId))
);

server.registerTool(
  "gtm_create_variable",
  {
    description: "Create a user-defined variable in an explicitly selected workspace draft.",
    inputSchema: CreateVariableSchema,
    outputSchema,
    annotations: additive,
  },
  async ({ account, container, workspace, ...variable }) =>
    run(() => gtm.createVariable(account, container, workspace, variable))
);

server.registerTool(
  "gtm_update_variable",
  {
    description: "Safely update selected variable fields with fingerprint conflict protection.",
    inputSchema: UpdateVariableSchema,
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, variableId, ...changes }) =>
    run(() => gtm.updateVariable(account, container, workspace, variableId, changes))
);

server.registerTool(
  "gtm_delete_variable",
  {
    description: "Delete a user-defined variable from an explicitly selected workspace draft.",
    inputSchema: { ...writeLocationScope, variableId: z.string().trim().min(1) },
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, variableId }) =>
    run(async () => {
      await gtm.deleteVariable(account, container, workspace, variableId);
      return { deleted: variableId };
    })
);

server.registerTool(
  "gtm_revert_variable",
  {
    description: "Revert workspace changes to a user-defined variable with fingerprint protection.",
    inputSchema: { ...writeLocationScope, variableId: z.string().trim().min(1) },
    outputSchema,
    annotations: mutating,
  },
  async ({ account, container, workspace, variableId }) =>
    run(() => gtm.revertVariable(account, container, workspace, variableId))
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("gtm-mcp-server failed to start:", error);
  process.exit(1);
});

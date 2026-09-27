import { google, tagmanager_v2 } from "googleapis";
import { getOAuth2Client } from "./auth.js";

export type Tag = tagmanager_v2.Schema$Tag;
export type Trigger = tagmanager_v2.Schema$Trigger;
export type Variable = tagmanager_v2.Schema$Variable;

let gtmClientPromise: Promise<tagmanager_v2.Tagmanager> | undefined;

async function getGtm(): Promise<tagmanager_v2.Tagmanager> {
  gtmClientPromise ??= getOAuth2Client().then((auth) => google.tagmanager({ version: "v2", auth }));
  return gtmClientPromise;
}

function notFound(kind: string, needle: string): never {
  throw new Error(`No ${kind} found matching "${needle}".`);
}

function ambiguous(kind: string, needle: string, matches: string[]): never {
  throw new Error(
    `Multiple ${kind}s match "${needle}": ${matches.join(", ")}. Use an ID instead of a name.`
  );
}

function resolveUnique<T>(
  items: T[],
  kind: string,
  needle: string,
  idMatches: (item: T) => boolean,
  nameOf: (item: T) => string | null | undefined,
  describe: (item: T) => string
): T {
  const byId = items.filter(idMatches);
  if (byId.length === 1) return byId[0];
  if (byId.length > 1) ambiguous(kind, needle, byId.map(describe));

  const lowered = needle.toLowerCase();
  const byName = items.filter((item) => nameOf(item)?.toLowerCase() === lowered);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) ambiguous(kind, needle, byName.map(describe));
  return notFound(kind, needle);
}

function mergeDefined<T extends object>(current: T, changes: Partial<T>): T {
  const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  return { ...current, ...defined };
}

function omitReadOnly<T extends object>(value: T, keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
}

function isNotFoundError(error: unknown) {
  const candidate = error as { code?: number | string; response?: { status?: number } };
  return candidate?.code === 404 || candidate?.code === "404" || candidate?.response?.status === 404;
}

export async function listAccounts() {
  const gtm = await getGtm();
  const accounts: tagmanager_v2.Schema$Account[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gtm.accounts.list({ pageToken });
    accounts.push(...(res.data.account ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return accounts;
}

export async function resolveAccount(nameOrId: string) {
  const accounts = await listAccounts();
  return resolveUnique(
    accounts,
    "account",
    nameOrId,
    (account) => account.accountId === nameOrId,
    (account) => account.name,
    (account) => `${account.name ?? "(unnamed)"} [${account.accountId ?? "unknown ID"}]`
  );
}

export async function listContainers(accountNameOrId: string) {
  const gtm = await getGtm();
  const account = await resolveAccount(accountNameOrId);
  const containers: tagmanager_v2.Schema$Container[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gtm.accounts.containers.list({
      parent: `accounts/${account.accountId}`,
      pageToken,
    });
    containers.push(...(res.data.container ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return containers;
}

export async function resolveContainer(accountNameOrId: string, containerNameOrId: string) {
  const containers = await listContainers(accountNameOrId);
  return resolveUnique(
    containers,
    "container",
    containerNameOrId,
    (container) =>
      container.containerId === containerNameOrId || container.publicId === containerNameOrId,
    (container) => container.name,
    (container) =>
      `${container.name ?? "(unnamed)"} [${container.publicId ?? container.containerId ?? "unknown ID"}]`
  );
}

export async function listWorkspaces(accountNameOrId: string, containerNameOrId: string) {
  const gtm = await getGtm();
  const container = await resolveContainer(accountNameOrId, containerNameOrId);
  const workspaces: tagmanager_v2.Schema$Workspace[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gtm.accounts.containers.workspaces.list({
      parent: container.path!,
      pageToken,
    });
    workspaces.push(...(res.data.workspace ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return workspaces;
}

export async function resolveWorkspace(
  accountNameOrId: string,
  containerNameOrId: string,
  workspaceNameOrId?: string
) {
  const workspaces = await listWorkspaces(accountNameOrId, containerNameOrId);
  if (!workspaceNameOrId) {
    const defaults = workspaces.filter(
      (workspace) => workspace.name?.toLowerCase() === "default workspace"
    );
    if (defaults.length === 1) return defaults[0];
    if (workspaces.length === 1) return workspaces[0];
    throw new Error(
      "Workspace was omitted and no unique Default Workspace could be selected. Specify a workspace name or ID."
    );
  }

  return resolveUnique(
    workspaces,
    "workspace",
    workspaceNameOrId,
    (workspace) => workspace.workspaceId === workspaceNameOrId,
    (workspace) => workspace.name,
    (workspace) => `${workspace.name ?? "(unnamed)"} [${workspace.workspaceId ?? "unknown ID"}]`
  );
}

async function resolveWorkspacePath(account: string, container: string, workspace?: string) {
  const resolved = await resolveWorkspace(account, container, workspace);
  if (!resolved.path) throw new Error("The selected workspace has no API path.");
  return resolved.path;
}

export async function createWorkspace(
  account: string,
  container: string,
  workspace: { name: string; description?: string }
) {
  const gtm = await getGtm();
  const resolvedContainer = await resolveContainer(account, container);
  const res = await gtm.accounts.containers.workspaces.create({
    parent: resolvedContainer.path!,
    requestBody: workspace,
  });
  return res.data;
}

export async function getWorkspaceStatus(account: string, container: string, workspace?: string) {
  const gtm = await getGtm();
  const path = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.getStatus({ path });
  return res.data;
}

export async function syncWorkspace(account: string, container: string, workspace: string) {
  const gtm = await getGtm();
  const path = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.sync({ path });
  return res.data;
}

export async function quickPreviewWorkspace(account: string, container: string, workspace: string) {
  const gtm = await getGtm();
  const path = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.quick_preview({ path });
  return res.data;
}

// ---- Tags ----

export async function listTags(account: string, container: string, workspace?: string) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const tags: Tag[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gtm.accounts.containers.workspaces.tags.list({ parent, pageToken });
    tags.push(...(res.data.tag ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return tags;
}

export async function getTag(account: string, container: string, workspace: string | undefined, tagId: string) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.tags.get({ path: `${parent}/tags/${tagId}` });
  return res.data;
}

export async function createTag(account: string, container: string, workspace: string, tag: Tag) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.tags.create({ parent, requestBody: tag });
  return res.data;
}

export async function updateTag(
  account: string,
  container: string,
  workspace: string,
  tagId: string,
  changes: Tag
) {
  const gtm = await getGtm();
  const current = await getTag(account, container, workspace, tagId);
  const path = current.path ?? `${await resolveWorkspacePath(account, container, workspace)}/tags/${tagId}`;
  const res = await gtm.accounts.containers.workspaces.tags.update({
    path,
    fingerprint: current.fingerprint ?? undefined,
    requestBody: omitReadOnly(mergeDefined(current, changes), [
      "accountId",
      "containerId",
      "workspaceId",
      "tagId",
      "path",
      "fingerprint",
      "tagManagerUrl",
    ]),
  });
  return res.data;
}

export async function deleteTag(account: string, container: string, workspace: string, tagId: string) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  await gtm.accounts.containers.workspaces.tags.delete({ path: `${parent}/tags/${tagId}` });
}

export async function revertTag(account: string, container: string, workspace: string, tagId: string) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  let current: Tag | undefined;
  try {
    current = await getTag(account, container, workspace, tagId);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  const res = await gtm.accounts.containers.workspaces.tags.revert({
    path: current?.path ?? `${parent}/tags/${tagId}`,
    fingerprint: current?.fingerprint ?? undefined,
  });
  return res.data;
}

// ---- Triggers ----

export async function listTriggers(account: string, container: string, workspace?: string) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const triggers: Trigger[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gtm.accounts.containers.workspaces.triggers.list({ parent, pageToken });
    triggers.push(...(res.data.trigger ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return triggers;
}

export async function getTrigger(
  account: string,
  container: string,
  workspace: string | undefined,
  triggerId: string
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.triggers.get({
    path: `${parent}/triggers/${triggerId}`,
  });
  return res.data;
}

export async function createTrigger(
  account: string,
  container: string,
  workspace: string,
  trigger: Trigger
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.triggers.create({ parent, requestBody: trigger });
  return res.data;
}

export async function updateTrigger(
  account: string,
  container: string,
  workspace: string,
  triggerId: string,
  changes: Trigger
) {
  const gtm = await getGtm();
  const current = await getTrigger(account, container, workspace, triggerId);
  const path = current.path ?? `${await resolveWorkspacePath(account, container, workspace)}/triggers/${triggerId}`;
  const res = await gtm.accounts.containers.workspaces.triggers.update({
    path,
    fingerprint: current.fingerprint ?? undefined,
    requestBody: omitReadOnly(mergeDefined(current, changes), [
      "accountId",
      "containerId",
      "workspaceId",
      "triggerId",
      "path",
      "fingerprint",
      "tagManagerUrl",
    ]),
  });
  return res.data;
}

export async function deleteTrigger(
  account: string,
  container: string,
  workspace: string,
  triggerId: string
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  await gtm.accounts.containers.workspaces.triggers.delete({ path: `${parent}/triggers/${triggerId}` });
}

export async function revertTrigger(
  account: string,
  container: string,
  workspace: string,
  triggerId: string
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  let current: Trigger | undefined;
  try {
    current = await getTrigger(account, container, workspace, triggerId);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  const res = await gtm.accounts.containers.workspaces.triggers.revert({
    path: current?.path ?? `${parent}/triggers/${triggerId}`,
    fingerprint: current?.fingerprint ?? undefined,
  });
  return res.data;
}

// ---- Variables ----

export async function listVariables(account: string, container: string, workspace?: string) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const variables: Variable[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gtm.accounts.containers.workspaces.variables.list({ parent, pageToken });
    variables.push(...(res.data.variable ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return variables;
}

export async function getVariable(
  account: string,
  container: string,
  workspace: string | undefined,
  variableId: string
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.variables.get({
    path: `${parent}/variables/${variableId}`,
  });
  return res.data;
}

export async function createVariable(
  account: string,
  container: string,
  workspace: string,
  variable: Variable
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  const res = await gtm.accounts.containers.workspaces.variables.create({ parent, requestBody: variable });
  return res.data;
}

export async function updateVariable(
  account: string,
  container: string,
  workspace: string,
  variableId: string,
  changes: Variable
) {
  const gtm = await getGtm();
  const current = await getVariable(account, container, workspace, variableId);
  const path = current.path ?? `${await resolveWorkspacePath(account, container, workspace)}/variables/${variableId}`;
  const res = await gtm.accounts.containers.workspaces.variables.update({
    path,
    fingerprint: current.fingerprint ?? undefined,
    requestBody: omitReadOnly(mergeDefined(current, changes), [
      "accountId",
      "containerId",
      "workspaceId",
      "variableId",
      "path",
      "fingerprint",
      "tagManagerUrl",
    ]),
  });
  return res.data;
}

export async function deleteVariable(
  account: string,
  container: string,
  workspace: string,
  variableId: string
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  await gtm.accounts.containers.workspaces.variables.delete({ path: `${parent}/variables/${variableId}` });
}

export async function revertVariable(
  account: string,
  container: string,
  workspace: string,
  variableId: string
) {
  const gtm = await getGtm();
  const parent = await resolveWorkspacePath(account, container, workspace);
  let current: Variable | undefined;
  try {
    current = await getVariable(account, container, workspace, variableId);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  const res = await gtm.accounts.containers.workspaces.variables.revert({
    path: current?.path ?? `${parent}/variables/${variableId}`,
    fingerprint: current?.fingerprint ?? undefined,
  });
  return res.data;
}

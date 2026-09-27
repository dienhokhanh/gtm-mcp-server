import { homedir } from "node:os";
import { join } from "node:path";

export const GTM_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
];

const configDir = process.env.GTM_MCP_CONFIG_DIR ?? join(homedir(), ".gtm-mcp");

export const CREDENTIALS_PATH =
  process.env.GTM_MCP_CREDENTIALS_PATH ?? join(configDir, "credentials.json");

export const TOKEN_PATH = process.env.GTM_MCP_TOKEN_PATH ?? join(configDir, "token.json");

export const CONFIG_DIR = configDir;

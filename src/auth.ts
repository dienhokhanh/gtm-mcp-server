import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";
import { Credentials, OAuth2Client } from "google-auth-library";
import { CREDENTIALS_PATH, TOKEN_PATH, GTM_SCOPES } from "./config.js";

interface InstalledCredentials {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
}

async function loadClientSecrets(): Promise<{ clientId: string; clientSecret: string }> {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `OAuth client credentials not found at ${CREDENTIALS_PATH}.\n` +
        "Create a Desktop app OAuth client, download credentials.json, and place it there " +
        "(or set GTM_MCP_CREDENTIALS_PATH)."
    );
  }

  let parsed: InstalledCredentials;
  try {
    parsed = JSON.parse(await readFile(CREDENTIALS_PATH, "utf-8"));
  } catch (error) {
    throw new Error(`Could not parse OAuth credentials at ${CREDENTIALS_PATH}: ${errorMessage(error)}`);
  }

  const creds = parsed.installed;
  if (!creds && parsed.web) {
    throw new Error(
      "This server requires a Desktop app OAuth client. The supplied credentials are for a Web application."
    );
  }
  if (!creds?.client_id || !creds.client_secret) {
    throw new Error(`The credentials file at ${CREDENTIALS_PATH} is not a valid OAuth client secret.`);
  }
  return { clientId: creds.client_id, clientSecret: creds.client_secret };
}

export async function getOAuth2Client(): Promise<OAuth2Client> {
  const { clientId, clientSecret } = await loadClientSecrets();
  const client = new OAuth2Client({ clientId, clientSecret });

  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      `No auth token found at ${TOKEN_PATH}.\n` +
        "Run `npm run auth` once to sign in with Google before using this server."
    );
  }

  try {
    client.setCredentials(JSON.parse(await readFile(TOKEN_PATH, "utf-8")));
  } catch (error) {
    throw new Error(`Could not read auth token at ${TOKEN_PATH}: ${errorMessage(error)}`);
  }

  client.on("tokens", (tokens) => {
    void persistTokens(client, tokens).catch((error) => {
      console.error("Could not securely persist refreshed OAuth token:", errorMessage(error));
    });
  });

  return client;
}

async function persistTokens(client: OAuth2Client, newTokens: Credentials) {
  const merged = { ...client.credentials, ...newTokens };
  await writeSecretJson(TOKEN_PATH, merged);
}

async function writeSecretJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2), { encoding: "utf-8", mode: 0o600 });
  await chmod(path, 0o600);
}

export async function runInteractiveAuth(): Promise<void> {
  const { clientId, clientSecret } = await loadClientSecrets();
  const state = randomBytes(32).toString("hex");
  const callback = await startOAuthCallback(state);
  const client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: callback.redirectUri,
  });

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GTM_SCOPES,
    state,
  });

  console.log("\nOpen the following URL in your browser to grant access to Google Tag Manager:\n");
  console.log(authUrl);
  console.log("\nWaiting for sign-in (up to 5 minutes)...\n");

  try {
    const code = await callback.code;
    const { tokens } = await client.getToken(code);
    await writeSecretJson(TOKEN_PATH, tokens);
    console.log(`\nSigned in successfully. Token saved securely to ${TOKEN_PATH}\n`);
  } finally {
    callback.close();
  }
}

async function startOAuthCallback(expectedState: string): Promise<{
  redirectUri: string;
  code: Promise<string>;
  close: () => void;
}> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  let settled = false;
  let timeout: NodeJS.Timeout;
  const settle = (server: Server, error?: Error, authCode?: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    server.close();
    if (error) rejectCode(error);
    else resolveCode(authCode!);
  };

  const server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400).end("Bad request");
      return;
    }

    const reqUrl = new URL(req.url, "http://127.0.0.1");
    if (reqUrl.pathname !== "/oauth2callback") {
      res.writeHead(404).end("Not found");
      return;
    }

    const oauthError = reqUrl.searchParams.get("error");
    const returnedState = reqUrl.searchParams.get("state");
    const authCode = reqUrl.searchParams.get("code");
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (oauthError) {
      res.writeHead(400).end("<h1>Sign-in failed</h1><p>You can close this tab.</p>");
      settle(server, new Error(`OAuth error: ${oauthError}`));
      return;
    }
    if (returnedState !== expectedState) {
      res.writeHead(400).end("<h1>Invalid OAuth state</h1><p>You can close this tab.</p>");
      settle(server, new Error("OAuth state mismatch. Sign-in was rejected for safety."));
      return;
    }
    if (!authCode) {
      res.writeHead(400).end("<h1>No authorization code received</h1>");
      settle(server, new Error("No authorization code received."));
      return;
    }

    res.writeHead(200).end("<h1>Signed in successfully!</h1><p>You can close this tab.</p>");
    settle(server, undefined, authCode);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  timeout = setTimeout(
    () => settle(server, new Error("Timed out waiting for Google OAuth callback.")),
    5 * 60 * 1000
  );
  server.on("error", (error) => settle(server, error));

  return {
    redirectUri,
    code,
    close: () => {
      clearTimeout(timeout);
      if (server.listening) server.close();
    },
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

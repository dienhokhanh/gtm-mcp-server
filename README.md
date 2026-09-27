# gtm-mcp-server

An MCP (Model Context Protocol) server for safely managing Google Tag Manager workspace
drafts from Claude, Codex, or another MCP client.

The server **never publishes a container**. All changes remain in a GTM workspace for human
review. Mutating tools require an explicit workspace, use GTM fingerprints when updating or
reverting entities, and are annotated so MCP clients can distinguish reads from risky changes.

## Features

- Discover accounts, containers, and workspaces by name or ID.
- Create dedicated automation workspaces.
- List, get, create, update, delete, and revert tags, triggers, and variables.
- Inspect workspace changes/conflicts, sync with the latest version, and run a quick preview.
- Follow every Google API result page instead of silently returning only the first page.
- Reject ambiguous names and require IDs when more than one resource has the same name.
- Return both readable JSON text and MCP structured output.
- Protect partial updates by fetching the current entity, merging selected fields, and sending
  its latest fingerprint.

Writes always require `workspace`. Reads may omit it only when the container has a uniquely
identifiable Default Workspace.

## Requirements

- Node.js 22 or newer (required by the current Google API libraries)
- A Google Cloud project with the Tag Manager API enabled
- A Google account with access to the target GTM account/container

## 1. Create a Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the **Tag Manager API** under **APIs & Services → Library**.
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Select **Desktop app**.
5. Download the JSON file and save it as `~/.gtm-mcp/credentials.json`.

You can use a different location with `GTM_MCP_CREDENTIALS_PATH`.

## 2. Install

```bash
git clone https://github.com/dienhokhanh/gtm-mcp-server.git
cd gtm-mcp-server
npm ci
npm run check
```

## 3. Sign in to Google

```bash
npm run auth
```

Open the printed Google URL and grant access. Authentication uses a temporary callback bound
only to `127.0.0.1`, validates OAuth state, and stops waiting after five minutes. The resulting
token is written to `~/.gtm-mcp/token.json` with user-only file permissions.

Version 0.2 adds the `tagmanager.edit.containerversions` scope for workspace quick preview. If
you authenticated with an older release, run `npm run auth` again to grant the new scope.

## 4. Connect an MCP client

Claude Code:

```bash
claude mcp add gtm -- node "/absolute/path/to/gtm-mcp-server/dist/index.js"
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gtm": {
      "command": "node",
      "args": ["/absolute/path/to/gtm-mcp-server/dist/index.js"]
    }
  }
}
```

Example workflow:

1. “List my GTM accounts and containers.”
2. “Create a workspace named `MCP - purchase tracking` in container `GTM-ABC123`.”
3. “Create the purchase trigger and GA4 event tag in that workspace.”
4. “Show workspace status and run a quick preview.”
5. Review and publish manually in the GTM UI.

## Tools

### Discovery and workspace safety

- `gtm_list_accounts`
- `gtm_list_containers`
- `gtm_list_workspaces`
- `gtm_create_workspace`
- `gtm_workspace_status`
- `gtm_sync_workspace`
- `gtm_quick_preview_workspace`

### Tags

- `gtm_list_tags`, `gtm_get_tag`, `gtm_create_tag`, `gtm_update_tag`
- `gtm_delete_tag`, `gtm_revert_tag`

### Triggers

- `gtm_list_triggers`, `gtm_get_trigger`, `gtm_create_trigger`, `gtm_update_trigger`
- `gtm_delete_trigger`, `gtm_revert_trigger`

### Variables

- `gtm_list_variables`, `gtm_get_variable`, `gtm_create_variable`, `gtm_update_variable`
- `gtm_delete_variable`, `gtm_revert_variable`

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `GTM_MCP_CONFIG_DIR` | `~/.gtm-mcp` | Directory holding credentials and token |
| `GTM_MCP_CREDENTIALS_PATH` | `<config_dir>/credentials.json` | OAuth client credentials |
| `GTM_MCP_TOKEN_PATH` | `<config_dir>/token.json` | Cached OAuth token |

## Development

```bash
npm run build
npm test
npm run check
```

Unit tests cover mutation workspace requirements, GTM enum wire values, partial-update inputs,
and trigger condition validation. Live integration testing requires your own Google OAuth and
GTM test container.

## Security notes

- Never commit OAuth credentials or tokens; both are covered by `.gitignore`.
- Use a dedicated GTM workspace for automated changes.
- Inspect `gtm_workspace_status` and run `gtm_quick_preview_workspace` before publishing.
- Publishing remains a manual action in the GTM UI.
- Tokens are still local bearer credentials: only run this server on a trusted machine.

## License

MIT

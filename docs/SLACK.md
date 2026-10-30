# Adding a Slack message to the Inbox

The message is chosen explicitly from its menu. A Slack dialog lets you edit
the title, then confirm. The card holds the text and the message's permalink,
including for a reply in a thread. The integration never posts anything to a
channel.

## 1. Configure the app created in Slack

In **App Manifest**, import the JSON from
[`functions/slack/manifest.json`](../functions/slack/manifest.json), after
replacing `<project>` in it with the Firebase project ID, then save. This sets
up:

- **Interactivity & Shortcuts** enabled.
- Request URL: `https://<project>.web.app/integrations/slack/interactions`.
- An **On messages** shortcut: **Ajouter à Oshka** (Add to Oshka).
- Callback ID: `oshka_save_message`.
- **OAuth & Permissions → Bot Token Scopes**: `commands` only.

No history-reading scopes, no `chat:write`, no event subscriptions. **Socket
Mode** stays off. This version uses the token of a single installation in one
workspace; adding it to other workspaces would need an additional
multi-workspace OAuth flow.

## 2. Install in the workspace and configure the secrets

In **Install App**, install the app in the chosen workspace. Collect:

- **Basic Information → App Credentials → Signing Secret**.
- **OAuth & Permissions → Bot User OAuth Token** (starts with `xoxb-`).

Do not paste these values into a chat, a file tracked by Git, or a command
argument. Each of the following commands asks for the value interactively and
stores it in Google Secret Manager:

```bash
npx --yes firebase-tools@15.34.1 functions:secrets:set OSHKA_SLACK_SIGNING_SECRET --project <project>
npx --yes firebase-tools@15.34.1 functions:secrets:set OSHKA_SLACK_BOT_TOKEN --project <project>
```

Run the commands one at a time. Wait for the **Enter a value for…** prompt,
then paste only the secret and press Enter. Typed characters are not shown.
Wait for the confirmation that the version was created before running the
second command. The npm CLI avoids the old standalone binary
`/usr/local/bin/firebase` (13.4.0), which did not show the prompt properly.

## 3. Deploy the service and the interface

Once both secrets are set:

```bash
npm run build
npx --yes firebase-tools@15.34.1 deploy --only functions:slack,hosting,firestore:indexes --project <project>
```

The Functions predeploy step already builds the shared business functions. The
existing Firestore rules close every collection of the integration to clients;
only the Admin service can read and write them. TTL policies delete expired
temporary codes and captures.

## 4. Link your Oshka account

1. In Oshka: **Settings → Connections & sharing → Slack → Create a connection code**.
2. Copy the code (valid for 10 minutes, single-use).
3. In Slack, open a message's menu, then **Ajouter à Oshka**.
4. Paste the code in the dialog and confirm.

Later captures only ask to confirm the title. The link applies to the pair
**workspace + Slack user**, never to the whole workspace. Everyone uses their
own Oshka account. **Disconnect Slack** in Oshka removes that account's links
and revokes its pending codes.

## Validation

The tests cover the HTTP endpoint, HMAC signatures, rejection of stale requests
and of other workspaces, single-use linking, expired sessions, atomic captures
and repeats without duplicates, even after the card was filed. The file
`src/lib/__tests__/slack.test.js` needs the business bundle to have been built
with `npm run build:functions`.

`chat.getPermalink` uses GET with `channel` and `message_ts` as URL parameters.
A JSON POST returned `invalid_arguments`, before the dialog even opened. The
HTTP test reproduces that refusal: a mock that accepts every verb does not
cover this contract. The shared client enforces each method's verb. Logs keep
the method and the error code, without message content, Slack response body,
connection code or token.

Before considering the installation validated, test from the real Slack on
iPhone and Mac: a channel message, a reply in a thread and a direct message,
then find the right message again through the card's link. Also check that a
second capture does not create a duplicate. A first call on a cold function may
need a retry if Slack hits its 3-second timeout.

Like the MCP server, this integration writes `boardJson` in a transaction. The
existing two-writers limitation described in `ARCHITECTURE.md` applies: an app
write already in flight can still overwrite an external capture. The
architectural sync fix is separate from this integration; a deduplication
receipt is not a backup of the board.

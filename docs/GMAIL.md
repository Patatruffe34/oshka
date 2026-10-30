# Capturing a Gmail email in Oshka

The **Oshka** Google Workspace add-on adds the open email to the Inbox as soon
as it is opened, without an edit form: subject, sender, date, a 500-character
excerpt and a link to the Gmail conversation. While the Oshka panel stays open,
every email you view is added automatically. Close the panel to stop capturing.
A screen confirms each addition or offers to retry on failure. Retrying on the
same email does not create a second card, even after the first one was filed.

On Mac: Gmail in the browser, Oshka icon in the right-hand sidebar.
On iPhone: Gmail app, open an email and find Oshka at the bottom of the message.
The add-on uses Apps Script: HTTP add-ons deployed through the Google Workspace
Add-ons API do not support iOS features yet.

The add-on's own interface (`Code.gs`) is in French; the labels below are
quoted as they appear.

## Private installation

This first version installs from an Apps Script project; it is not distributed
on the Google Workspace Marketplace yet. Each Google account has to install and
authorise the add-on. An installation on one account is shared between Gmail on
Mac and on iPhone.

1. Create a project in [Google Apps Script](https://script.google.com/home).
2. Replace `Code.gs` with [`integrations/gmail/Code.gs`](../integrations/gmail/Code.gs).
   In this file and in the manifest below, replace `<project>` with the
   Firebase project ID of your instance.
3. In **Project Settings**, enable showing the `appsscript.json` manifest.
4. In the editor, replace the manifest with
   [`integrations/gmail/appsscript.json`](../integrations/gmail/appsscript.json).
5. Save, then **Deploy → Test deployments → Install**.
6. Open Gmail and authorise the Oshka add-on for this Google account.

Do not share the Apps Script project or its editor access to install the
add-on on other accounts unless you have explicitly decided to give them those
rights.

## Linking Oshka once

1. In Oshka: **Settings → Connections & sharing → Gmail → Create a connection code**.
2. In Gmail: open Oshka, paste the code, then **Connecter Oshka**.
3. Open the email to keep, then the **Oshka** add-on: the card is created
   immediately with the email's subject as its title. If an email is already
   open when you connect, it is captured as soon as the connection succeeds.

The code is single-use and expires after 10 minutes. The link to the Oshka
account lasts at most one year and can be revoked at any time with
**Disconnect Gmail** in Oshka. Revocation covers every add-on linked to that
Oshka account as well as unused codes. After revocation, the Gmail add-on asks
for a new connection on the next capture.

## Access and storage

- Gmail grants temporary access to the open message when the add-on is used.
- The add-on does not search the mailbox and does not read attachments. It asks
  for no right to send, delete or modify emails.
- Once connected, opening the add-on on an email sends its subject, sender,
  date, excerpt, link and identifiers to Oshka. Switching emails with the panel
  active triggers the same automatic capture. The home page with no email
  selected captures nothing.
- The temporary Gmail token never leaves Apps Script. The Oshka token is
  private to the Google account (`UserProperties`) and only allows adding to
  the Inbox.
- Oshka only keeps SHA-256 hashes of codes and tokens, in `gmail_link_codes`
  and `gmail_links`. Deduplication receipts (`gmail_imports`) do not contain
  the email's text.
- The source link keeps the Gmail account (`authuser`), so that another mailbox
  does not open when several Google accounts are signed in.

The backend writes the same `boards/{uid}` document as Slack. The existing
limitation on concurrent writes to the whole document is described in
[SLACK.md](SLACK.md).

## Deployment

```sh
npm run build:functions
npm test
npm run build
npx --yes firebase-tools@15.34.1 deploy --only functions:gmail,hosting,firestore:indexes --project <project>
```

No new Firebase secret or Gmail key is needed. To update the private add-on,
replace the changed files in the same Apps Script project, save, then close and
reopen the add-on in Gmail. The existing connection is kept; a fix limited to
`Code.gs` does not require changing the manifest.

The **Réessayer** (retry) button, shown only after a failure, ties its card to
the canonical identifier returned by `GmailApp.getMessageById(...).getId()`. On
click, it reads the current message again and compares that canonical
identifier with the card's. The Gmail event identifier can look like
`msg-f:...`: comparing it directly with the hexadecimal value of `getId()`
wrongly blocked every capture with the message "Le mail sélectionné a changé"
(the selected email changed). The add-on test reproduces both formats and reads
the parameters from the real button built by the code.

The server accepts both forms of Gmail links: those with an `#inbox/...`
fragment and Apps Script permalinks such as
`https://mail.google.com/mail?extsrc=sync&client=docs&plid=...`. Requiring a
trailing `/` and a fragment rejected the latter with `invalid_mail` (HTTP 400).
The add-on tests now check the server validator's real contract. Diagnostics
only log the status, the error code and the name of the rejected field, never
the email's values, links or tokens.

Google documentation:
[installing and testing](https://developers.google.com/workspace/add-ons/how-tos/testing-workspace-addons),
[using add-ons on desktop and mobile](https://developers.google.com/workspace/add-ons/guides/using-addons),
[temporary Gmail permissions](https://developers.google.com/workspace/add-ons/concepts/workspace-scopes),
[iOS limits of the Add-ons API](https://developers.google.com/workspace/add-ons/overview).

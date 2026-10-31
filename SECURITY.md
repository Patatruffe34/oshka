# Security policy

Security fixes target the latest version on `main`. Update your self-hosted
instance and deploy the frontend, Functions and Firestore configuration together.

## Reporting a vulnerability

Please use [GitHub's private vulnerability reporting](https://github.com/Patatruffe34/oshka/security/advisories/new).
Include the affected commit, a minimal reproduction using synthetic data, the
impact and any suggested fix. Never include real tokens, credentials or private
board contents in a public issue, pull request or log.

## Deployment and privacy

- Firestore rules isolate each account and deny client access to server-only
  collections. Deploy those rules before accepting users.
- Firebase web configuration is public. Service account private keys, Slack
  credentials and connection tokens must never be committed. Use Firebase Secret
  Manager for server secrets.
- External link previews require a click for each URL. Loading one sends the
  complete URL to Microlink and may load an image from the source website.
- Offline data and unsaved drafts are stored in the browser, scoped to the
  account. Use a private browser profile on shared devices. Signing out does not
  erase unsaved drafts, so they can be recovered after signing back in.
- Independent changes merge transactionally. A conflicting change is retained
  locally and shown as unsaved; export a backup before discarding a draft.

If a secret is ever published, revoke or rotate it first. Removing a file from
the latest commit does not remove it from public Git history. Coordinate any
necessary history cleanup with contributors; do not silently force-push shared
branches.

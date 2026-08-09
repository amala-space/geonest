# Security policy

## Supported versions

Only the latest commit on `main` is supported. Fixes are not backported.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and
choose **Report a vulnerability**. That opens a private advisory visible only to
the maintainers.

Please do not open a public issue for a suspected vulnerability, and do not test
against a deployment you do not own.

Include what you have: affected route or file, the steps to reproduce, and the
impact you believe it has. A proof of concept helps but is not required.

Expect an acknowledgement within 7 days. If a report is confirmed, the fix and a
published advisory follow as soon as a patch is ready.

## Scope

In scope: this source tree — the SvelteKit app, the Capacitor Android project,
the Cloud Functions in `functions/`, and the Firestore and Storage rules.

Out of scope: any specific deployment's infrastructure, third-party services,
and findings that require an attacker to already control the victim's device or
Google account.

## What is deliberately not secret

The `PUBLIC_FIREBASE_*` values in `.env` ship inside the client bundle. They are
identifiers, not credentials — access is enforced by
[`firestore.rules`](firestore.rules), [`storage.rules`](storage.rules), and the
Firebase authorized-domain list. A report that these values are "exposed" is not
a vulnerability on its own; a rule that grants access it should not is.

Credentials that *are* secret — signing keystores, service-account keys,
`google-services.json`, `.firebaserc` — must never be committed. This is
enforced by `npm run verify:public`, which runs in CI as the `boundary` job.

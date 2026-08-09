# Feedback Submission Workflow Design

## Scope

Move feedback submission behind a trusted Firebase backend. Preserve anonymous
text feedback and optional screenshots while removing all direct client writes
to Firestore and Storage, keeping attachment failures non-fatal, constraining
abuse and cost, and updating user-facing privacy disclosures.

App Check enforcement is staged rather than enabled immediately because the
Capacitor Android app currently invokes Firebase through the JavaScript SDK. The
callable function will emit verification telemetry, but enforcement waits until
the web and Android attestation paths have been validated in production-like
builds.

## Architecture

The client validates and compresses an optional screenshot to JPEG, converts it
to base64, and calls a second-generation Firebase callable function in
`us-central1`. Callable requests automatically carry Firebase Authentication and
App Check context when available. The request stays below the second-generation
32 MB limit; the application imposes a much smaller 4 MB decoded-image limit.

The function validates every field, derives the UID from verified auth context,
applies a conservative per-IP rate limit, and creates the Firestore feedback
document using Admin SDK credentials. When a screenshot is present, the function
uploads it to the fork's default Firebase Storage bucket and
updates the document. Upload failure leaves the feedback document intact and
returns an attachment warning. Any post-upload document failure triggers object
cleanup.

Functions, Firestore, and the bucket use `us-central1`, matching the existing
Firestore database.

## Security and abuse controls

Client Firestore and Storage rules deny all access to feedback documents and
objects. Only the function service account writes them.

The callable function allowlists fields and lengths, verifies JPEG magic bytes,
enforces the decoded size cap, limits instances and execution time, and tracks a
short rate-limit window using a one-way hash of the request IP. App Check status
is logged through callable verification telemetry but is not enforced in the
first rollout. Enforcement follows after legitimate web and Android traffic is
observed with valid tokens.

## Retention and privacy

Feedback documents contain the submitted message, optional email, optional
screenshot status/path, verified account UID when signed in, page URL, locale,
and bounded device/app/browser metadata. Function infrastructure may log request
metadata such as IP address. Rate-limit records store only a one-way IP hash and
expire automatically.

Feedback documents and screenshots receive a 12-month expiry timestamp. A
scheduled cleanup function deletes expired screenshots and feedback documents;
rate-limit records use a shorter expiry.

The privacy policy will explicitly cover feedback content, screenshots, Cloud
Functions, Cloud Storage, request logs, retention, and future App Check risk or
integrity signals. The form will clarify that GPS coordinates are not attached
automatically but screenshots may include anything visible on screen.

## User experience

The existing form, localized success state, attachment warning, shared pill
controls, ARIA, and 44px touch targets remain. A successful document write with
a failed screenshot is still reported as success plus warning.

## Testing and rollout

Function unit tests cover validation, authentication-derived identity, rate
limits, Firestore-first persistence, screenshot upload/update, cleanup, and
attachment failure. Client tests cover callable serialization and response
mapping. Static configuration tests ensure feedback rules are closed and
Functions/Storage targets are present. Existing page tests cover form behavior.

Local verification includes function tests/build, focused client tests, the full
Vitest suite, `rtk npm run check`, and rules compilation. Deployment provisions
the default bucket, deploys closed rules and the callable/cleanup functions, and
performs a smoke submission before completion is claimed.

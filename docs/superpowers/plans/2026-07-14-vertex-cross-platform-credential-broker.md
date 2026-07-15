# Vertex Cross-Platform Credential Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Let Windows, macOS, Linux, and Android users configure usable Vertex AI credentials entirely inside Sloom Studio, with credential-file import everywhere, Google Account browser sign-in where a public client is configured, secure native storage, project discovery, testing, and optional gcloud fallback.

**Architecture:** A renderer-safe broker interface delegates secret parsing/storage/token refresh to Electron main or an Android Capacitor plugin. The renderer sees opaque credential IDs and status metadata only. All Vertex text/image/video requests obtain short-lived tokens from the broker. Existing gcloud helpers become a compatibility source.

**Tech Stack:** Electron `safeStorage`, Node OAuth/crypto/HTTP, Capacitor Android Java, Android Keystore, Google OAuth 2.0 PKCE, Google Cloud Resource Manager REST, Vitest, Node tests, Gradle/JUnit.

## Global Constraints

- No terminal command is required for the primary setup path.
- Never persist raw service-account keys, refresh tokens, client secrets, or imported ADC documents in renderer localStorage or project files.
- Use the system browser; never embed Google auth in a WebView.
- Desktop OAuth uses loopback `127.0.0.1` and PKCE. Android uses Google Identity Services/native authorization, not loopback or a custom scheme.
- Credential import remains available even when a build has no bundled OAuth client ID.
- `gcloud` remains optional compatibility fallback.
- Project listing failure must not invalidate a credential that can mint a token.

---

### Task 1: Define credential formats, metadata, and broker protocol

**Files:**
- Create: `src/lib/vertex/vertexCredentialTypes.ts`
- Create: `src/lib/vertex/vertexCredentialParser.ts`
- Test: `src/lib/vertex/vertexCredentialParser.test.ts`
- Modify: `src/lib/nativeApp.ts`

**Step 1: Write parser/security tests**

Cover `authorized_user`, `service_account`, supported `external_account`, desktop OAuth client configuration, malformed JSON, missing required fields, unsafe external executable/file sources, and redacted error output. Reject credential configurations that require arbitrary command execution.

**Step 2: Define renderer-safe broker types**

Add `VertexCredentialSource`, `VertexCredentialSummary`, `VertexCredentialStatus`, `VertexCredentialImportRequest`, and result types. Extend the native bridge with:

```ts
vertexCredentialList(): Promise<VertexCredentialSummary[]>;
vertexCredentialImport(request): Promise<VertexCredentialImportResult>;
vertexCredentialSignIn(request): Promise<VertexCredentialImportResult>;
vertexCredentialTest(request): Promise<VertexCredentialTestResult>;
vertexCredentialProjects(request): Promise<NativeVertexProjectsResult>;
vertexCredentialRemove(request): Promise<{ ok: boolean; error?: string }>;
vertexCredentialLogout(request): Promise<{ ok: boolean; error?: string }>;
```

Do not expose a `getRawCredential` method.

**Step 3: Run tests and commit**

Run: `npm test -- --run src/lib/vertex/vertexCredentialParser.test.ts src/lib/vertexNativeAuth.test.ts`

```bash
git add src/lib/vertex/vertexCredentialTypes.ts src/lib/vertex/vertexCredentialParser.ts src/lib/vertex/vertexCredentialParser.test.ts src/lib/nativeApp.ts
git commit -m "feat(vertex): define secure credential broker protocol"
```

### Task 2: Implement the Electron encrypted credential store

**Files:**
- Create: `electron/vertex-credential-store.cjs`
- Test: `electron/vertex-credential-store.test.cjs`
- Modify: `electron/main.mjs`
- Modify: `electron/preload.cjs`
- Modify: `src/lib/electronPreloadSource.test.ts`

**Step 1: Write store tests with injected filesystem/safeStorage**

Test encrypt/write/read/list/remove, unavailable encryption, corrupt records, atomic replacement, file permissions, opaque IDs, and summaries that contain no private key/refresh token/client secret.

**Step 2: Implement app-private encrypted storage**

Store one versioned encrypted document below `app.getPath('userData')`. Encrypt the complete secret payload with `safeStorage`; store only non-secret schema/version metadata outside ciphertext. Use a temporary file plus rename and best-effort owner-only permissions.

**Step 3: Add IPC handlers/preload methods**

Validate caller/arguments consistently with existing IPC patterns. Return redacted structured errors. Keep old `loginVertex`/`detectVertexAdc` handlers during migration.

**Step 4: Run tests and commit**

Run: `node --test electron/vertex-credential-store.test.cjs && npm test -- --run src/lib/electronPreloadSource.test.ts src/lib/electronMainSource.test.ts`

```bash
git add electron/vertex-credential-store.cjs electron/vertex-credential-store.test.cjs electron/main.mjs electron/preload.cjs src/lib/electronPreloadSource.test.ts src/lib/electronMainSource.test.ts
git commit -m "feat(vertex): store desktop credentials securely"
```

### Task 3: Implement token minting/refresh for imported credentials

**Files:**
- Create: `electron/vertex-token-broker.cjs`
- Test: `electron/vertex-token-broker.test.cjs`
- Modify: `electron/vertex-auth.cjs`
- Modify: `electron/main.mjs`

**Step 1: Write token fixtures**

Mock Google token endpoints. Cover service-account JWT assertion, authorized-user refresh token, supported external-account token exchange, quota project, expiry skew/cache, revoked credentials, HTTP errors, and redaction.

**Step 2: Implement one broker**

Expose `getAccessToken({ credentialId, scopes, forceRefresh })`. Scope at least `https://www.googleapis.com/auth/cloud-platform`. Cache access tokens in main-process memory only with expiry skew. For imported external account configs, support only audited source mechanisms; reject executable-sourced configs.

**Step 3: Route existing Vertex REST calls through it**

Update Electron image/text/video request handlers to request a broker token. Retain gcloud token acquisition as `source: 'gcloud-compatibility'`.

**Step 4: Run tests and commit**

Run: `node --test electron/vertex-token-broker.test.cjs && npm test -- --run src/lib/flowExecutionVertexText.test.ts src/lib/flowExecutionVertexImage.test.ts src/lib/flowExecutionVertexVideo.test.ts`

```bash
git add electron/vertex-token-broker.cjs electron/vertex-token-broker.test.cjs electron/vertex-auth.cjs electron/main.mjs
git commit -m "feat(vertex): broker desktop access tokens"
```

### Task 4: Implement desktop Google Account sign-in with PKCE

**Files:**
- Create: `electron/vertex-oauth.cjs`
- Test: `electron/vertex-oauth.test.cjs`
- Modify: `electron/main.mjs`
- Modify: `electron/vertex-credential-store.cjs`

**Step 1: Write PKCE/state/loopback tests**

Test S256 verifier/challenge, cryptographic state, `127.0.0.1` ephemeral port only, timeout/cancel/error callbacks, code exchange, system-browser URL, refresh-token storage, no client-secret assumption, and cleanup of the listener.

**Step 2: Implement installed-app OAuth**

Use Google’s system-browser installed-app flow and PKCE. Production builds read a public desktop client ID from build configuration; development builds may import a Desktop OAuth client JSON through the credential wizard. When no client ID exists, return a preflight configuration message and keep file import operational.

Official source: `https://developers.google.com/identity/protocols/oauth2/native-app`.

**Step 3: Run tests and commit**

Run: `node --test electron/vertex-oauth.test.cjs electron/vertex-token-broker.test.cjs`

```bash
git add electron/vertex-oauth.cjs electron/vertex-oauth.test.cjs electron/main.mjs electron/vertex-credential-store.cjs
git commit -m "feat(vertex): add desktop browser sign-in"
```

### Task 5: Implement Android Keystore credential storage and authorization

**Files:**
- Create: `android/app/src/main/java/studio/sloom/signalloom/SignalLoomVertexAuthPlugin.java`
- Create: `android/app/src/test/java/studio/sloom/signalloom/SignalLoomVertexAuthPluginTest.java`
- Modify: `android/app/src/main/java/studio/sloom/signalloom/MainActivity.java`
- Create: `src/lib/androidVertexAuth.ts`
- Test: `src/lib/androidVertexAuth.test.ts`

**Step 1: Write JS bridge and JVM unit tests**

Test one-time plugin registration, list/import/test/remove/logout mapping, summary redaction, Android-only guards, Keystore encryption/decryption, corrupt record handling, and activity-result cancellation.

**Step 2: Implement Keystore-backed storage**

Create an AES-GCM key in Android Keystore scoped to the app. Store encrypted credential payloads in app-private storage. Never return raw credential material over the Capacitor bridge.

**Step 3: Implement Android Google authorization**

Use the current Google Identity Services Android authorization client with the bundled Android OAuth client/package/signature configuration. Request cloud-platform access where permitted, use the system Google UI, and store long-lived material behind Keystore. Do not use desktop loopback or deprecated custom URI schemes.

Official sources:

- `https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration`
- `https://developers.google.com/identity/protocols/oauth2`

**Step 4: Implement imported service-account/authorized-user token refresh natively**

Use Android networking off the UI thread, cache only short-lived tokens in memory, and return redacted layer-specific errors.

**Step 5: Run tests and commit**

Run: `npm test -- --run src/lib/androidVertexAuth.test.ts && cd android && ./gradlew testDebugUnitTest`

```bash
git add android/app/src/main/java/studio/sloom/signalloom/SignalLoomVertexAuthPlugin.java android/app/src/test/java/studio/sloom/signalloom/SignalLoomVertexAuthPluginTest.java android/app/src/main/java/studio/sloom/signalloom/MainActivity.java src/lib/androidVertexAuth.ts src/lib/androidVertexAuth.test.ts
git commit -m "feat(vertex): add Android credential broker"
```

### Task 6: Add the unified renderer broker and migrate settings

**Files:**
- Create: `src/lib/vertex/vertexCredentialBroker.ts`
- Test: `src/lib/vertex/vertexCredentialBroker.test.ts`
- Modify: `src/types/flow.ts`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/store/settingsStore.test.ts`
- Modify: `src/lib/settingsBackup.ts`
- Modify: `src/lib/settingsBackup.test.ts`
- Modify: `src/lib/vertexProviderSettings.ts`

**Step 1: Write migration and leakage tests**

Assert persisted settings/project JSON/backups contain only opaque credential ID/source/account label and never raw private key/refresh token. Test one-time migration of existing `vertexServiceAccountJson` into the native broker and removal from the persisted renderer state after successful import. If native storage is unavailable, keep the legacy encrypted setting with a visible migration blocker rather than deleting it.

**Step 2: Replace raw settings fields**

Add `vertexCredentialId?: string`, `vertexCredentialSource?: VertexCredentialSource`, and safe summary fields. Deprecate `vertexServiceAccountJson` in parsing only; stop new writes. Normalize old `vertexAuthMode` values to the gcloud compatibility source.

**Step 3: Implement platform dispatch**

Electron calls the native bridge, Android calls `SignalLoomVertexAuth`, and plain browser builds support credential status/configuration guidance but do not claim secure persistent Vertex auth without a native secure store.

**Step 4: Run tests and commit**

Run: `npm test -- --run src/lib/vertex/vertexCredentialBroker.test.ts src/store/settingsStore.test.ts src/lib/settingsBackup.test.ts`

```bash
git add src/lib/vertex/vertexCredentialBroker.ts src/lib/vertex/vertexCredentialBroker.test.ts src/types/flow.ts src/store/settingsStore.ts src/store/settingsStore.test.ts src/lib/settingsBackup.ts src/lib/settingsBackup.test.ts src/lib/vertexProviderSettings.ts
git commit -m "feat(vertex): migrate renderer to opaque credentials"
```

### Task 7: Replace the settings panel with a cross-platform wizard

**Files:**
- Modify: `src/components/Settings/useVertexAuth.ts`
- Modify: `src/components/Settings/VertexAuthPanel.tsx`
- Modify: `src/components/Settings/VertexAuthPanel.test.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx`
- Modify: `src/lib/vertex/vertexAuthStatus.ts`
- Modify: `src/lib/vertex/vertexAuthStatus.test.ts`

**Step 1: Write workflow tests**

Cover sign in, import credential JSON on desktop and Android, OAuth-client import when not bundled, credential source selection, project refresh/manual project, region/quota, test, logout/revoke, remove, gcloud fallback, and no-OAuth-client guidance. Assert raw JSON textarea is not retained after successful import.

**Step 2: Implement the compact wizard**

Show:

- Google Account sign-in when configured.
- `Import Google credential file` on every native platform, accepting supported ADC/service-account/authorized-user/external-account files.
- Credential source/account/service-account identity and token-tested status.
- Project picker plus manual ID, region, quota project.
- Test connection, refresh, logout/revoke, remove credential.
- Optional advanced gcloud detection on desktop.

Errors must identify OAuth configuration, parsing, token exchange, project permission, Vertex API enablement, IAM, billing/quota, or model/region access.

**Step 3: Fix auth status semantics**

`configured` requires a broker credential that has passed token validation (or a currently detected gcloud token), plus project selection for execution readiness. A non-empty project alone is never credential evidence.

**Step 4: Run tests and commit**

Run: `npm test -- --run src/components/Settings/VertexAuthPanel.test.tsx src/lib/vertex/vertexAuthStatus.test.ts src/lib/vertex/vertexCredentialBroker.test.ts`

```bash
git add src/components/Settings/useVertexAuth.ts src/components/Settings/VertexAuthPanel.tsx src/components/Settings/VertexAuthPanel.test.tsx src/components/Settings/SettingsModal.tsx src/lib/vertex/vertexAuthStatus.ts src/lib/vertex/vertexAuthStatus.test.ts
git commit -m "feat(vertex): add in-app cross-platform auth wizard"
```

### Task 8: Centralize project discovery and request authentication

**Files:**
- Modify: `electron/main.mjs`
- Modify: `src/lib/vertexDirectRest.ts`
- Modify: `src/lib/vertexDirectRest.test.ts`
- Modify: `src/lib/flowExecution.ts`
- Modify: existing Vertex execution tests

**Step 1: Test brokered project listing and calls**

Mock paginated `GET https://cloudresourcemanager.googleapis.com/v3/projects:search`, manual project test, quota project headers, token refresh, and image/text/video requests. Assert project-list permission failure leaves credential status usable.

**Step 2: Use one token path**

All Vertex calls ask the platform broker for a token. Remove renderer-side service-account minting from normal execution. On Android, native HTTP may perform token exchange but existing direct REST payload/result parsing remains shared where safe.

Official project source: `https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/search`.

**Step 3: Run tests and commit**

Run: `npm test -- --run src/lib/vertexDirectRest.test.ts src/lib/flowExecutionVertexText.test.ts src/lib/flowExecutionVertexImage.test.ts src/lib/flowExecutionVertexVideo.test.ts`

```bash
git add electron/main.mjs src/lib/vertexDirectRest.ts src/lib/vertexDirectRest.test.ts src/lib/flowExecution.ts src/lib/flowExecutionVertexText.test.ts src/lib/flowExecutionVertexImage.test.ts src/lib/flowExecutionVertexVideo.test.ts
git commit -m "feat(vertex): authenticate all requests through broker"
```

### Task 9: Cross-platform verification gate

Run:

```bash
node --test electron/vertex-credential-store.test.cjs electron/vertex-token-broker.test.cjs electron/vertex-oauth.test.cjs
npm test -- --run src/lib/vertex src/components/Settings/VertexAuthPanel.test.tsx src/store/settingsStore.test.ts src/lib/settingsBackup.test.ts src/lib/vertexDirectRest.test.ts src/lib/flowExecutionVertexText.test.ts src/lib/flowExecutionVertexImage.test.ts src/lib/flowExecutionVertexVideo.test.ts
npx tsc -b --pretty false
cd android && ./gradlew testDebugUnitTest
```

Then run credential-free packaging/build checks for Linux, Windows, macOS configuration, and Android. Live OAuth/import/Vertex generation smokes require owner-provided test credentials and must never log or commit them.

# adapter-nextjs: server-side cookie deletion has no `Path`

Minimal Next.js Pages Router app that uses Amplify the documented way: `Amplify.configure(config, { ssr: true })` on
the client and `fetchAuthSession` in `getServerSideProps` through `runWithAmplifyServerContext`, with a Cognito
identity pool that allows guest access.

It reproduces two problems:

1. **Server-side cookie deletion has no `Path`** (`flow:path-bug`). Amplify writes its cookies with `Path=/` but the
   server deletes them with `Set-Cookie: <name>=;Expires=Thu, 01 Jan 1970 00:00:00 GMT`. Without `Path`, the browser
   applies the request's default path (RFC 6265 §5.1.4), so the deletion only works when the request URL has a single
   segment (`/other`). It silently does nothing for client-side navigation (`/_next/data/<buildId>/other.json`),
   nested routes (`/nested/page`) and API routes (`/api/...`).

   After sign-in the server tries to delete the guest `identityId` cookie, because Cognito has linked that identity to
   the user. When that fails, the cookie stays. Once the session ends without a client-side `signOut()` (expired or
   revoked refresh token), `fetchAuthSession` throws `NotAuthorizedException: Access to Identity '…' is forbidden` on
   every request, and nothing replaces the cookie.

2. **`fetchAuthSession` never recovers from an unusable guest identity ID** (`flow:invalid-guest-id`). A guest
   `identityId` cookie that Cognito rejects (deleted identity, malformed value, identity linked to a user) makes
   `fetchAuthSession` throw on every request. The cookie is never replaced, so every server-rendered page fails until
   the user deletes the cookie.

Both flows are [Playwright](https://playwright.dev) scripts that drive the app and print what happens at each step.
They are not tests. Each run also records a video and screenshots into `flow-output/`.

## Requirements

- Node.js 22+
- An Amazon Cognito user pool with an app client (no client secret, `USER_SRP_AUTH` allowed)
- A Cognito identity pool with **guest access enabled** and the user pool as an authentication provider
- A user in that user pool with a permanent password (see below). `flow:invalid-guest-id` works without one.

## Setup

### Create the user

The app has no sign-up page, so `flow:path-bug` needs a user you create in your user pool yourself. Its password must
be permanent: a user created with a temporary password (the default in the Cognito console) is in
`FORCE_CHANGE_PASSWORD` state, sign-in stops at `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED`, and the flow fails.

With the AWS CLI:

```bash
aws cognito-idp admin-create-user --user-pool-id <userPoolId> --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id <userPoolId> --username <email> \
  --password '<password>' --permanent
```

Any other way works too (sign-up in your own app, or the console plus a first sign-in that sets a new password), as
long as the user ends up `CONFIRMED`.

### Install and start

```bash
npm install
npx playwright install chromium
cp .env.example .env.local   # then fill in the pool IDs and the user's credentials
npm run build
npm start                    # http://localhost:3000; set REPRO_BASE_URL if you use another port
```

## Run

In a second terminal, with the app running:

```bash
npm run flow:path-bug           # signs in twice with REPRO_USERNAME / REPRO_PASSWORD
npm run flow:invalid-guest-id   # needs no user
npm run flow:path-bug:with-fix  # the same as flow:path-bug, with the fix applied (see below)
```

Add `HEADED=1` to watch the browser, e.g. `HEADED=1 npm run flow:path-bug`.

### What `flow:path-bug` does

**A. Sign in, then client-side navigation**

1. Visits `/` as a guest. The server sets the guest `identityId` cookie with `Path=/`.
2. Signs in with `signIn()` and goes to `/other` with `router.push`. The app deliberately makes no client-side
   `fetchAuthSession()` call, so the first request with the new tokens is `/_next/data/<buildId>/other.json`.
   - The server links the guest identity to the user and answers with a deletion that has no `Path`.
   - The cookie stays in the browser.
   - Cognito now reports that identity as forbidden for guest access.
3. The same happens on `/nested/page`, both for client-side navigation and for a full page load (default path
   `/nested`).
4. Removes the token cookies without calling `signOut()`, to stand in for an expired or revoked refresh token.
5. Every page now fails with `NotAuthorizedException: Access to Identity '…' is forbidden.`

**B. Control: sign in, then a full page load**

The same sign-in, but the app goes to `/other` with `window.location.assign`, a document request for a single-segment
URL. The server sends the same `Set-Cookie` header, which now matches (default path `/`), and the cookie is removed.
After the session ends, `/` works and gets a new guest identity.

In both runs Cognito links the guest identity to the user (it becomes forbidden for guest access). The only difference
is whether the server's deletion of the cookie reaches the browser.

### Recorded output

`npm run flow:path-bug`:

```
adapter-nextjs: server-side cookie deletion without Path
next 16.3.8, aws-amplify 6.22.1, @aws-amplify/auth 6.21.1, @aws-amplify/adapter-nextjs 1.8.0

=== A. Sign in, then client-side navigation (router.push) to /other ===

1. Visit / as a guest
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=<guest-identity-id>;SameSite=lax;Secure;Path=/;Max-Age=31536000
   identityId cookie in the browser: <guest-identity-id> (Path=/)
   Cognito: <guest-identity-id> is usable as a guest identity

2. Sign in, then router.push("/other"): the first request with the new tokens is /_next/data/<buildId>/other.json
   /_next/data/<buildId>/other.json  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
     request: /_next/data/<buildId>/other.json
     signed in: true
     identityId: <user-identity-id>
   identityId cookie in the browser: <guest-identity-id> (Path=/)
   Cognito: <guest-identity-id> is now NotAuthorizedException: Access to Identity '<guest-identity-id>' is forbidden.

3. Client-side navigation to /nested/page
   /_next/data/<buildId>/nested/page.json  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   identityId cookie in the browser: <guest-identity-id> (Path=/)

4. Full page load of /nested/page
   /nested/page  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   identityId cookie in the browser: <guest-identity-id> (Path=/)

5. The session ends without signOut() (token cookies removed, as after an expired or revoked refresh token)
   identityId cookie in the browser: <guest-identity-id> (Path=/)

6. Load every page
   / -> HTTP 500
     request: /
     ERROR NotAuthorizedException: Access to Identity '<guest-identity-id>' is forbidden.
   /other -> HTTP 500
     request: /other
     ERROR NotAuthorizedException: Access to Identity '<guest-identity-id>' is forbidden.
   /nested/page -> HTTP 500
     request: /nested/page
     ERROR NotAuthorizedException: Access to Identity '<guest-identity-id>' is forbidden.
   identityId cookie in the browser: <guest-identity-id> (Path=/)

=== B. Control: the same, but a full page load of /other after sign-in ===

7. Visit / as a guest
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=<guest-identity-id>;SameSite=lax;Secure;Path=/;Max-Age=31536000
   identityId cookie in the browser: <guest-identity-id> (Path=/)

8. Sign in, then window.location.assign("/other"): the first request with the new tokens is /other
   /other  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
     request: /other
     signed in: true
     identityId: <user-identity-id>
   identityId cookie in the browser: (none)
   Cognito: <guest-identity-id> is now NotAuthorizedException: Access to Identity '<guest-identity-id>' is forbidden.

9. The session ends without signOut() (token cookies removed)

10. Load /
   / -> HTTP 200
     request: /
     signed in: false
     identityId: <new-guest-identity-id>
   identityId cookie in the browser: <new-guest-identity-id> (Path=/)
```

`npm run flow:invalid-guest-id`:

```
fetchAuthSession does not recover from an unusable guest identityId
next 16.3.8, aws-amplify 6.22.1, @aws-amplify/auth 6.21.1, @aws-amplify/adapter-nextjs 1.8.0

=== Unusable guest identityId cookie ===

1. Visit / as a guest
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=<guest-identity-id>;SameSite=lax;Secure;Path=/;Max-Age=31536000
   identityId cookie in the browser: <guest-identity-id> (Path=/)

2. Replace it with a well-formed identity ID that does not exist (e.g. deleted in the Cognito console)
   identityId cookie in the browser: <nonexistent-identity-id> (Path=/)
   / -> HTTP 500
     request: /
     ERROR ResourceNotFoundException: Identity '<nonexistent-identity-id>' not found.
   /other -> HTTP 500
     request: /other
     ERROR ResourceNotFoundException: Identity '<nonexistent-identity-id>' not found.
   /nested/page -> HTTP 500
     request: /nested/page
     ERROR ResourceNotFoundException: Identity '<nonexistent-identity-id>' not found.
   identityId cookie afterwards: <nonexistent-identity-id> (Path=/)

3. Replace it with a malformed value
   / -> HTTP 500
     request: /
     ERROR ValidationException: 1 validation error detected: Value 'not-an-identity-id' at 'identityId' failed to satisfy constraint: Member must satisfy regular expression pattern: [\w-]+:[0-9a-f-]+
   /other -> HTTP 500
     request: /other
     ERROR ValidationException: 1 validation error detected: Value 'not-an-identity-id' at 'identityId' failed to satisfy constraint: Member must satisfy regular expression pattern: [\w-]+:[0-9a-f-]+
   /nested/page -> HTTP 500
     request: /nested/page
     ERROR ValidationException: 1 validation error detected: Value 'not-an-identity-id' at 'identityId' failed to satisfy constraint: Member must satisfy regular expression pattern: [\w-]+:[0-9a-f-]+
   identityId cookie afterwards: not-an-identity-id (Path=/)

4. Delete the cookie by hand
   / -> HTTP 200
     request: /
     signed in: false
     identityId: <new-guest-identity-id>
   identityId cookie in the browser: <new-guest-identity-id> (Path=/)
```

### Reproducing by hand

1. Open `/` in a fresh browser profile and note the `com.amplify.Cognito.<identityPoolId>.identityId` cookie.
2. Sign in with "client-side navigation" selected. You land on `/other` through `/_next/data/…/other.json`.
3. In DevTools, that response has `Set-Cookie: …identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT` without `Path`,
   and the cookie is still there.
4. Delete the `CognitoIdentityServiceProvider.*` cookies and reload: the page shows the `NotAuthorizedException`.

## Demonstrating the fix

```bash
npm run flow:path-bug:with-fix
```

Runs the same flow, but every request carries a `repro-fix=path` cookie. For those requests, `getServerSideProps`
passes the response through `lib/path-fix.ts`, which adds a `Path=/` copy right after each path-less deletion and
changes nothing else. Without the cookie, the app shows Amplify's behaviour unchanged, so both versions run against
the same server.

`lib/path-fix.ts` is an app-level stand-in for the upstream fix: the browser receives the headers the fixed adapter
would send. Deletions of names that the same response also sets are left alone, which covers Amplify's own
delete-then-set in `setItem`.

Result: in run A the `/_next/data/…/other.json` response carries both deletions and the cookie is gone right after
sign-in. Cognito still links the guest identity to the user, but nothing keeps it any more, so after the session ends
every page works with a new guest identity, the same as control run B.

It only addresses the missing `Path`; `flow:invalid-guest-id` fails the same way with or without it.

### Recorded output

`npm run flow:path-bug:with-fix`:

```
adapter-nextjs: server-side cookie deletion without Path
next 16.3.8, aws-amplify 6.22.1, @aws-amplify/auth 6.21.1, @aws-amplify/adapter-nextjs 1.8.0
path fix: ON (server adds Path=/ to cookie deletions)

=== A. Sign in, then client-side navigation (router.push) to /other ===

1. Visit / as a guest
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=<guest-identity-id>;SameSite=lax;Secure;Path=/;Max-Age=31536000
   identityId cookie in the browser: <guest-identity-id> (Path=/)
   Cognito: <guest-identity-id> is usable as a guest identity

2. Sign in, then router.push("/other"): the first request with the new tokens is /_next/data/<buildId>/other.json
   /_next/data/<buildId>/other.json  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   /_next/data/<buildId>/other.json  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT;Path=/
     request: /_next/data/<buildId>/other.json
     signed in: true
     identityId: <user-identity-id>
   identityId cookie in the browser: (none)
   Cognito: <guest-identity-id> is now NotAuthorizedException: Access to Identity '<guest-identity-id>' is forbidden.

3. Client-side navigation to /nested/page
   identityId cookie in the browser: (none)

4. Full page load of /nested/page
   identityId cookie in the browser: (none)

5. The session ends without signOut() (token cookies removed, as after an expired or revoked refresh token)
   identityId cookie in the browser: (none)

6. Load every page
   / -> HTTP 200
     request: /
     signed in: false
     identityId: <new-guest-identity-id>
   /other -> HTTP 200
     request: /other
     signed in: false
     identityId: <new-guest-identity-id>
   /nested/page -> HTTP 200
     request: /nested/page
     signed in: false
     identityId: <new-guest-identity-id>
   identityId cookie in the browser: <new-guest-identity-id> (Path=/)

=== B. Control: the same, but a full page load of /other after sign-in ===

7. Visit / as a guest
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   /  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=<guest-identity-id>;SameSite=lax;Secure;Path=/;Max-Age=31536000
   identityId cookie in the browser: <guest-identity-id> (Path=/)

8. Sign in, then window.location.assign("/other"): the first request with the new tokens is /other
   /other  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT
   /other  ->  Set-Cookie: com.amplify.Cognito.<identityPoolId>.identityId=;Expires=Thu, 01 Jan 1970 00:00:00 GMT;Path=/
     request: /other
     signed in: true
     identityId: <user-identity-id>
   identityId cookie in the browser: (none)
   Cognito: <guest-identity-id> is now NotAuthorizedException: Access to Identity '<guest-identity-id>' is forbidden.

9. The session ends without signOut() (token cookies removed)

10. Load /
   / -> HTTP 200
     request: /
     signed in: false
     identityId: <new-guest-identity-id>
   identityId cookie in the browser: <new-guest-identity-id> (Path=/)
```

## Notes

- `lib/session.ts` catches the error from `fetchAuthSession` only to show it on the page with status 500. Without the
  catch, Next.js shows its generic error page; the error is the same.
- On a guest's first visit the server sends a path-less deletion followed by the real cookie. That deletion is
  Amplify's own `setItem` clearing older path-scoped cookies first; it is not part of the bug.
- The cause is in `packages/adapter-nextjs/src/utils/createCookieStorageAdapterFromNextServerContext.ts`: the `delete`
  of `createCookieStorageAdapterFromGetServerSidePropsContext` (used by `getServerSideProps` and Pages Router API
  routes) and of `createMutableCookieStoreFromHeaders` (App Router route handlers with a plain `Response`). The
  package's managed-login handlers already remove cookies with `path: '/'` (`createTokenCookiesRemoveOptions`).
- Middleware with `NextResponse` and Server Actions are not affected by the missing `Path`, because Next.js defaults
  it to `/` there.

## Versions

next 16.3.8, aws-amplify 6.22.1, @aws-amplify/auth 6.21.1, @aws-amplify/adapter-nextjs 1.8.0

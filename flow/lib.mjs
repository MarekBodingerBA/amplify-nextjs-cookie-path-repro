import { mkdirSync, readFileSync } from 'node:fs'

import { chromium } from 'playwright'

export const BASE_URL = (process.env.REPRO_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
export const OUTPUT_DIR = 'flow-output'
const HEADED = Boolean(process.env.HEADED)
/** `--with-fix` makes every request carry `repro-fix=path`, which turns on the fix in `lib/path-fix.ts`. */
export const WITH_FIX = process.argv.includes('--with-fix')
const outputName = (name) => (WITH_FIX ? `${name}-with-fix` : name)

const versionOf = (name) => {
  try {
    return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version
  } catch {
    return 'unknown'
  }
}

export const printHeader = (title) => {
  console.log(title)
  console.log(
    ['next', 'aws-amplify', '@aws-amplify/auth', '@aws-amplify/adapter-nextjs']
      .map((name) => `${name} ${versionOf(name)}`)
      .join(', '),
  )
  console.log(`app: ${BASE_URL}`)
  console.log(`path fix: ${WITH_FIX ? 'ON (server adds Path=/ to cookie deletions)' : 'off'}`)
}

let stepNumber = 0
export const section = (title) => console.log(`\n=== ${title} ===`)
export const step = (title) => console.log(`\n${++stepNumber}. ${title}`)
export const note = (text) => console.log(`   ${text}`)

export const launch = () => {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  return chromium.launch({ headless: !HEADED, slowMo: HEADED ? 300 : 0 })
}

const shortenCookieName = (setCookie) =>
  setCookie.replace(/^com\.amplify\.Cognito\.[^.=]+\.identityId/, 'com.amplify.Cognito.<identityPoolId>.identityId')

/**
 * Opens a page in a fresh browser context (no cookies) that records a video, and collects every `Set-Cookie` for
 * the identityId cookie that the app sends, so each step can print exactly what the server answered.
 */
export const openPage = async (browser, name) => {
  const viewport = { width: 1000, height: 800 }
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: `${OUTPUT_DIR}/${outputName(name)}`, size: viewport },
  })
  if (WITH_FIX) {
    await context.addCookies([{ name: 'repro-fix', value: 'path', url: BASE_URL }])
  }
  const page = await context.newPage()

  const pending = []
  const lines = []
  page.on('response', (response) => {
    if (!response.url().startsWith(BASE_URL)) {
      return
    }
    pending.push(
      response
        .headersArray()
        .then((headers) => {
          for (const header of headers) {
            if (header.name.toLowerCase() === 'set-cookie' && header.value.includes('.identityId=')) {
              lines.push(`${new URL(response.url()).pathname}  ->  Set-Cookie: ${shortenCookieName(header.value)}`)
            }
          }
        })
        .catch(() => {}),
    )
  })

  const printSetCookies = async () => {
    await page.waitForLoadState('networkidle').catch(() => {})
    await Promise.all(pending.splice(0))
    for (const line of lines.splice(0)) {
      note(line)
    }
  }

  return { context, page, printSetCookies }
}

export const load = async (page, path) => (await page.goto(`${BASE_URL}${path}`)).status()

export const getIdentityCookie = async (context) =>
  (await context.cookies(BASE_URL)).find((cookie) => cookie.name.endsWith('.identityId')) ?? null

export const describeCookie = (cookie) => (cookie ? `${cookie.value} (Path=${cookie.path})` : '(none)')

export const printIdentityCookie = async (context, label = 'identityId cookie in the browser') =>
  note(`${label}: ${describeCookie(await getIdentityCookie(context))}`)

export const setIdentityCookieValue = (context, cookie, value) => context.addCookies([{ ...cookie, value }])

export const printServerSession = async (page) => {
  const text = await page.getByTestId('server-session').innerText()
  for (const line of text.split('\n')) {
    note(`  ${line}`)
  }
}

/**
 * Asks Cognito directly, with no credentials, for guest credentials for an identity ID: the same call
 * `fetchAuthSession` makes for a signed-out user.
 */
export const probeIdentity = async (identityId) => {
  const region = identityId.split(':')[0]
  const response = await fetch(`https://cognito-identity.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity',
    },
    body: JSON.stringify({ IdentityId: identityId }),
  })
  if (response.ok) {
    return 'usable as a guest identity'
  }
  const body = await response.json()

  return `${body.__type}: ${body.message}`
}

/**
 * Signs in through the form on `/`. `mode` picks how the app then goes to `/other`: `client` uses `router.push`
 * (a `/_next/data` request), `full` uses `window.location.assign` (a document request).
 */
export const signIn = async (page, mode) => {
  const { REPRO_USERNAME: username, REPRO_PASSWORD: password } = process.env
  if (!username || !password) {
    throw new Error('Set REPRO_USERNAME and REPRO_PASSWORD in .env.local')
  }

  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByLabel(mode === 'client' ? 'client-side navigation' : 'full page load').check()
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Scoped to <main>: Next.js renders its own (empty) role="alert" route announcer outside of it.
  const alert = page.locator('main').getByRole('alert')
  await Promise.race([
    page.waitForURL(`${BASE_URL}/other`, { timeout: 30_000 }),
    alert.waitFor({ timeout: 30_000 }).then(async () => {
      throw new Error(`Sign-in failed: ${await alert.innerText()}`)
    }),
  ])
  await page.getByTestId('server-session').getByText('signed in: true').waitFor()
}

/**
 * Removes the user pool token cookies without calling `signOut()`. Stands in for a session that ends on its own,
 * e.g. an expired or revoked refresh token, where the server falls back to guest mode.
 */
export const endSessionWithoutSignOut = (context) =>
  context.clearCookies({ name: /^CognitoIdentityServiceProvider\./ })

export const screenshot = (page, name) =>
  page.screenshot({ path: `${OUTPUT_DIR}/${outputName(name)}.png`, fullPage: true })

export const closeAndReportVideo = async (context, page) => {
  const video = page.video()
  await context.close()
  if (video) {
    note(`video: ${await video.path()}`)
  }
}

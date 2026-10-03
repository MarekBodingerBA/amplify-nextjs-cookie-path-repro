// Shows that the server-side deletion of the guest identityId cookie has no Path, so it only works when the
// request URL is a single segment. Signs in twice with REPRO_USERNAME / REPRO_PASSWORD from .env.local.

import {
  BASE_URL,
  closeAndReportVideo,
  endSessionWithoutSignOut,
  getIdentityCookie,
  launch,
  load,
  note,
  openPage,
  printHeader,
  printIdentityCookie,
  printServerSession,
  probeIdentity,
  screenshot,
  section,
  signIn,
  step,
} from './lib.mjs'

printHeader('adapter-nextjs: server-side cookie deletion without Path')
const browser = await launch()

section('A. Sign in, then client-side navigation (router.push) to /other')
{
  const { context, page, printSetCookies } = await openPage(browser, 'A-client-side-navigation')

  step('Visit / as a guest')
  await load(page, '/')
  await printSetCookies()
  const guest = await getIdentityCookie(context)
  await printIdentityCookie(context)
  note(`Cognito: ${guest.value} is ${await probeIdentity(guest.value)}`)

  step('Sign in, then router.push("/other"): the first request with the new tokens is /_next/data/<buildId>/other.json')
  await signIn(page, 'client')
  await printSetCookies()
  await printServerSession(page)
  await printIdentityCookie(context)
  note(`Cognito: ${guest.value} is now ${await probeIdentity(guest.value)}`)
  await screenshot(page, 'A-after-sign-in')

  step('Client-side navigation to /nested/page')
  await page.getByRole('link', { name: '/nested/page', exact: true }).first().click()
  await page.waitForURL(`${BASE_URL}/nested/page`)
  await printSetCookies()
  await printIdentityCookie(context)

  step('Full page load of /nested/page')
  await load(page, '/nested/page')
  await printSetCookies()
  await printIdentityCookie(context)

  step('The session ends without signOut() (token cookies removed, as after an expired or revoked refresh token)')
  await endSessionWithoutSignOut(context)
  await printIdentityCookie(context)

  step('Load every page')
  for (const path of ['/', '/other', '/nested/page']) {
    note(`${path} -> HTTP ${await load(page, path)}`)
    await printServerSession(page)
  }
  await printIdentityCookie(context)
  await screenshot(page, 'A-after-session-end')

  await closeAndReportVideo(context, page)
}

section('B. Control: the same, but a full page load of /other after sign-in')
{
  const { context, page, printSetCookies } = await openPage(browser, 'B-full-page-load')

  step('Visit / as a guest')
  await load(page, '/')
  await printSetCookies()
  const guest = await getIdentityCookie(context)
  await printIdentityCookie(context)

  step('Sign in, then window.location.assign("/other"): the first request with the new tokens is /other')
  await signIn(page, 'full')
  await printSetCookies()
  await printServerSession(page)
  await printIdentityCookie(context)
  note(`Cognito: ${guest.value} is now ${await probeIdentity(guest.value)}`)

  step('The session ends without signOut() (token cookies removed)')
  await endSessionWithoutSignOut(context)

  step('Load /')
  note(`/ -> HTTP ${await load(page, '/')}`)
  await printServerSession(page)
  await printIdentityCookie(context)

  await closeAndReportVideo(context, page)
}

await browser.close()

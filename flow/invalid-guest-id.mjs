// Shows that fetchAuthSession throws, on every request, when the stored guest identityId is unusable, and never
// replaces it. Needs no user account.

import { randomUUID } from 'node:crypto'

import {
  closeAndReportVideo,
  getIdentityCookie,
  launch,
  load,
  note,
  openPage,
  printHeader,
  printIdentityCookie,
  printServerSession,
  screenshot,
  section,
  setIdentityCookieValue,
  step,
} from './lib.mjs'

const loadEveryPage = async (page) => {
  for (const path of ['/', '/other', '/nested/page']) {
    note(`${path} -> HTTP ${await load(page, path)}`)
    await printServerSession(page)
  }
}

printHeader('fetchAuthSession does not recover from an unusable guest identityId')
const browser = await launch()

section('Unusable guest identityId cookie')
const { context, page, printSetCookies } = await openPage(browser, 'invalid-guest-id')

step('Visit / as a guest')
await load(page, '/')
await printSetCookies()
const guest = await getIdentityCookie(context)
await printIdentityCookie(context)

step('Replace it with a well-formed identity ID that does not exist (e.g. deleted in the Cognito console)')
const region = guest.value.split(':')[0]
await setIdentityCookieValue(context, guest, `${region}:${randomUUID()}`)
await printIdentityCookie(context)
await loadEveryPage(page)
await printSetCookies()
await printIdentityCookie(context, 'identityId cookie afterwards')
await screenshot(page, 'invalid-guest-id-not-found')

step('Replace it with a malformed value')
await setIdentityCookieValue(context, guest, 'not-an-identity-id')
await loadEveryPage(page)
await printIdentityCookie(context, 'identityId cookie afterwards')

step('Delete the cookie by hand')
await context.clearCookies({ name: guest.name })
note(`/ -> HTTP ${await load(page, '/')}`)
await printServerSession(page)
await printIdentityCookie(context)

await closeAndReportVideo(context, page)
await browser.close()

import { fetchAuthSession } from 'aws-amplify/auth/server'
import type { GetServerSideProps } from 'next'

import { runWithAmplifyServerContext } from './amplify-server'
import { applyRootPathDeletions } from './path-fix'

/** Requests carrying `repro-fix=path` get the fix from `./path-fix`; all others show Amplify's behaviour unchanged. */
export const PATH_FIX_COOKIE = 'repro-fix'

export type SessionProps = {
  /** The URL the server actually handled: `/other` for a full page load, `/_next/data/<buildId>/other.json` for a client-side navigation. */
  requestUrl: string
  pathFix: boolean
  session:
    | { ok: true; signedIn: boolean; identityId: string | null }
    | { ok: false; error: { name: string; message: string } }
}

/**
 * The standard Pages Router pattern from the Amplify docs: `fetchAuthSession` in `getServerSideProps`, through
 * `runWithAmplifyServerContext`. Every page in this app uses it.
 */
export const getSessionProps: GetServerSideProps<SessionProps> = async ({ req, res }) => {
  const requestUrl = req.url ?? ''
  const pathFix = req.cookies[PATH_FIX_COOKIE] === 'path'

  const result = await runWithAmplifyServerContext({
    nextServerContext: { request: req, response: res },
    operation: async (contextSpec) => {
      try {
        const session = await fetchAuthSession(contextSpec)

        return {
          props: {
            requestUrl,
            pathFix,
            session: {
              ok: true as const,
              signedIn: Boolean(session.tokens),
              identityId: session.identityId ?? null,
            },
          },
        }
      } catch (error) {
        // Caught only so the error is visible on the page. Uncaught, Next.js renders its generic 500 page instead.
        res.statusCode = 500
        const { name, message } = error as Error

        return { props: { requestUrl, pathFix, session: { ok: false as const, error: { name, message } } } }
      }
    },
  })

  if (pathFix) {
    applyRootPathDeletions(res)
  }

  return result
}

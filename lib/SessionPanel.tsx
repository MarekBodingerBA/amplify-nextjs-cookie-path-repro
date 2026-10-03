import Link from 'next/link'
import { useRouter } from 'next/router'
import { type ReactNode, useEffect, useState } from 'react'

import type { SessionProps } from './session'

const readIdentityIdCookie = () =>
  document.cookie
    .split('; ')
    .find((cookie) => cookie.split('=')[0].endsWith('.identityId'))
    ?.split('=')[1] ?? null

const pages = ['/', '/other', '/nested/page']

export const SessionPanel = ({
  title,
  requestUrl,
  pathFix,
  session,
  children,
}: SessionProps & { title: string; children?: ReactNode }) => {
  const { asPath } = useRouter()
  const [identityIdCookie, setIdentityIdCookie] = useState<string | null>(null)

  useEffect(() => {
    setIdentityIdCookie(readIdentityIdCookie())
  }, [asPath])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>{title}</h1>
      {pathFix && (
        <p style={{ background: '#e6f4ea', padding: '6px 10px' }}>
          Path fix on: the server adds <code>Path=/</code> to Amplify&apos;s cookie deletions.
        </p>
      )}

      <nav style={{ display: 'grid', gap: 4 }}>
        <div>
          Client-side navigation (<code>next/link</code>):{' '}
          {pages.map((href) => (
            <Link key={href} href={href} style={{ marginRight: 12 }}>
              {href}
            </Link>
          ))}
        </div>
        <div>
          Full page load (<code>&lt;a&gt;</code>):{' '}
          {pages.map((href) => (
            <a key={href} href={href} style={{ marginRight: 12 }}>
              {href}
            </a>
          ))}
        </div>
      </nav>

      <h2>Server: fetchAuthSession in getServerSideProps</h2>
      <pre data-testid="server-session" style={{ whiteSpace: 'pre-wrap' }}>
        {`request: ${requestUrl}\n`}
        {session.ok
          ? `signed in: ${session.signedIn}\nidentityId: ${session.identityId}`
          : `ERROR ${session.error.name}: ${session.error.message}`}
      </pre>

      <h2>Browser: identityId cookie</h2>
      <pre data-testid="browser-identity-cookie">{identityIdCookie ?? '(none)'}</pre>

      {children}
    </main>
  )
}

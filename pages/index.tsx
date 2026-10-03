import { signIn, signOut } from 'aws-amplify/auth'
import { useRouter } from 'next/router'
import { type FormEvent, useState } from 'react'

import { getSessionProps, type SessionProps } from '../lib/session'
import { SessionPanel } from '../lib/SessionPanel'

type NavigationMode = 'client' | 'full'

export default function Home(props: SessionProps) {
  const router = useRouter()
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('client')
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)

    try {
      const { isSignedIn, nextStep } = await signIn({
        username: String(form.get('username')),
        password: String(form.get('password')),
      })
      if (!isSignedIn) {
        setError(`Sign-in not complete, next step: ${nextStep.signInStep}`)

        return
      }
    } catch (signInError) {
      setError(String(signInError))

      return
    }

    // Deliberately no client-side fetchAuthSession() here: the app relies on getServerSideProps for the session, so
    // the first request carrying the new tokens is the server request for /other.
    if (navigationMode === 'client') {
      await router.push('/other')
    } else {
      window.location.assign('/other')
    }
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.assign('/')
  }

  return (
    <SessionPanel title="Home" {...props}>
      <h2>Sign in</h2>
      <form onSubmit={handleSignIn} style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
        <label>
          Username <input name="username" autoComplete="username" required />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <fieldset>
          <legend>After sign-in, go to /other with</legend>
          <label>
            <input
              type="radio"
              name="navigationMode"
              checked={navigationMode === 'client'}
              onChange={() => setNavigationMode('client')}
            />{' '}
            client-side navigation (router.push)
          </label>
          <br />
          <label>
            <input
              type="radio"
              name="navigationMode"
              checked={navigationMode === 'full'}
              onChange={() => setNavigationMode('full')}
            />{' '}
            full page load
          </label>
        </fieldset>
        <button type="submit">Sign in</button>
      </form>
      {error && <p role="alert">{error}</p>}

      <h2>Sign out</h2>
      <button type="button" onClick={handleSignOut}>
        Sign out
      </button>
    </SessionPanel>
  )
}

export const getServerSideProps = getSessionProps

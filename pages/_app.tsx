import { Amplify } from 'aws-amplify'
import type { AppProps } from 'next/app'

import { amplifyConfig } from '../lib/amplify-config'

Amplify.configure(amplifyConfig, { ssr: true })

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

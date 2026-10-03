import type { ResourcesConfig } from 'aws-amplify'

const requireEnv = (name: string, value: string | undefined) => {
  if (!value) {
    throw new Error(`Missing ${name}, see .env.example`)
  }

  return value
}

export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: requireEnv('NEXT_PUBLIC_USER_POOL_ID', process.env.NEXT_PUBLIC_USER_POOL_ID),
      userPoolClientId: requireEnv(
        'NEXT_PUBLIC_USER_POOL_CLIENT_ID',
        process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID,
      ),
      identityPoolId: requireEnv(
        'NEXT_PUBLIC_IDENTITY_POOL_ID',
        process.env.NEXT_PUBLIC_IDENTITY_POOL_ID,
      ),
      allowGuestAccess: true,
    },
  },
}

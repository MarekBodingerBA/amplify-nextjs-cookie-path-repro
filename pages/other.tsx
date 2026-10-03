import { getSessionProps, type SessionProps } from '../lib/session'
import { SessionPanel } from '../lib/SessionPanel'

export default function Other(props: SessionProps) {
  return <SessionPanel title="Other" {...props} />
}

export const getServerSideProps = getSessionProps

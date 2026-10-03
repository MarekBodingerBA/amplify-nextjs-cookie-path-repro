import { getSessionProps, type SessionProps } from '../../lib/session'
import { SessionPanel } from '../../lib/SessionPanel'

export default function NestedPage(props: SessionProps) {
  return <SessionPanel title="Nested page" {...props} />
}

export const getServerSideProps = getSessionProps

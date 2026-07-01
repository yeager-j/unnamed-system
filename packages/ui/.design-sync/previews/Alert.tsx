import { SparkleIcon, WarningIcon } from "@phosphor-icons/react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

export function Default() {
  return (
    <Alert className="max-w-md">
      <AlertTitle>Rest complete</AlertTitle>
      <AlertDescription>
        HP and SP restored to full. Mastered Skills are ready for the next
        encounter.
      </AlertDescription>
    </Alert>
  )
}

export function Primary() {
  return (
    <Alert variant="primary" className="max-w-md">
      <SparkleIcon weight="fill" />
      <AlertTitle>Prime Time is available</AlertTitle>
      <AlertDescription>
        Two movements are in sync — trigger a Synthesis Skill this turn.
      </AlertDescription>
      <AlertAction>
        <Button size="sm">Cast</Button>
      </AlertAction>
    </Alert>
  )
}

export function Destructive() {
  return (
    <Alert variant="destructive" className="max-w-md">
      <WarningIcon weight="fill" />
      <AlertTitle>Vesper is Downed</AlertTitle>
      <AlertDescription>
        HP hit 0. Spend an action on a Revival Dia before the round ends or the
        knockout sticks.
      </AlertDescription>
    </Alert>
  )
}

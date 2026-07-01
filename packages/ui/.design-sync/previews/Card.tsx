import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function Default() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Corpus</CardTitle>
        <CardDescription>
          The body movement — physical presence, reach, and stance.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        Choose how your Persona occupies space. Corpus governs melee reach and
        the weight behind a Follow-Up.
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button size="sm">Confirm</Button>
      </CardFooter>
    </Card>
  )
}

export function Gilded() {
  return (
    <Card variant="gilded" className="max-w-sm">
      <CardHeader>
        <CardTitle>Prime Time</CardTitle>
        <CardDescription>A Synthesis Skill has come online.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        Gilded surfaces mark the rare, theatrical moments — reserve the gold for
        the marquee.
      </CardContent>
    </Card>
  )
}

export function Compact() {
  return (
    <Card size="sm" className="max-w-xs">
      <CardHeader>
        <CardTitle>Hit Points</CardTitle>
        <CardDescription>32 / 40</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        A compact card for dense stat blocks.
      </CardContent>
    </Card>
  )
}

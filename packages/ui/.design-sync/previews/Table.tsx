import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const party = [
  { name: "Rell Vantibrand", movement: "Corpus", hp: "38 / 40", sp: "9 / 16" },
  { name: "Sable Quiritch", movement: "Ortus", hp: "22 / 34", sp: "14 / 20" },
  { name: "Iven Coldmarrow", movement: "Animus", hp: "31 / 31", sp: "6 / 22" },
  {
    name: "Lysa Farthenwyle",
    movement: "Persona",
    hp: "17 / 28",
    sp: "18 / 18",
  },
]

export function PartyRoster() {
  return (
    <Table className="max-w-lg">
      <TableCaption>Active party — Act II, Scene 3.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Movement</TableHead>
          <TableHead className="text-right">HP</TableHead>
          <TableHead className="text-right">SP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {party.map((member) => (
          <TableRow key={member.name}>
            <TableCell className="font-medium">{member.name}</TableCell>
            <TableCell>
              <Badge variant="secondary">{member.movement}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {member.hp}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {member.sp}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Party members</TableCell>
          <TableCell className="text-right tabular-nums">4</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

export function InitiativeOrder() {
  const order = [
    { turn: 1, name: "Sable Quiritch", status: "Acting" },
    { turn: 2, name: "The Choirmaster", status: "Waiting" },
    { turn: 3, name: "Rell Vantibrand", status: "Charged" },
    { turn: 4, name: "Iven Coldmarrow", status: "Downed" },
  ]

  return (
    <Table className="max-w-md">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Combatant</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {order.map((row) => (
          <TableRow
            key={row.turn}
            data-state={row.turn === 1 ? "selected" : undefined}
          >
            <TableCell className="text-muted-foreground tabular-nums">
              {row.turn}
            </TableCell>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-right">
              <Badge
                variant={
                  row.status === "Downed"
                    ? "destructive"
                    : row.status === "Acting"
                      ? "default"
                      : "outline"
                }
              >
                {row.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

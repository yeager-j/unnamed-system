import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

export function Open() {
  return (
    <Select defaultOpen defaultValue="animus">
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Choose a movement" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Movements</SelectLabel>
          <SelectItem value="corpus">Corpus</SelectItem>
          <SelectItem value="ortus">Ortus</SelectItem>
          <SelectItem value="animus">Animus</SelectItem>
          <SelectItem value="persona">Persona</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Special</SelectLabel>
          <SelectItem value="showtime">Showtime!</SelectItem>
          <SelectItem value="prime-time">Prime Time</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function Closed() {
  return (
    <Select defaultValue="persona">
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Choose a movement" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="corpus">Corpus</SelectItem>
        <SelectItem value="ortus">Ortus</SelectItem>
        <SelectItem value="animus">Animus</SelectItem>
        <SelectItem value="persona">Persona</SelectItem>
      </SelectContent>
    </Select>
  )
}

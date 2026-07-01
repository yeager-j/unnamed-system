import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"

const skills = [
  "Cinder Lance",
  "Guarded Stance",
  "Mending Verse",
  "Piercing Insight",
  "Rallying Cry",
  "Shadowstep",
]

export function Search() {
  return (
    <Combobox items={skills} defaultOpen>
      <ComboboxInput placeholder="Search Skills…" className="w-64" />
      <ComboboxContent>
        <ComboboxEmpty>No Skills found.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export function Preselected() {
  return (
    <Combobox items={skills} defaultValue="Mending Verse" defaultOpen>
      <ComboboxInput placeholder="Search Skills…" className="w-64" />
      <ComboboxContent>
        <ComboboxEmpty>No Skills found.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

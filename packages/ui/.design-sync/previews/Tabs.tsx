import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

export function Default() {
  return (
    <Tabs defaultValue="corpus" className="max-w-sm">
      <TabsList>
        <TabsTrigger value="corpus">Corpus</TabsTrigger>
        <TabsTrigger value="ortus">Ortus</TabsTrigger>
        <TabsTrigger value="animus">Animus</TabsTrigger>
      </TabsList>
      <TabsContent value="corpus" className="text-muted-foreground">
        The body movement — physical presence, reach, and the stance you strike
        before a Follow-Up.
      </TabsContent>
      <TabsContent value="ortus" className="text-muted-foreground">
        The spirit movement — channel SP into elemental Skills and healing Dia.
      </TabsContent>
      <TabsContent value="animus" className="text-muted-foreground">
        The mind movement — resolve, insight, and the will to call Showtime!
      </TabsContent>
    </Tabs>
  )
}

export function Line() {
  return (
    <Tabs defaultValue="ortus" className="max-w-sm">
      <TabsList variant="line">
        <TabsTrigger value="corpus">Corpus</TabsTrigger>
        <TabsTrigger value="ortus">Ortus</TabsTrigger>
        <TabsTrigger value="persona">Persona</TabsTrigger>
      </TabsList>
      <TabsContent value="ortus" className="text-muted-foreground">
        The line variant underlines the active movement instead of boxing it —
        quieter chrome for dense sheets.
      </TabsContent>
    </Tabs>
  )
}

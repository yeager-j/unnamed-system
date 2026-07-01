import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

export function Default() {
  return (
    <Accordion defaultValue={["corpus"]} className="max-w-sm">
      <AccordionItem value="corpus">
        <AccordionTrigger>How does Corpus reach work?</AccordionTrigger>
        <AccordionContent>
          <p>
            Corpus governs melee reach and the weight behind a Follow-Up. A
            larger stance threatens more zones when you close in.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="ortus">
        <AccordionTrigger>When can I spend SP on Ortus?</AccordionTrigger>
        <AccordionContent>
          <p>
            Ortus Skills draw from your Spirit Pool. Cast during your turn, then
            recover SP on a Rest.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="showtime">
        <AccordionTrigger>What triggers Showtime!?</AccordionTrigger>
        <AccordionContent>
          <p>
            When the whole party lands a Follow-Up in the same round, the war
            cry goes up and Showtime! resolves as one theatrical all-out attack.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

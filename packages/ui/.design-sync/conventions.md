# Showtime! UI — how to build with this design system

A **dark-only** React component library (shadcn/ui primitives on Base UI, Tailwind
CSS v4). Brand: "mystical theater" — a deep **indigo** primary, a rationed **gold**
accent for marquee moments, on near-black surfaces. Every component is imported from
`window.ShowtimeUI.*` (e.g. `ShowtimeUI.Button`). All 40 documented components plus
their sub-parts (e.g. `CardHeader`, `DialogContent`, `TableRow`) are exported.

## Setup & wrapping
- **Theme is dark, always.** Tokens live in `styles.css` on `:root` (there is no light
  mode). Put content on `bg-background text-foreground`; surfaces use `bg-card` /
  `bg-popover`. No theme provider is required for styling.
- **Most components need no provider.** Exceptions:
  - **Tooltip** → wrap the app (or the region) in `<TooltipProvider>`; each tooltip is
    `Tooltip` + `TooltipTrigger` + `TooltipContent`.
  - **Sidebar** → wrap in `<SidebarProvider>`.
  - **Toaster** (notifications) → render one `<Toaster />` near the root, then call
    `toast("…", { description: "…" })` (imported from `sonner`) to show messages.
- **Overlays are controlled Base UI parts.** `Dialog`, `AlertDialog`, `Sheet`, `Drawer`,
  `Popover`, `DropdownMenu`, `Select`, `Combobox` open via `open` / `defaultOpen` on the
  root and compose a `*Trigger` + `*Content`. Menu group labels (`DropdownMenuLabel`)
  MUST sit inside a `DropdownMenuGroup` / `DropdownMenuRadioGroup`.

## Styling idiom — Tailwind utilities over DS tokens
Style with Tailwind utility classes bound to the DS's semantic tokens. **Use these token
utilities, not raw colors** (never `bg-zinc-900` / `text-white`):

| Role | Utilities |
|---|---|
| Surfaces | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary` |
| Text | `text-foreground`, `text-muted-foreground`, `text-card-foreground` |
| Primary (indigo) | `bg-primary` / `text-primary-foreground` |
| Destructive | `bg-destructive`, `text-destructive` |
| Borders / focus | `border-border`, `ring-ring` |
| **Gold accent** | `text-gold`, `border-gold` — and `Button`/`Card` `variant="gilded"`. **Ration it**: marquee moments only (Showtime!, Prime Time), never routine controls. |
| Game vitals | `bg-hp` (health), `bg-sp` (spirit) — plus `Badge` variants `hp` / `sp` / `engaged` |
| Radius | `rounded-md` / `rounded-lg` / `rounded-xl` (scale off `--radius`) |

Type: body/UI is **Hanken Grotesk** (the default `font-sans`); the display serif **DM
Serif Display** (`font-display`) is reserved for marquee titles only. Components already
apply the right face — you rarely set fonts yourself.

## Where the truth lives
- **`styles.css`** — every token (`--background`, `--primary`, `--gold`, `--hp`, `--sp`,
  radius, fonts). Read it before inventing values.
- **`components/<group>/<Name>/<Name>.d.ts`** — the exact prop contract per component.
- **`components/<group>/<Name>/<Name>.prompt.md`** — usage + composition per component.

## One idiomatic build
```tsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
        Button, Badge } = window.ShowtimeUI

function RestPrompt() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Vesper Nightingale</CardTitle>
        <CardDescription>Corpus · Level 4</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-muted-foreground">
        <Badge variant="hp">HP 28/28</Badge>
        <Badge variant="sp">SP 40/40</Badge>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" size="sm">Keep moving</Button>
        <Button variant="gilded" size="sm">Make camp</Button>
      </CardFooter>
    </Card>
  )
}
```

# `components/dungeon` — dungeon run console + player watch

**Dungeon run console + player watch** (UNN-463/464/467; spatial M2 exploration).

Organized **by phase/viewer**: root holds the three route-facing entries (run-console = DM console rendering the exploration Play phase, prep = DM draft placement, watch = player read-only view) + explore-sheet-column (the watch's own-sheet column rendering the sheet's Explore tab). shell/ is the persistent DungeonConsoleShell + DungeonSidebarSlot (UNN-488, eases --sidebar-width across phase swaps).

explore/ is the Play phase (body, party-sidebar, zone-sheet, exit-row, use-dungeon-console, dispatch-event). The setup/, combat/, and shared/ (enemy staging) folders were removed with the v1 combat hard cutover (UNN-535); dungeon combat returns on engine v2 in PR11d, and the Play bar's "Start an encounter" is a disabled placeholder until then.

canvas/ is the React Flow layer: shared core at its root (canvas, build-nodes, types, zone-card-frame, connection-edge, floating-edge-handles, token-glyph, viewport-store, mode-toggle, edit-canvas) + a subfolder per surface — explore/ and watch/ (the player view, formerly "fog"; the fog-of-war *mechanic* keeps the engine's ConnectionFogState name). Each holds its own zone-node/token-chip/context; watch/ also owns engaged-cluster. (The exploration canvas folder is explore/ to match its dungeon-level sibling, though the DungeonCanvasMode literal it keys off is still 'play'. The combat/ and setup/ canvas subfolders return in PR11d.)

Imports cross-reference via the @/components/dungeon/… alias. Rendered by app/dungeon/[shortId]/ (DM) + app/c/dungeon/[shortId]/ (watch).

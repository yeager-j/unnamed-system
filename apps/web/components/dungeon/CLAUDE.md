# `components/dungeon` — dungeon run console + player watch

**Dungeon run console + player watch** (UNN-463/464/467; spatial M2 exploration).

Organized **by phase/viewer**: root holds the three route-facing entries (run-console = DM console forking play/setup/combat, prep = DM draft placement, watch = player read-only view) + explore-sheet-column (the watch's own-sheet column rendering the sheet's Explore tab). shell/ is the persistent DungeonConsoleShell + DungeonSidebarSlot (UNN-488, eases --sidebar-width across phase swaps).

The DM phases each get a folder — explore/ (play: body, party-sidebar, zone-sheet, exit-row, use-dungeon-console, dispatch-event), setup/ (body, sidebar, enemy-picker-dialog, board), combat/ (body, sidebar, add-combatant-dialog; reuses the shared combat/ kit) — plus shared/ (enemy-catalog-dialog, use-staged-enemies).

canvas/ is the React Flow layer: shared core at its root (canvas, build-nodes, types, zone-card-frame, connection-edge, floating-edge-handles, token-glyph, viewport-store, mode-toggle, edit-canvas) + a subfolder per phase mirroring the top level — explore/, combat/, setup/, and watch/ (the player view, formerly "fog"; the fog-of-war *mechanic* keeps the engine's ConnectionFogState name). Each holds its own zone-node/token-chip/context. (The exploration canvas folder is explore/ to match its dungeon-level sibling, though the DungeonCanvasMode literal it keys off is still 'play'.)

Imports cross-reference via the @/components/dungeon/… alias. Rendered by app/dungeon/[shortId]/ (DM) + app/c/dungeon/[shortId]/ (watch).

import {
  consumePrismaAction,
  damageAction,
  healAction,
  recoverSPAction,
  spendSPAction,
} from "@/lib/actions/adjust-pools"

import type { Command, CommandContext } from "./types"

/**
 * Header vital-action commands (group "Vitals"), all owner-only. Each routes
 * through the *existing* UNN-155 Server Actions via the shared
 * {@link CommandContext.write} dispatch — no new write path. Damage / Heal /
 * Spend SP prompt for an amount on a palette sub-page; Use Prisma is single-shot
 * and disables itself at 0 charges. A generator (not constants) so the Prisma
 * disabled state re-derives from the live character on every open.
 */
export function vitalsCommands(ctx: CommandContext): Command[] {
  return [
    {
      id: "vitals.damage",
      label: "Take damage",
      group: "Vitals",
      requiresOwner: true,
      keywords: ["hurt", "hp", "harm"],
      parameter: {
        label: "Damage amount",
        placeholder: "0",
        submitLabel: "Take damage",
        run: (ctx, amount) =>
          ctx.write.write({
            edit: { kind: "damage", amount },
            surface: "pools",
            action: (expectedVersion) =>
              damageAction({
                characterId: ctx.character.id,
                amount,
                expectedVersion,
              }),
          }),
      },
    },
    {
      id: "vitals.heal",
      label: "Heal",
      group: "Vitals",
      requiresOwner: true,
      keywords: ["restore", "hp", "mend"],
      parameter: {
        label: "Heal amount",
        placeholder: "0",
        submitLabel: "Heal",
        run: (ctx, amount) =>
          ctx.write.write({
            edit: { kind: "heal", amount },
            surface: "pools",
            action: (expectedVersion) =>
              healAction({
                characterId: ctx.character.id,
                amount,
                expectedVersion,
              }),
          }),
      },
    },
    {
      id: "vitals.spend-sp",
      label: "Spend SP",
      group: "Vitals",
      requiresOwner: true,
      keywords: ["sp", "spend", "spirit"],
      parameter: {
        label: "SP to spend",
        placeholder: "0",
        submitLabel: "Spend SP",
        run: (ctx, amount) =>
          ctx.write.write({
            edit: { kind: "spendSP", amount },
            surface: "pools",
            action: (expectedVersion) =>
              spendSPAction({
                characterId: ctx.character.id,
                amount,
                expectedVersion,
              }),
          }),
      },
    },
    {
      id: "vitals.recover-sp",
      label: "Recover SP",
      group: "Vitals",
      requiresOwner: true,
      keywords: ["sp", "recover", "restore", "spirit"],
      parameter: {
        label: "SP to recover",
        placeholder: "0",
        submitLabel: "Recover SP",
        run: (ctx, amount) =>
          ctx.write.write({
            edit: { kind: "recoverSP", amount },
            surface: "pools",
            action: (expectedVersion) =>
              recoverSPAction({
                characterId: ctx.character.id,
                amount,
                expectedVersion,
              }),
          }),
      },
    },
    {
      id: "vitals.use-prisma",
      label: "Use Prisma",
      description: `${ctx.character.prismaCharges} remaining`,
      group: "Vitals",
      requiresOwner: true,
      keywords: ["flask", "prisma", "charge"],
      disabled:
        ctx.character.prismaCharges === 0
          ? { reason: "No Prisma charges" }
          : undefined,
      run: (ctx) =>
        ctx.write.write({
          edit: { kind: "usePrisma" },
          surface: "prisma",
          action: (expectedVersion) =>
            consumePrismaAction({
              characterId: ctx.character.id,
              expectedVersion,
            }),
        }),
    },
  ]
}

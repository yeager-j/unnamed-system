"use server"

import { requireOwnerOrCampaignDM } from "@/lib/auth/campaign-access"
import {
  applyDamageForCharacter,
  applyHealForCharacter,
  applyRecoverSPForCharacter,
  applySpendSPForCharacter,
  applyUsePrismaForCharacter,
  type DamagePersistenceSuccess,
  type HealPersistenceSuccess,
  type RecoverSPPersistenceSuccess,
  type SpendSPPersistenceSuccess,
  type UsePrismaPersistenceSuccess,
} from "@/lib/db/writes/adjust-pools"
import { err, type Result } from "@/lib/result"

import {
  DamageSchema,
  HealSchema,
  RecoverSPSchema,
  SpendSPSchema,
  UsePrismaSchema,
  type AdjustPoolActionError,
  type DamageInput,
  type HealInput,
  type RecoverSPInput,
  type SpendSPInput,
  type UsePrismaActionError,
  type UsePrismaInput,
} from "./adjust-pools.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Server Actions for the header owner-mode actions affordance (PRD §6.1 /
 * §7.6, UNN-155). All five wrap a vitals-class persistence primitive from
 * `lib/db/writes/adjust-pools.ts`. Auth is `requireOwnerOrCampaignDM` — the
 * character's owner or the DM of the campaign it's placed in may adjust HP/SP;
 * everyone else gets `forbidden()`. After a successful write,
 * `revalidateCharacter` re-derives
 * every dependent display value (Vitals bars, Fallen badge, Prisma count in
 * the menu).
 */

export async function damageAction(
  input: DamageInput
): Promise<Result<DamagePersistenceSuccess, AdjustPoolActionError>> {
  const parsed = DamageSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwnerOrCampaignDM(parsed.data.characterId)

  const result = await applyDamageForCharacter(
    character.id,
    parsed.data.amount,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function healAction(
  input: HealInput
): Promise<Result<HealPersistenceSuccess, AdjustPoolActionError>> {
  const parsed = HealSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwnerOrCampaignDM(parsed.data.characterId)

  const result = await applyHealForCharacter(
    character.id,
    parsed.data.amount,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function spendSPAction(
  input: SpendSPInput
): Promise<Result<SpendSPPersistenceSuccess, AdjustPoolActionError>> {
  const parsed = SpendSPSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwnerOrCampaignDM(parsed.data.characterId)

  const result = await applySpendSPForCharacter(
    character.id,
    parsed.data.amount,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function recoverSPAction(
  input: RecoverSPInput
): Promise<Result<RecoverSPPersistenceSuccess, AdjustPoolActionError>> {
  const parsed = RecoverSPSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwnerOrCampaignDM(parsed.data.characterId)

  const result = await applyRecoverSPForCharacter(
    character.id,
    parsed.data.amount,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function consumePrismaAction(
  input: UsePrismaInput
): Promise<Result<UsePrismaPersistenceSuccess, UsePrismaActionError>> {
  const parsed = UsePrismaSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwnerOrCampaignDM(parsed.data.characterId)

  const result = await applyUsePrismaForCharacter(
    character.id,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

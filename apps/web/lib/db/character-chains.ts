import { type Result } from "../game/result"
import {
  addNamedEntry,
  loadNamedEntries,
  removeNamedEntry,
  updateNamedEntryDescription,
  updateNamedEntryTitle,
} from "./named-entry-list"
import { characterChains } from "./schema/character"

/**
 * Persistence for the Step-3 Chains repeating list (rulebook 1.4). Mirrors
 * `character-knives.ts` — see `named-entry-list.ts` for the shared logic
 * and that file's header for the rationale.
 */

export type CharacterChainPersistenceError =
  | "character-not-found"
  | "chain-not-found"
  | "stale"

export interface CharacterChainPersistenceSuccess {
  version: number
}

export interface AddChainSuccess extends CharacterChainPersistenceSuccess {
  id: string
  order: number
}

export function addCharacterChain(
  characterId: string,
  title: string,
  description: string | null,
  expectedVersion: number
): Promise<Result<AddChainSuccess, CharacterChainPersistenceError>> {
  return addNamedEntry(
    characterChains,
    characterId,
    title,
    description,
    expectedVersion
  )
}

export function updateCharacterChainTitle(
  characterId: string,
  chainId: string,
  title: string,
  expectedVersion: number
): Promise<
  Result<CharacterChainPersistenceSuccess, CharacterChainPersistenceError>
> {
  return updateNamedEntryTitle(
    characterChains,
    "chain-not-found" as const,
    characterId,
    chainId,
    title,
    expectedVersion
  )
}

export function updateCharacterChainDescription(
  characterId: string,
  chainId: string,
  description: string | null,
  expectedVersion: number
): Promise<
  Result<CharacterChainPersistenceSuccess, CharacterChainPersistenceError>
> {
  return updateNamedEntryDescription(
    characterChains,
    "chain-not-found" as const,
    characterId,
    chainId,
    description,
    expectedVersion
  )
}

export function removeCharacterChain(
  characterId: string,
  chainId: string,
  expectedVersion: number
): Promise<
  Result<CharacterChainPersistenceSuccess, CharacterChainPersistenceError>
> {
  return removeNamedEntry(
    characterChains,
    "chain-not-found" as const,
    characterId,
    chainId,
    expectedVersion
  )
}

export function loadCharacterChains(characterId: string) {
  return loadNamedEntries(characterChains, characterId)
}

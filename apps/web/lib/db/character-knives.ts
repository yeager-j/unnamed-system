import { type Result } from "../result"
import {
  addNamedEntry,
  loadNamedEntries,
  removeNamedEntry,
  updateNamedEntryDescription,
  updateNamedEntryTitle,
} from "./named-entry-list"
import { characterKnives } from "./schema/character"

/**
 * Persistence for the Step-3 Knives repeating list (rulebook 1.4). All of
 * the heavy lifting — identity-class bumping, transaction shape, optimistic
 * concurrency, normalize-empty rules — lives in `named-entry-list.ts`,
 * which the Chains module also calls. This file's job is to bind those
 * generic helpers to the `characterKnives` table and surface a
 * domain-specific `knife-not-found` error string.
 */

export type CharacterKnifePersistenceError =
  | "character-not-found"
  | "knife-not-found"
  | "stale"

export interface CharacterKnifePersistenceSuccess {
  version: number
}

export interface AddKnifeSuccess extends CharacterKnifePersistenceSuccess {
  id: string
  order: number
}

export function addCharacterKnife(
  characterId: string,
  title: string,
  description: string | null,
  expectedVersion: number
): Promise<Result<AddKnifeSuccess, CharacterKnifePersistenceError>> {
  return addNamedEntry(
    characterKnives,
    characterId,
    title,
    description,
    expectedVersion
  )
}

export function updateCharacterKnifeTitle(
  characterId: string,
  knifeId: string,
  title: string,
  expectedVersion: number
): Promise<
  Result<CharacterKnifePersistenceSuccess, CharacterKnifePersistenceError>
> {
  return updateNamedEntryTitle(
    characterKnives,
    "knife-not-found" as const,
    characterId,
    knifeId,
    title,
    expectedVersion
  )
}

export function updateCharacterKnifeDescription(
  characterId: string,
  knifeId: string,
  description: string | null,
  expectedVersion: number
): Promise<
  Result<CharacterKnifePersistenceSuccess, CharacterKnifePersistenceError>
> {
  return updateNamedEntryDescription(
    characterKnives,
    "knife-not-found" as const,
    characterId,
    knifeId,
    description,
    expectedVersion
  )
}

export function removeCharacterKnife(
  characterId: string,
  knifeId: string,
  expectedVersion: number
): Promise<
  Result<CharacterKnifePersistenceSuccess, CharacterKnifePersistenceError>
> {
  return removeNamedEntry(
    characterKnives,
    "knife-not-found" as const,
    characterId,
    knifeId,
    expectedVersion
  )
}

export function loadCharacterKnives(characterId: string) {
  return loadNamedEntries(characterKnives, characterId)
}

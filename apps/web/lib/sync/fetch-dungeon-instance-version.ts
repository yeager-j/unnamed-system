"use client"

import { getDungeonInstanceVersionAction } from "@/lib/actions/dungeon/instance-version"

import { makeVersionRefetcher } from "./make-version-refetcher"

/**
 * Adapts {@link getDungeonInstanceVersionAction} into the `refetchVersion`
 * shape {@link import("./use-queued-write").useQueuedWrite} expects — the
 * dungeon-console twin of {@link import("./fetch-instance-version").fetchInstanceVersion}
 * (which targets the *encounter's* Instance), so the console's two lanes get
 * the identical one-shot stale-retry wiring (UNN-589 D11).
 */
export const fetchDungeonInstanceVersion = makeVersionRefetcher(
  getDungeonInstanceVersionAction
)

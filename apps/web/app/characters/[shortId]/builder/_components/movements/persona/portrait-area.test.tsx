// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import { PortraitArea } from "./portrait-area"

const runOnce = vi.fn()
const dispatch = vi.fn()
const uploadEntityPortraitAction = vi.fn()

vi.mock("@/domain/entity/use-entity-write", () => ({
  useLoadedCharacter: () => ({
    profile: {
      id: "e1",
      portraitUrl: "https://example.test/portrait.png",
    },
  }),
  useEntityIdentityAction: () => ({ entityId: "e1", runOnce }),
  useEntityColumnWrite: () => ({ pending: false, dispatch }),
}))

vi.mock("@/lib/actions/entity/columns", () => ({
  uploadEntityPortraitAction: (formData: FormData) =>
    uploadEntityPortraitAction(formData),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

beforeEach(() => {
  runOnce.mockReset().mockImplementation((action) => action(7))
  dispatch.mockReset()
  uploadEntityPortraitAction
    .mockReset()
    .mockResolvedValue(ok({ version: 8, url: "https://blob.test/new.png" }))
})

afterEach(cleanup)

describe("PortraitArea write classification", () => {
  it("uploads the Blob through one preconditioned single attempt", async () => {
    const { container } = render(<PortraitArea />)
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error("portrait file input missing")

    fireEvent.change(input, {
      target: {
        files: [new File(["portrait"], "portrait.png", { type: "image/png" })],
      },
    })

    await waitFor(() =>
      expect(uploadEntityPortraitAction).toHaveBeenCalledTimes(1)
    )
    expect(runOnce).toHaveBeenCalledTimes(1)
    const formData = uploadEntityPortraitAction.mock.calls[0]![0] as FormData
    expect(formData.get("entityId")).toBe("e1")
    expect(formData.get("expectedVersion")).toBe("7")
  })

  it("removes the portrait through replayable column intent", () => {
    render(<PortraitArea />)

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    expect(dispatch).toHaveBeenCalledWith(
      { column: "portraitUrl", value: null },
      { messages: { error: "Couldn't remove the portrait. Try again." } }
    )
  })
})

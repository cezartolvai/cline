import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { AutoApprovalActions, AutoApprovalSettingsRequest } from "@shared/proto/cline/state"
import { describe, expect, it, vi } from "vitest"
import { updateAutoApprovalSettings } from "@/core/controller/state/updateAutoApprovalSettings"

describe("Collaboration Auto-approve setting", () => {
	it("survives protobuf serialization in both directions", () => {
		for (const enabled of [true, false]) {
			const value = AutoApprovalActions.create({ planActCollaboration: enabled })
			expect(AutoApprovalActions.decode(AutoApprovalActions.encode(value).finish()).planActCollaboration).toBe(enabled)
			expect(AutoApprovalActions.fromJSON(AutoApprovalActions.toJSON(value)).planActCollaboration).toBe(enabled)
		}
	})
	it("persists disablement and cancels pending handoffs", async () => {
		const settings = structuredClone(DEFAULT_AUTO_APPROVAL_SETTINGS)
		settings.actions.planActCollaboration = true
		const controller = {
			getStateToPostToWebview: async () => ({ autoApprovalSettings: settings }),
			cancelCollaborationHandoff: vi.fn(),
			stateManager: { setGlobalState: vi.fn(), setTaskSettings: vi.fn() },
			task: { taskId: "task" },
			postStateToWebview: vi.fn(),
		}
		await updateAutoApprovalSettings(
			controller as never,
			AutoApprovalSettingsRequest.create({ version: 2, actions: { planActCollaboration: false } }),
		)
		expect(controller.cancelCollaborationHandoff).toHaveBeenCalledOnce()
		expect(controller.stateManager.setGlobalState).toHaveBeenCalledWith(
			"autoApprovalSettings",
			expect.objectContaining({ actions: expect.objectContaining({ planActCollaboration: false, useMcp: true }) }),
		)
		expect(controller.stateManager.setTaskSettings).toHaveBeenCalledOnce()
	})
})

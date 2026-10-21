import { Empty } from "@shared/proto/cline/common"
import { AutoApprovalSettingsRequest } from "@shared/proto/cline/state"
import { Controller } from ".."

/**
 * Updates the auto approval settings
 * @param controller The controller instance
 * @param request The auto approval settings request
 * @returns Empty response
 */
export async function updateAutoApprovalSettings(controller: Controller, request: AutoApprovalSettingsRequest): Promise<Empty> {
	const currentSettings = (await controller.getStateToPostToWebview()).autoApprovalSettings
	const incomingVersion = request.version
	const currentVersion = currentSettings?.version ?? 1

	// Only update if incoming version is higher
	if (incomingVersion > currentVersion) {
		// Merge with current settings to preserve unspecified fields
		const settings = {
			...currentSettings,
			...(request.version !== undefined && { version: request.version }),
			...(request.enableNotifications !== undefined && { enableNotifications: request.enableNotifications }),
			...(request.planResponsibilities !== undefined && {
				planResponsibilities: request.planResponsibilities.slice(0, 6000),
			}),
			...(request.actResponsibilities !== undefined && { actResponsibilities: request.actResponsibilities.slice(0, 6000) }),
			...(request.planMayAdjustActResponsibilities !== undefined && {
				planMayAdjustActResponsibilities: request.planMayAdjustActResponsibilities,
			}),
			actions: {
				...currentSettings.actions,
				...(request.actions
					? Object.fromEntries(Object.entries(request.actions).filter(([_, v]) => v !== undefined))
					: {}),
			},
		}

		if (settings.actions.planActCollaboration !== true) controller.cancelCollaborationHandoff()
		controller.stateManager.setGlobalState("autoApprovalSettings", settings)
		if (controller.task?.taskId) {
			controller.stateManager.setTaskSettings(controller.task.taskId, "autoApprovalSettings", settings)
		}

		await controller.postStateToWebview()
	}

	return Empty.create()
}

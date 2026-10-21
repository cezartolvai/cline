export interface AutoApprovalSettings {
	// Version for race condition prevention (incremented on every change)
	version: number
	// Legacy field - kept for backward compatibility with older extension versions
	// Auto-approve is now always enabled by default
	enabled: boolean
	// Legacy field - kept for backward compatibility with older extension versions
	// Favorites feature has been removed
	favorites: string[]
	// Legacy field - kept for backward compatibility with older extension versions
	// Max requests limit feature has been removed
	maxRequests: number
	// Individual action permissions
	actions: {
		readFiles: boolean // Read files and directories
		readFilesExternally?: boolean // Legacy field - kept for backward compatibility with older extension versions
		editFiles: boolean // Edit files
		editFilesExternally?: boolean // Legacy field - kept for backward compatibility with older extension versions
		executeSafeCommands?: boolean // Execute commands
		executeAllCommands?: boolean // Legacy field - kept for backward compatibility with older extension versions
		useBrowser: boolean // Use browser
		useMcp: boolean // Use MCP servers
		planActCollaboration?: boolean // Opt-in model handoffs, independent of other MCP tools
	}
	// Collaboration role instructions, applied when Plan ↔ Act collaboration is enabled
	planResponsibilities?: string
	actResponsibilities?: string
	planMayAdjustActResponsibilities?: boolean
	// Global settings
	enableNotifications: boolean // Show notifications for approval and task completion
}

export const DEFAULT_PLAN_RESPONSIBILITIES =
	"Own discovery, architecture, constraints, task decomposition and acceptance criteria. Review Act reports and decide whether the task is complete."
export const DEFAULT_ACT_RESPONSIBILITIES =
	"Own implementation, edits, refactors, commands, diagnosis and tests. Report evidence and remaining risks to Plan; never finalize the task."

export const DEFAULT_AUTO_APPROVAL_SETTINGS: AutoApprovalSettings = {
	version: 1,
	enabled: true, // Legacy field - always true by default
	favorites: [], // Legacy field - kept as empty array
	maxRequests: 20, // Legacy field - kept for backward compatibility
	actions: {
		readFiles: true,
		readFilesExternally: true,
		editFiles: true,
		editFilesExternally: true,
		executeSafeCommands: false,
		executeAllCommands: true,
		useBrowser: true,
		useMcp: true,
		planActCollaboration: false,
	},
	planResponsibilities: DEFAULT_PLAN_RESPONSIBILITIES,
	actResponsibilities: DEFAULT_ACT_RESPONSIBILITIES,
	planMayAdjustActResponsibilities: false,
	enableNotifications: false,
}

import { DEFAULT_ACT_RESPONSIBILITIES, DEFAULT_PLAN_RESPONSIBILITIES } from "@shared/AutoApprovalSettings"
import { VSCodeButton, VSCodeCheckbox, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import React, { useEffect, useRef, useState } from "react"
import { useClickAway } from "react-use"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAutoApproveActions } from "@/hooks/useAutoApproveActions"
import { getAsVar, VSC_TITLEBAR_INACTIVE_FOREGROUND } from "@/utils/vscStyles"
import AutoApproveMenuItem from "./AutoApproveMenuItem"
import { updateAutoApproveSettings } from "./AutoApproveSettingsAPI"
import { ActionMetadata } from "./types"

const breakpoint = 500

interface AutoApproveModalProps {
	isVisible: boolean
	setIsVisible: (visible: boolean) => void
	buttonRef: React.RefObject<HTMLDivElement>
	ACTION_METADATA: ActionMetadata[]
	cloudAutoApprove?: boolean
}

const AutoApproveModal: React.FC<AutoApproveModalProps> = ({
	isVisible,
	setIsVisible,
	buttonRef,
	ACTION_METADATA,
	cloudAutoApprove = false,
}) => {
	const { isChecked, updateAction } = useAutoApproveActions()
	const { autoApprovalSettings } = useExtensionState()
	const [planResponsibilities, setPlanResponsibilities] = useState(
		autoApprovalSettings.planResponsibilities ?? DEFAULT_PLAN_RESPONSIBILITIES,
	)
	const [actResponsibilities, setActResponsibilities] = useState(
		autoApprovalSettings.actResponsibilities ?? DEFAULT_ACT_RESPONSIBILITIES,
	)
	const [savingResponsibilities, setSavingResponsibilities] = useState(false)
	const [planMayAdjustActResponsibilities, setPlanMayAdjustActResponsibilities] = useState(
		autoApprovalSettings.planMayAdjustActResponsibilities ?? false,
	)
	const displayedIsChecked = cloudAutoApprove ? () => true : isChecked
	const modalRef = useRef<HTMLDivElement>(null)
	const itemsContainerRef = useRef<HTMLDivElement>(null)
	const [containerWidth, setContainerWidth] = useState(0)

	useClickAway(modalRef, (e) => {
		// Skip if click was on the button that toggles the modal
		if (buttonRef.current && buttonRef.current.contains(e.target as Node)) {
			return
		}
		setIsVisible(false)
	})

	// Track container width for responsive layout
	useEffect(() => {
		if (!isVisible) {
			return
		}

		const updateWidth = () => {
			if (itemsContainerRef.current) {
				setContainerWidth(itemsContainerRef.current.offsetWidth)
			}
		}

		// Initial measurement
		updateWidth()

		// Set up resize observer
		const resizeObserver = new ResizeObserver(updateWidth)
		if (itemsContainerRef.current) {
			resizeObserver.observe(itemsContainerRef.current)
		}

		// Clean up
		return () => {
			resizeObserver.disconnect()
		}
	}, [isVisible])

	useEffect(() => {
		if (!isVisible) return
		setPlanResponsibilities(autoApprovalSettings.planResponsibilities ?? DEFAULT_PLAN_RESPONSIBILITIES)
		setActResponsibilities(autoApprovalSettings.actResponsibilities ?? DEFAULT_ACT_RESPONSIBILITIES)
		setPlanMayAdjustActResponsibilities(autoApprovalSettings.planMayAdjustActResponsibilities ?? false)
	}, [
		autoApprovalSettings.actResponsibilities,
		autoApprovalSettings.planMayAdjustActResponsibilities,
		autoApprovalSettings.planResponsibilities,
		isVisible,
	])

	const saveResponsibilities = async () => {
		setSavingResponsibilities(true)
		try {
			await updateAutoApproveSettings({
				...autoApprovalSettings,
				version: (autoApprovalSettings.version ?? 1) + 1,
				planResponsibilities,
				actResponsibilities,
				planMayAdjustActResponsibilities,
			})
		} finally {
			setSavingResponsibilities(false)
		}
	}

	if (!isVisible) {
		return null
	}

	return (
		<div ref={modalRef}>
			{/* Expanded menu content - renders directly below the bar */}
			<div
				className="overflow-y-auto pb-3 px-3.5 overscroll-contain"
				style={{
					maxHeight: "60vh",
				}}>
				<div className="mb-2.5 text-muted-foreground text-xs cursor-pointer" onClick={() => setIsVisible(false)}>
					{cloudAutoApprove
						? "Cloud sessions always auto-approve these actions. Your local settings are unchanged. "
						: "Let Cline take these actions without asking for approval. "}
					<a
						className="text-link hover:text-link-hover"
						href="https://docs.cline.bot/features/auto-approve#auto-approve"
						rel="noopener"
						style={{ fontSize: "inherit" }}
						target="_blank">
						Docs
					</a>
				</div>

				<div
					className="relative mb-2 w-full"
					ref={itemsContainerRef}
					style={{
						columnCount: containerWidth > breakpoint ? 2 : 1,
						columnGap: "4px",
					}}>
					{/* Vertical separator line - only visible in two-column mode */}
					{containerWidth > breakpoint && (
						<div
							className="absolute left-1/2 top-0 bottom-0 opacity-20"
							style={{
								background: getAsVar(VSC_TITLEBAR_INACTIVE_FOREGROUND),
								transform: "translateX(-50%)", // Center the line
							}}
						/>
					)}

					{/* All items in a single list - CSS Grid will handle the column distribution */}
					{ACTION_METADATA.map((action) => (
						<AutoApproveMenuItem
							action={action}
							disabled={cloudAutoApprove}
							isChecked={displayedIsChecked}
							key={action.id}
							onToggle={updateAction}
						/>
					))}
				</div>

				{!cloudAutoApprove && autoApprovalSettings.actions.planActCollaboration && (
					<div className="mt-3 border-t pt-3" style={{ borderColor: "var(--vscode-widget-border)" }}>
						<div className="mb-2 text-xs font-medium">Plan ↔ Act responsibilities</div>
						<p className="mb-2 text-xs text-muted-foreground">
							These instructions are included in the collaboration prompt for new turns.
						</p>
						<label className="mb-1 block text-xs" htmlFor="plan-responsibilities">
							Plan
						</label>
						<VSCodeTextArea
							id="plan-responsibilities"
							onInput={(event) => setPlanResponsibilities((event.target as HTMLTextAreaElement).value)}
							resize="vertical"
							rows={3}
							value={planResponsibilities}
						/>
						<label className="mb-1 mt-2 block text-xs" htmlFor="act-responsibilities">
							Act
						</label>
						<VSCodeTextArea
							id="act-responsibilities"
							onInput={(event) => setActResponsibilities((event.target as HTMLTextAreaElement).value)}
							resize="vertical"
							rows={3}
							value={actResponsibilities}
						/>
						<VSCodeCheckbox
							checked={planMayAdjustActResponsibilities}
							className="mt-2 text-xs"
							onChange={(event) => setPlanMayAdjustActResponsibilities((event.target as HTMLInputElement).checked)}>
							Let Plan temporarily adjust Act responsibilities for this task
						</VSCodeCheckbox>
						<div className="mt-2 flex gap-2">
							<VSCodeButton
								appearance="secondary"
								disabled={savingResponsibilities}
								onClick={() => {
									setPlanResponsibilities(DEFAULT_PLAN_RESPONSIBILITIES)
									setActResponsibilities(DEFAULT_ACT_RESPONSIBILITIES)
								}}>
								Reset defaults
							</VSCodeButton>
							<VSCodeButton disabled={savingResponsibilities} onClick={saveResponsibilities}>
								{savingResponsibilities ? "Saving…" : "Save responsibilities"}
							</VSCodeButton>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default AutoApproveModal

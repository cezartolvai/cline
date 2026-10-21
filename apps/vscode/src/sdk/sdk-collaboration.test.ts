import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { describe, expect, it, vi } from "vitest"
import { buildCollaborationPrompt, COLLABORATION_PROMPT, COLLABORATION_SERVER, SdkCollaboration } from "./sdk-collaboration"
import { isToolAutoApproved } from "./sdk-tool-policies"

function fixture() {
	let session = { sessionId: "task-a", isRunning: true, queuedPromptCount: 0 }
	let mode: "plan" | "act" = "plan"
	let enabled = true
	let connected = true
	const switchMode = vi.fn(async (target, _prompt, guard) => {
		if (!guard()) return false
		mode = target
		session = { ...session, isRunning: true }
		return true
	})
	const bridge = new SdkCollaboration({
		getSession: () => session,
		getMode: () => mode,
		isEnabled: () => enabled,
		isServerConnected: () => connected,
		isPlanMayAdjustActResponsibilities: () => true,
		switchMode,
	})
	const controller = new AbortController()
	const context = { sessionId: "task-a", agentId: "a", iteration: 1, signal: controller.signal }
	const tool = (target: "plan" | "act", override = {}) =>
		bridge.wrap(
			{
				name: `${COLLABORATION_SERVER}__handoff_to_${target}`,
				description: "",
				inputSchema: {},
				execute: async () => ({
					structuredContent: {
						protocol: "cline-collaboration/v1",
						target,
						message: "Implement the task; run the tests.",
						requestId: "request",
						maxHandoffs: 6,
						...override,
					},
				}),
			},
			COLLABORATION_SERVER,
		)
	return {
		bridge,
		tool,
		context,
		controller,
		switchMode,
		idle: () => {
			session.isRunning = false
		},
		setMode: (next: "plan" | "act") => {
			mode = next
		},
		disable: () => {
			enabled = false
			bridge.cancel()
		},
		disconnect: () => {
			connected = false
		},
		queue: () => {
			session.queuedPromptCount++
		},
		replace: () => {
			session = { ...session }
		},
	}
}

describe("MCP collaboration bridge", () => {
	it("assigns planning to Plan and heavy implementation work to Act", () => {
		expect(COLLABORATION_PROMPT).toContain("Plan responsibilities (user-editable)")
		expect(COLLABORATION_PROMPT).toContain("Act responsibilities (user-editable)")
		expect(COLLABORATION_PROMPT).toContain("Do not hand off merely to provide a status update")
		expect(COLLABORATION_PROMPT).toContain("provide the final response to the user")
	})

	it("uses editable responsibilities in the collaboration prompt", () => {
		const prompt = buildCollaborationPrompt({
			planResponsibilities: "Define acceptance checks before delegation.",
			actResponsibilities: "Implement and report benchmark evidence.",
		})
		expect(prompt).toContain("Define acceptance checks before delegation.")
		expect(prompt).toContain("Implement and report benchmark evidence.")
	})

	it("tells Plan when it may temporarily refine Act responsibilities", () => {
		const f = fixture()
		expect(f.bridge.status()).toMatchObject({ canTemporarilyAdjustActResponsibilities: true })
		f.setMode("act")
		expect(f.bridge.status()).toMatchObject({ canTemporarilyAdjustActResponsibilities: false })
		f.setMode("plan")
		f.disable()
		expect(f.bridge.status()).toMatchObject({ canTemporarilyAdjustActResponsibilities: false })
	})

	it("returns an Act completion to Plan so only Plan may finalize", async () => {
		const f = fixture()
		f.setMode("act")
		f.idle()
		await f.bridge.reviewActCompletion("task-a")
		expect(f.switchMode).toHaveBeenLastCalledWith(
			"plan",
			expect.stringContaining("only then decide whether to finalize"),
			expect.any(Function),
		)
	})

	it("hands off Plan → Act → Plan only after each turn completes", async () => {
		const f = fixture()
		const act = f.tool("act")
		expect(act.lifecycle?.completesRun).toBe(true)
		expect(act.executionMode).toBe("sequential")
		await act.execute({}, f.context)
		expect(f.switchMode).not.toHaveBeenCalled()
		f.idle()
		await f.bridge.complete("task-a")
		expect(f.switchMode).toHaveBeenLastCalledWith("act", expect.stringContaining("Implement the task"), expect.any(Function))
		await f.tool("plan").execute({}, f.context)
		f.idle()
		await f.bridge.complete("task-a")
		expect(f.bridge.status()).toMatchObject({ mode: "plan", handoffs: 2 })
	})
	it.each(["disable", "disconnect", "replace", "queue"] as const)("cancels pending handoff on %s", async (action) => {
		const f = fixture()
		await f.tool("act").execute({}, f.context)
		f[action]()
		f.idle()
		await f.bridge.complete("task-a")
		expect(f.switchMode).not.toHaveBeenCalled()
	})
	it("does not switch after cancellation, error or a different session completion", async () => {
		for (const cause of ["abort", "error", "other-session"]) {
			const f = fixture()
			await f.tool("act").execute({}, f.context)
			if (cause === "abort") f.controller.abort()
			if (cause === "error") f.bridge.cancel()
			f.idle()
			await f.bridge.complete(cause === "other-session" ? "task-b" : "task-a")
			expect(f.switchMode).not.toHaveBeenCalled()
		}
	})
	it("rejects disabled, same-mode and wrong-session calls", async () => {
		const f = fixture()
		await expect(f.tool("plan").execute({}, f.context)).rejects.toThrow("Already")
		await expect(f.tool("act").execute({}, { ...f.context, sessionId: "task-b" })).rejects.toThrow("eligible")
		f.disable()
		await expect(f.tool("act").execute({}, f.context)).rejects.toThrow("disabled")
	})
	it("rejects invalid MCP output without scheduling a switch", async () => {
		const f = fixture()
		await expect(f.tool("act", { message: "" }).execute({}, f.context)).rejects.toThrow("Invalid")
		f.idle()
		await f.bridge.complete("task-a")
		expect(f.switchMode).not.toHaveBeenCalled()
	})
	it("enforces the budget across model switches", async () => {
		const f = fixture()
		await f.tool("act", { maxHandoffs: 1 }).execute({}, f.context)
		f.idle()
		await f.bridge.complete("task-a")
		await expect(f.tool("plan", { maxHandoffs: 1 }).execute({}, f.context)).rejects.toThrow("limit")
	})
	it("does not control tools belonging to another MCP server", () => {
		const f = fixture()
		const tool = f.tool("act")
		expect(f.bridge.wrap(tool, "other-server")).toBe(tool)
	})
	it("fences a disabled then reenabled request while MCP is still responding", async () => {
		const f = fixture()
		let resolve!: (value: any) => void
		const tool = f.bridge.wrap(
			{
				name: `${COLLABORATION_SERVER}__handoff_to_act`,
				description: "",
				inputSchema: {},
				execute: () =>
					new Promise((r) => {
						resolve = r
					}),
			},
			COLLABORATION_SERVER,
		)
		const call = tool.execute({}, f.context)
		f.bridge.cancel()
		resolve({})
		await expect(call).rejects.toThrow("cancelled")
	})
	it("uses a separate opt-in from ordinary MCP auto-approval", () => {
		const settings = structuredClone(DEFAULT_AUTO_APPROVAL_SETTINGS)
		expect(isToolAutoApproved("cline-collaboration__handoff_to_act", settings)).toBe(false)
		expect(isToolAutoApproved("other__read", settings)).toBe(true)
		settings.actions.planActCollaboration = true
		settings.actions.useMcp = false
		expect(isToolAutoApproved("cline-collaboration__handoff_to_plan", settings)).toBe(true)
		expect(isToolAutoApproved("other__read", settings)).toBe(false)
	})
})

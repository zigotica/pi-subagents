import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderCall, renderResult } from "./render.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
const message = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
function result(agent: string, task: string, step?: number) {
	return { agent, agentSource: "user", task, exitCode: 0, messages: [message("output")], stderr: "", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 1 }, step };
}

describe("render", () => {
test("smoke covers single, parallel, and workflow paths", () => {
	const calls = [
		renderCall({ agent: "one", task: "task" }, theme, {}),
		renderCall({ tasks: [{ agent: "one", task: "task" }] }, theme, {}),
	];
	assert.equal(calls.length, 2);
	for (const call of calls) assert.ok(call);
	const single = renderResult({ content: [{ type: "text", text: "output" }], details: { mode: "single", agentScope: "user", projectAgentsDir: null, results: [result("one", "task")] } }, { expanded: false }, theme, {});
	const parallel = renderResult({ content: [{ type: "text", text: "output" }], details: { mode: "parallel", agentScope: "user", projectAgentsDir: null, results: [result("one", "task")] } }, { expanded: false }, theme, {});
	assert.ok(single && parallel);
	const workflowCall = renderCall({ workflow: { phases: [{ name: "Build", tasks: [{ agent: "builder", task: "Build" }] }, { name: "Checks", tasks: [{ agent: "tester", task: "Test" }] }] } }, theme, {});
	const workflow = renderResult({ content: [{ type: "text", text: "output" }], details: {
		mode: "workflow", agentScope: "user", projectAgentsDir: null,
		results: [{ ...result("builder", "Build"), phaseIndex: 1, phaseName: "Build", attempt: 1, taskStatus: "completed" }],
		workflow: { currentPhase: 2, totalPhases: 2, totalTasks: 2, maxRetries: 3, phases: [
			{ index: 1, name: "Build", status: "completed", attempt: 1, taskCounts: { total: 1, pending: 0, running: 0, completed: 1, failed: 0, canceled: 0 }, repairState: "none" },
			{ index: 2, name: "Checks", status: "running", attempt: 1, taskCounts: { total: 1, pending: 0, running: 1, completed: 0, failed: 0, canceled: 0 }, repairState: "repairing" },
		], },
	} }, { expanded: false }, theme, {});
	assert.ok(workflowCall && workflow);
});

test("workflow renderCall shows scope, phase names, and task previews", () => {
	const call = renderCall({ agentScope: "project", workflow: { phases: [
		{ name: "Build", tasks: [{ agent: "builder", task: "Build application" }] },
		{ name: "Validation", tasks: [{ agent: "linter", task: "Lint sources" }, { agent: "tester", task: "Run tests" }] },
	] } }, theme, {}) as any;
	assert.match(call.text, /workflow \(2 phases\) \[project\]/);
	assert.match(call.text, /1\. Build \(1: builder: Build application\)/);
	assert.match(call.text, /2\. Validation \(2: linter: Lint sources, tester: Run tests\)/);
});

test("workflow rendering shows historical repair attempts, failures, cancellation, and running state", () => {
	const workflowDetails = {
		mode: "workflow" as const, agentScope: "user" as const, projectAgentsDir: null,
		results: [
			{ ...result("builder", "build"), phaseIndex: 1, phaseName: "Build", attempt: 1, taskStatus: "completed" as const, executed: true },
			{ ...result("tester", "test"), exitCode: 1, phaseIndex: 2, phaseName: "Checks", attempt: 1, taskStatus: "failed" as const, causativeFailure: true, executed: true },
			{ ...result("linter", "lint"), exitCode: 1, phaseIndex: 2, phaseName: "Checks", attempt: 1, taskStatus: "canceled" as const, canceledByWorkflow: true, executed: false },
			{ ...result("builder", "build"), phaseIndex: 1, phaseName: "Build", attempt: 2, taskStatus: "completed" as const, repairAttempt: true, executed: true },
			{ ...result("tester", "test"), model: "test-model", thinking: "low", phaseIndex: 2, phaseName: "Checks", attempt: 2, taskStatus: "running" as const, executed: true },
		],
		workflow: { currentPhase: 2, totalPhases: 2, totalTasks: 3, maxRetries: 3, phases: [
			{ index: 1, name: "Build", status: "completed" as const, attempt: 2, taskCounts: { total: 1, pending: 0, running: 0, completed: 1, failed: 0, canceled: 0 }, repairState: "repaired" as const },
			{ index: 2, name: "Checks", status: "running" as const, attempt: 2, taskCounts: { total: 2, pending: 0, running: 1, completed: 0, failed: 0, canceled: 1 }, repairState: "none" as const },
		], },
	};
	const collapsed = renderResult({ content: [{ type: "text", text: "workflow" }], details: workflowDetails }, { expanded: false }, theme, {}) as any;
	assert.match(collapsed.text, /Phase 1: Build/);
	assert.match(collapsed.text, /1 running/);
	assert.match(collapsed.text, /1 canceled/);
	assert.match(collapsed.text, /causative failure/);
	assert.match(collapsed.text, /Attempt 2 · 1 completed · repair/);
	assert.match(collapsed.text, /Total: 4 turns ↑4 ↓4/);
	const expanded = renderResult({ content: [{ type: "text", text: "workflow" }], details: workflowDetails }, { expanded: true }, theme, {}) as any;
	const text = expanded.children.map((child: any) => child.text ?? "").join("\n");
	assert.match(text, /Attempt 1 · causative failure/);
	assert.match(text, /Attempt 2 · repair/);
	assert.match(text, /workflow canceled/);
	assert.match(text, /running/);
	assert.match(text, /tester · running · test-model \(low\)/);
});

test("expanded workflow rendering shows final success, failure, output, and aggregate usage", () => {
	const workflow = (status: "completed" | "failed") => ({
		currentPhase: null, totalPhases: 1, totalTasks: 2, maxRetries: 3, phases: [{
			index: 1, name: "Build", status, attempt: 1,
			taskCounts: { total: 2, pending: 0, running: 0, completed: status === "completed" ? 2 : 1, failed: status === "failed" ? 1 : 0, canceled: 0 }, repairState: "none" as const,
		}],
	});
	for (const status of ["completed", "failed"] as const) {
		const details = {
			mode: "workflow" as const, agentScope: "user" as const, projectAgentsDir: null,
			results: [
				{ ...result("builder", "build"), phaseIndex: 1, phaseName: "Build", attempt: 1, taskStatus: "completed" as const, executed: true },
				{ ...result("tester", "test"), exitCode: status === "failed" ? 1 : 0, stderr: status === "failed" ? "test failed" : "", phaseIndex: 1, phaseName: "Build", attempt: 1, taskStatus: status === "failed" ? "failed" as const : "completed" as const, causativeFailure: status === "failed", executed: true },
			], workflow: workflow(status),
		};
		const expanded = renderResult({ content: [{ type: "text", text: `Workflow ${status}` }], details }, { expanded: true }, theme, {}) as any;
		const text = expanded.children.map((child: any) => child.text ?? "").join("\n");
		assert.match(text, /Phase 1: Build/);
		assert.match(text, status === "failed" ? /causative failure/ : /Attempt 1/);
		assert.match(text, status === "failed" ? /test failed/ : /output/);
		assert.match(text, /Total: 2 turns ↑2 ↓2/);
	}
});

test("workflow collapsed rendering identifies final success and failed phases", () => {
	const phase = (status: "completed" | "failed") => ({ index: 1, name: "Build", status, attempt: 1, taskCounts: { total: 1, pending: 0, running: 0, completed: status === "completed" ? 1 : 0, failed: status === "failed" ? 1 : 0, canceled: 0 }, repairState: "none" as const });
	for (const status of ["completed", "failed"] as const) {
		const view = renderResult({ content: [{ type: "text", text: `Workflow ${status}` }], details: {
			mode: "workflow", agentScope: "user", projectAgentsDir: null,
			results: [{ ...result("builder", "build"), exitCode: status === "failed" ? 1 : 0, phaseIndex: 1, phaseName: "Build", attempt: 1, taskStatus: status === "failed" ? "failed" : "completed", causativeFailure: status === "failed", executed: true }],
			workflow: { currentPhase: null, totalPhases: 1, totalTasks: 1, maxRetries: 3, phases: [phase(status)] },
		} }, { expanded: false }, theme, {}) as any;
		assert.match(view.text, /Phase 1: Build/);
		assert.match(view.text, status === "failed" ? /1 failed/ : /1 completed/);
	}
});
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createSubagentTool } from "./index.ts";
import { SubagentParamsSchema } from "./schema.ts";

describe("registration", () => {
test("construction exposes metadata and delegates callbacks", async () => {
	let executed = false;
	const tool = createSubagentTool({
		discoverAgents: () => ({ agents: [{ name: "one", description: "", systemPrompt: "", source: "user" as const, filePath: "one.md" }], projectAgentsDir: null }),
		runAgent: async (options) => {
			executed = true;
			return { agent: options.agentName, agentSource: "user" as const, task: options.task, exitCode: 0, messages: [{ role: "assistant", content: [{ type: "text", text: "done" }] }] as any, stderr: "", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 1 } };
		},
		outputWriter: { async write() {} },
		confirmProjectAgents: async () => true,
	});
	assert.equal(tool.name, "subagent");
	assert.equal(tool.parameters, SubagentParamsSchema);
	assert.equal(typeof tool.execute, "function");
	assert.equal(typeof tool.renderCall, "function");
	assert.equal(typeof tool.renderResult, "function");
	const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
	const call = tool.renderCall({ agent: "one", task: "task" }, theme, {});
	const workflowCall = tool.renderCall({ workflow: { phases: [{ name: "Build", tasks: [{ agent: "one", task: "task" }] }] } }, theme, {});
	assert.ok(call && workflowCall);
	const rendered = tool.renderResult({
		content: [{ type: "text", text: "output" }],
		details: {
			mode: "single",
			agentScope: "user",
			projectAgentsDir: null,
			results: [{
				agent: "one",
				agentSource: "user",
				task: "task",
				exitCode: 0,
				messages: [{ role: "assistant", content: [{ type: "text", text: "output" }] }],
				stderr: "",
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 1 },
			}],
		},
	}, { expanded: false }, theme, {});
	assert.ok(rendered);
	const workflowRendered = tool.renderResult({
		content: [{ type: "text", text: "workflow" }],
		details: { mode: "workflow", agentScope: "user", projectAgentsDir: null, results: [], workflow: { currentPhase: 1, totalPhases: 1, totalTasks: 1, maxRetries: 3, phases: [] } },
	}, { expanded: false }, theme, {});
	assert.ok(workflowRendered);
	const workflowResponse = await tool.execute("id", { workflow: { phases: [{ name: "Build", tasks: [{ agent: "one", task: "build" }] }] } }, undefined, undefined, { cwd: "/tmp", hasUI: false });
	assert.equal(workflowResponse.details.mode, "workflow");
	assert.equal(workflowResponse.details.results[0].phaseName, "Build");
	assert.equal(executed, true);
	const response = await tool.execute("id", {}, undefined, undefined, { cwd: "/tmp", hasUI: false });
	assert.match(response.content[0].text, /exactly one mode/);
});
});

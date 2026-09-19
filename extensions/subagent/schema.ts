import { StringEnum, type Message } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import type { AgentScope, AgentThinkingLevel } from "./agents.ts";

export const MAX_PARALLEL_TASKS = 8;
export const MAX_CONCURRENCY = 4;
/** Bounds retries and therefore total untrusted workflow execution/history. */
export const MAX_WORKFLOW_RETRIES = 8;
export const PER_TASK_OUTPUT_CAP = 50 * 1024;
/** Total cap for untrusted failure output added to one repair prompt. */
export const WORKFLOW_FEEDBACK_CAP = PER_TASK_OUTPUT_CAP;
export const COLLAPSED_ITEM_COUNT = 10;

export const ModelFallbackSchema = StringEnum(["stop", "current"] as const, {
	description:
		'What to do when agent model fails (quota, missing key, etc). "stop" halts the flow. "current" retries with the parent session\'s current model and thinking level.',
	default: "current",
});

export const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
});

export const TaskItemSchema = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task to delegate to the agent" }),
	model: Type.Optional(Type.String({ description: "Override model for this agent (e.g. 'anthropic/claude-opus-4-5')" })),
	modelFallback: Type.Optional(ModelFallbackSchema),
	outputFile: Type.Optional(Type.String({ description: "Save final output to this file path" })),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" })),
});

export const WorkflowPhaseSchema = Type.Object({
	name: Type.String({ minLength: 1, description: "Non-empty phase name shown in workflow progress" }),
	tasks: Type.Array(TaskItemSchema, {
		minItems: 1,
		maxItems: MAX_PARALLEL_TASKS,
		description: "Tasks run concurrently within this phase",
	}),
});

export const WorkflowSchema = Type.Object({
	phases: Type.Array(WorkflowPhaseSchema, {
		minItems: 1,
		maxItems: MAX_PARALLEL_TASKS,
		description: "Ordered workflow phases",
	}),
	maxRetries: Type.Optional(Type.Integer({ minimum: 0, maximum: MAX_WORKFLOW_RETRIES, default: 3, description: "Retries allowed for each phase after its initial attempt" })),
});

const SubagentParamsBaseSchema = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
	task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
	model: Type.Optional(Type.String({ description: "Override model (single mode only)" })),
	outputFile: Type.Optional(Type.String({ description: "Save final output to this file path (single mode)" })),
	tasks: Type.Optional(Type.Array(TaskItemSchema, { description: "Array of {agent, task} for parallel execution" })),
	workflow: Type.Optional(WorkflowSchema),
	agentScope: Type.Optional(AgentScopeSchema),
	modelFallback: Type.Optional(ModelFallbackSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" })),
	session: Type.Optional(
		Type.String({
			description: "Persistent session key for single mode. Pi stores and reuses the project-scoped session in its standard session store.",
		}),
	),
});

/** Reject only complete competing modes; executor retains legacy incomplete-input diagnostics. */
export const SubagentParamsSchema = Type.Intersect([
	SubagentParamsBaseSchema,
	Type.Unsafe<Static<typeof SubagentParamsBaseSchema>>({
		not: {
			anyOf: [
				{ required: ["workflow", "tasks"] },
				{ required: ["workflow", "agent", "task"] },
			],
		},
	}),
]);

export type ModelFallback = "stop" | "current";
export type SubagentParams = Static<typeof SubagentParamsSchema>;
export type TaskItem = Static<typeof TaskItemSchema>;
export type WorkflowPhase = Static<typeof WorkflowPhaseSchema>;
export type Workflow = Static<typeof WorkflowSchema>;
export type WorkflowTaskStatus = "pending" | "running" | "completed" | "failed" | "canceled";
export type WorkflowPhaseStatus = "pending" | "running" | "completed" | "failed" | "canceled";
export type WorkflowRepairState = "none" | "repairing" | "repaired";
export type SingleTaskParams = {
	agent: string;
	task: string;
	model?: string;
	modelFallback?: ModelFallback;
	outputFile?: string;
	cwd?: string;
	session?: string;
};
export type ParallelTaskParams = TaskItem;

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	thinking?: AgentThinkingLevel;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
	/** Present only for workflow history entries. */
	phaseIndex?: number;
	phaseName?: string;
	attempt?: number;
	taskStatus?: WorkflowTaskStatus;
	canceledByWorkflow?: boolean;
	causativeFailure?: boolean;
	/** True when this workflow attempt reruns a prior phase to repair a downstream failure. */
	repairAttempt?: boolean;
	/** False for synthetic queued/never-started workflow entries. */
	executed?: boolean;
}

export interface WorkflowPhaseDetails {
	index: number;
	name: string;
	status: WorkflowPhaseStatus;
	attempt: number;
	taskCounts: { total: number; pending: number; running: number; completed: number; failed: number; canceled: number };
	repairState: WorkflowRepairState;
}

export interface WorkflowDetails {
	currentPhase: number | null;
	totalPhases: number;
	totalTasks: number;
	maxRetries: number;
	phases: WorkflowPhaseDetails[];
}

export interface SubagentDetails {
	mode: "single" | "parallel" | "workflow";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
	totalSteps?: number;
	workflow?: WorkflowDetails;
}

export type DisplayItem =
	| { type: "text"; text: string }
	| { type: "toolCall"; name: string; args: Record<string, any> };

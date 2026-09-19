---
description: Build pipeline — implement spec then validate with concurrent checks
---
Use subagent tool to build feature: $@

## Steps

1. Derive feature slug from task
2. Verify `.ai/features/{slug}/spec.md` exists
3. Choose smallest suitable workflow based on spec and user preference
4. Run it with subagent tool
5. Report phase result clearly

## Full Pipeline

```ts
subagent({
  workflow: {
    phases: [
      { name: "Build", tasks: [
        { agent: "builder", task: "Implement spec at .ai/features/{slug}/spec.md. Read scout.md for context if available." }
      ] },
      { name: "Validate", tasks: [
        { agent: "linter", task: "Lint changed files listed in .ai/features/{slug}/changes.md" },
        { agent: "tester", task: "Run tests for changed files listed in .ai/features/{slug}/changes.md" },
        { agent: "validator", task: "Validate implementation matches spec. Read .ai/features/{slug}/spec.md and .ai/features/{slug}/changes.md" },
        { agent: "auditor", task: "Security audit changes. Read .ai/features/{slug}/changes.md and .ai/features/{slug}/spec.md" }
      ] }
    ]
  }
})
```

## Workflow Variants

- **Quick iteration:** Build phase only
- **Standard:** Build, then concurrent linter + tester
- **With validation:** Build, then concurrent linter + tester + validator
- **Full pipeline:** Build, then concurrent linter + tester + validator + auditor
- **Security focus:** Build, then auditor

## Important

- Every variant starts with builder-only phase
- Checks in second phase run concurrently
- Failed checks cancel unfinished sibling checks, then builder receives failure feedback for repair
- Workflow retries each phase up to 3 times after initial attempt
- Report passed, failed, canceled, or findings

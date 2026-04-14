# Create a Jira ticket

Create a Jira ticket for the current project.

**Arguments:** $ARGUMENTS (a brief description of the issue or feature)

## Instructions

### Step 1: Determine the Jira project

Look at the `.github/workflows/jira.yml` file to find the Jira project key (the `projects` field). If no jira workflow exists, ask the user for the project key.

### Step 2: Determine issue type

Based on the description in `$ARGUMENTS`, pick the appropriate issue type:

- **Bug** — something is broken or not working as expected
- **Task** — general work item, chore, or improvement
- **Story** — a new user-facing feature

If ambiguous, default to Task.

### Step 3: Create the ticket

Use the `mcp__procyon_atlassian__createJiraIssue` tool (load it via ToolSearch first if needed) with:

- **cloudId**: Use `mcp__procyon_atlassian__getAccessibleAtlassianResources` to get the cloud ID
- **projectKey**: From step 1
- **issueTypeName**: From step 2
- **summary**: A concise title derived from `$ARGUMENTS`
- **description**: Expand on `$ARGUMENTS` with relevant context from the codebase. Keep it brief.
- **contentFormat**: `markdown`

### Step 4: Create a branch

After creating the ticket, create a git branch named `<ticket-key>/<short-description>` (e.g. `PTL-11/fix-rsync-timeout`).

### Step 5: Report

Show the ticket key, URL, and branch name.

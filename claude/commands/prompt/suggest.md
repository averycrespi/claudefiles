---
description: "Analyze Claude Code usage history and suggest the most salient custom commands based on patterns"
argument-hint: ""
model: "claude-opus-4-20250514"
---

# Command Suggestion Analyzer

<role>
You are a Claude Code usage analyst specializing in pattern recognition and workflow optimization. You ultrathink through user interaction patterns to identify automation opportunities and suggest practical custom commands.
</role>

<task>
**Objective**: Analyze Claude Code history from `~/.claude.json` and suggest the most salient custom slash commands
**Method**: Use jq to extract data → categorize patterns → rank by salience → generate top actionable suggestions
**Output**: Top 5-10 most valuable command suggestions with names, descriptions, and usage rationale
**Important**: Never use Read tool on ~/.claude.json - always use jq command instead due to file size
</task>

<analysis-workflow>
## 1. Data Extraction
- Use jq to extract `"display"` entries from `~/.claude.json` file
- Extract all display values from project histories using: `jq -r '.projects[].history[].display // empty' ~/.claude.json`
- Filter out slash commands (already existing) and single-word queries
- Clean and normalize query text

## 2. Pattern Recognition
**Query Categories**:
- **File Operations**: "create X file", "edit Y component", "update Z config"
- **Testing**: "run tests", "fix failing tests", "add test coverage"
- **Git Workflows**: "commit changes", "create PR", "merge branch"
- **Code Quality**: "fix linting errors", "format code", "refactor X"
- **Documentation**: "update README", "add comments", "document API"
- **Debugging**: "debug X issue", "investigate error", "check logs"
- **Build/Deploy**: "install dependencies", "build project", "deploy to X"
- **Security**: "scan for vulnerabilities", "update security", "audit code"

## 3. Frequency Analysis
- Count similar queries using semantic similarity
- Group related patterns (e.g., "fix tests", "run tests", "test failing")
- Rank by salience score combining frequency and automation potential
- Select top 5-10 most valuable suggestions

## 4. Command Generation
For each high-salience pattern:
- Generate descriptive command name following `category:action` format
- Create 2-3 sentence synopsis explaining functionality
- Suggest appropriate parameters and options
- Include example usage scenarios
</analysis-workflow>

<pattern-matching>
## Semantic Similarity Groups
**Testing Patterns**:
- "run tests", "test suite", "check tests", "execute tests"
- "fix test", "test failing", "test error", "broken test"
- "add test", "test coverage", "unit test", "integration test"

**Git Workflow Patterns**:
- "commit", "git commit", "save changes", "create commit"
- "push", "git push", "push changes", "publish branch"
- "pull request", "create PR", "PR", "merge request"

**Code Quality Patterns**:
- "lint", "linting", "eslint", "code style", "format"
- "refactor", "cleanup", "reorganize", "improve"
- "type", "typescript", "type error", "type check"

**File Management Patterns**:
- "create file", "new file", "add file", "generate file"
- "edit", "modify", "update", "change"
- "delete", "remove", "clean", "cleanup"

**Documentation Patterns**:
- "README", "documentation", "docs", "comment"
- "API", "interface", "usage", "example"
</pattern-matching>

<suggestion-algorithm>
## Command Suggestion Logic

**For each high-salience pattern group**:

1. **Command Naming**:
   - Use `category:action` format (e.g., `test:fix`, `git:sync`, `docs:update`)
   - Keep names concise but descriptive
   - Avoid conflicts with existing commands

2. **Synopsis Generation**:
   - First sentence: What the command does
   - Second sentence: How it works or key features
   - Third sentence: When to use it (optional)

3. **Parameter Suggestions**:
   - Identify common variations in the pattern
   - Suggest optional parameters for customization
   - Include sensible defaults

4. **Salience Scoring**:
   - Frequency weight (40%): How often the pattern appears
   - Automation potential (40%): How much time/effort it could save
   - Complexity appropriateness (20%): Good fit for custom command
   - Final ranking: Top 5-10 most valuable suggestions
</suggestion-algorithm>

<output-format>
# Suggested Custom Commands

*Analysis based on your Claude Code usage history*

## Top Command Suggestions

### `test:fix`
Automatically run your test suite, identify failing tests, and provide targeted suggestions for fixing common test failures based on error patterns.
**Usage**: `test:fix [test-pattern]`
**Frequency**: X occurrences in history

### `git:sync`
Streamline your git workflow by pulling latest changes, handling merge conflicts if any, and preparing branch for new work.
**Usage**: `git:sync [branch-name]`
**Frequency**: X occurrences in history

## Additional Valuable Commands

### `docs:update`
Scan recent code changes and automatically update relevant documentation files, including README sections and API documentation.
**Usage**: `docs:update [scope]`
**Frequency**: X occurrences in history

## Other Opportunities

### `code:format`
Apply consistent code formatting across your project using configured linters and formatters, with support for multiple languages.
**Usage**: `code:format [file-pattern]`
**Frequency**: X occurrences in history

---

**Next Steps**: To implement any suggested command, create a new .md file in your `claude/commands/` directory following the existing pattern structure.
</output-format>

<argument-handling>
**No Arguments Required**:
- Command automatically analyzes patterns and returns most salient suggestions
- Uses intelligent scoring to identify top 5-10 most valuable commands
- Balances frequency, automation potential, and practical utility
</argument-handling>

<implementation-steps>
## Execution Process

1. **Initialize**: Set up analysis for top command suggestions
2. **Check Existing Commands**: Scan ~/.claude/commands to identify existing commands
3. **Extract History**: Use jq to extract display entries from `~/.claude.json`
4. **Extract Queries**: Collect all display entries from project histories
5. **Categorize**: Group queries by semantic similarity and intent
6. **Analyze Frequency**: Count occurrences and rank patterns
7. **Generate Suggestions**: Create command proposals with details, avoiding duplicates
8. **Format Output**: Present prioritized suggestions with rationale

### Implementation Details

**Step 1: Initialize Analysis**
```
# No arguments needed - automatically find most salient patterns
# Target: Return top 5-10 most valuable command suggestions
```

**Step 2: Check Existing Commands**
```
1. Use safe-find to scan ~/.claude/commands directory:
   safe-find ~/.claude/commands -name "*.md" -type f
2. Extract command names from file paths (e.g., docs/sync.md -> docs:sync)
3. Create exclusion list to avoid suggesting duplicate commands
4. Include existing command categories in pattern analysis to avoid conflicts
```

**Step 3: History Data Extraction**
```
1. Use Bash with jq to extract display entries from ~/.claude.json:
   jq -r '.projects[].history[].display // empty' ~/.claude.json
2. Filter the results to remove:
   - Slash commands (starting with "/")
   - Single words or very short queries (< 10 characters)  
   - Empty or null entries
3. Collect clean query list for pattern analysis
```

**Step 4: Pattern Recognition Algorithm**
```
For each query:
1. Normalize text (lowercase, remove punctuation)
2. Extract key terms and action words
3. Categorize using keyword matching:
   - Testing: "test", "spec", "jest", "pytest", "failing"
   - Git: "commit", "push", "pull", "merge", "branch", "PR"
   - Files: "create", "edit", "update", "delete", "file"
   - Debug: "debug", "error", "fix", "issue", "problem"
   - Docs: "readme", "documentation", "comment", "doc"
   - Build: "build", "install", "deploy", "package", "npm"
4. Use semantic similarity for grouping related queries
```

**Step 5: Frequency Analysis & Ranking**
```
1. Count exact matches and semantic groups
2. Calculate frequency scores
3. Rank by frequency (descending)
4. Apply salience scoring algorithm
5. Select top 5-10 suggestions by salience score:
   - Salience = (frequency * 0.4) + (automation_potential * 0.4) + (complexity_fit * 0.2)
   - Return highest scoring suggestions only
```

**Step 6: Command Generation**
```
For each qualified pattern:
1. Generate command name using pattern: category:action
2. Cross-reference against existing commands list to avoid duplicates
3. Create synopsis based on most common query variations
4. Suggest parameters from query variations
5. Include frequency data and example usage
```
</implementation-steps>

<validation>
**Quality Checks**:
- Ensure Claude history file exists and is readable
- Validate JSON parsing succeeds
- Filter out existing slash commands to avoid duplicates
- Check ~/.claude/commands directory to identify existing custom commands
- Verify suggested commands don't conflict with built-in or existing commands
- Ensure minimum data quality (at least 10 history entries)
</validation>

**Mission**: Transform repetitive Claude Code usage patterns into actionable custom command suggestions that will streamline your development workflow and reduce manual repetition.

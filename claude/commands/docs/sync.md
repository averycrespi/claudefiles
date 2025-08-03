---
description: "Analyze recent code changes and synchronize documentation automatically"
argument-hint: "[target] (optional: readme, claude, or file/dir path)"
model: "claude-opus-4-20250514"
---

# Documentation Sync Command

<role>
You are a technical documentation specialist focused on keeping project documentation in sync with code changes. You analyze git history, identify documentation gaps, and update relevant files systematically.
</role>

<sync-target>
**Source Analysis**: Recent git commits, current staged/unstaged changes, and modified files
**Method**: Intelligent documentation gap detection and automated updates
**Scope**: README.md, CLAUDE.md, and project documentation files
</sync-target>

<workflow>
## 1. Change Analysis
- **Analyze recent commits**: `git log --oneline -10` and `git diff HEAD~5..HEAD`
- **Review current changes**: `git status` and `git diff` (staged) + `git diff HEAD` (all changes)
- **Identify changed files**: Focus on code files that impact user-facing functionality
- **Detect documentation impact**: New features, API changes, configuration updates, breaking changes

## 2. Documentation Gap Detection
**Check for outdated documentation**:
- README sections that reference changed functionality
- CLAUDE.md instructions that no longer apply
- API documentation missing new endpoints/methods
- Configuration examples that need updates
- Installation/setup steps that changed

## 3. Intelligent Update Strategy
**Per documentation type**:
- **README.md**: Feature descriptions, usage examples, setup instructions
- **CLAUDE.md**: Project-specific guidance, tool usage, conventions
- **Other Docs**: API documentation, configuration guides, project documentation
</workflow>

<analysis-logic>
## Change Impact Assessment

### High Impact Changes (Always Update Docs)
- New public APIs or endpoints
- Configuration file structure changes
- Installation/setup process modifications
- Breaking changes to existing functionality
- New CLI commands or options
- Environment variable changes

### Medium Impact Changes (Selective Updates)
- Internal refactoring with external implications
- Performance improvements worth documenting
- Bug fixes that change behavior
- New dependencies or tools
- Test structure changes

### Low Impact Changes (Review Only)
- Internal code organization
- Variable renaming (internal)
- Code style/formatting changes
- Minor bug fixes with no behavior change
</analysis-logic>

<documentation-types>
## Target Documentation Files

### README.md Updates
```
- Project description and features
- Installation and setup instructions
- Usage examples and CLI commands
- Configuration options
- API overview and examples
- Contributing guidelines
```

### CLAUDE.md Updates
```
- Project-specific Claude Code instructions
- Tool and command usage patterns
- Development workflow guidance
- Architecture and convention notes
- Testing and deployment procedures
```

### Other Documentation Files
```
- API documentation (OpenAPI/Swagger)
- Configuration guides and examples
- Setup and deployment docs
- Architecture documentation
- Troubleshooting guides
```
</documentation-types>

<implementation-process>
## Step-by-Step Execution

### Phase 1: Analysis
1. **Git History Review**: Analyze recent commits for documentation-relevant changes
2. **Current Change Review**: Examine staged and unstaged changes via `git status` and `git diff`
3. **File Change Detection**: Identify modified files and their documentation impact
4. **Documentation Audit**: Check existing docs against current implementation
5. **Gap Identification**: List specific documentation updates needed

### Phase 2: Updates
1. **Analyze Existing Style**: Review current documentation structure, formatting, and tone
2. **Prioritize Changes**: Start with high-impact documentation gaps
3. **Update Content**: Modify documentation following existing patterns and style
4. **Preserve Structure**: Maintain existing section organization, avoid adding new sections unless essential
5. **Verify Accuracy**: Cross-reference updated docs with actual implementation
6. **Test Examples**: Ensure code examples and instructions actually work

### Phase 3: Validation
1. **Review Changes**: Confirm all updates are accurate and complete
2. **Check Consistency**: Ensure consistent terminology and formatting
3. **Validate Links**: Test that all references and links work correctly
4. **Final Quality Check**: Comprehensive review of all modifications
</implementation-process>

<target-handling>
## Argument Processing

**Target Options**:
- No argument - Update both CLAUDE.md and README.md (default behavior)
- `readme` - Focus specifically on README.md updates
- `claude` - Focus specifically on CLAUDE.md updates
- File/directory path - Update documentation in specified file or directory

**Target Logic**:
```
if no arguments:
    Update both CLAUDE.md and README.md based on recent changes
elif target == "readme":
    Analyze and update README.md comprehensively
elif target == "claude":
    Analyze and update CLAUDE.md with project-specific guidance
elif target is file/directory path:
    Update documentation files within specified path
else:
    Treat as file/directory path and update docs within that scope
```
</target-handling>

<quality-standards>
## Documentation Quality Requirements

### Accuracy Standards
- All code examples must be tested and working
- API documentation matches actual implementation
- Configuration examples use current syntax
- Installation instructions are up-to-date

### Consistency Requirements
- Follow existing documentation style, tone, and formatting patterns
- Maintain current section structure and organization
- Use consistent terminology throughout all docs
- Preserve existing formatting conventions (headers, lists, code blocks)
- Cross-references and links are valid
- Examples follow project conventions

### Completeness Standards
- New features have comprehensive documentation
- Breaking changes are clearly documented
- Migration guides for significant changes
- Troubleshooting sections are current
</quality-standards>

<update-patterns>
## Common Documentation Updates

### Feature Addition Pattern
```
1. Add feature description to README
2. Update usage examples
3. Document new configuration options
4. Add API endpoint documentation
5. Update CLAUDE.md with development notes
```

### API Change Pattern
```
1. Update endpoint documentation
2. Modify request/response examples
3. Update error code documentation
4. Add migration notes for breaking changes
5. Update client library examples
```

### Configuration Change Pattern
```
1. Update configuration file examples
2. Document new environment variables
3. Update setup/installation instructions
4. Modify deployment documentation
5. Update troubleshooting guides
```
</update-patterns>

<completion-criteria>
## Success Metrics

**Documentation Sync Complete When**:
- ✅ Updates follow existing documentation style and structure patterns
- ✅ All recent code changes have corresponding documentation updates
- ✅ No broken links or outdated examples in documentation
- ✅ README accurately reflects current project state
- ✅ CLAUDE.md contains current project-specific guidance
- ✅ Existing section organization and formatting is preserved
- ✅ All code examples are tested and working
- ✅ Configuration examples use current syntax
- ✅ Installation/setup instructions are validated
</completion-criteria>

<output-format>
## Documentation Sync Report

```
📚 **Documentation Sync Report**
🎯 **Target**: [readme/claude/path/default]
📝 **Files Updated**: [List of documentation files modified]
🔄 **Changes Made**: [Summary of key updates]
✅ **Validated**: [Examples tested, links checked, accuracy verified]
⚠️ **Issues Found**: [Any problems that need manual attention]
📋 **Next Steps**: [Recommendations for further documentation work]
```
</output-format>

<examples>
**Example Analysis Flow**:
```
1. Git Analysis: 5 commits show new API endpoints and config changes
2. Current Changes: Staged changes add new CLI command, unstaged changes modify config format
3. Impact Assessment: High impact - new features and config changes need documentation
4. Updates Required:
   - README: Add new feature section, usage examples, and updated config format
   - API docs: Document 3 new endpoints with request/response examples  
   - CLAUDE.md: Update development workflow with new tools and CLI command
5. Implementation: Update files systematically with tested examples
6. Validation: Verify all examples work and links are valid
```

**Example Target Usage**:
```
/docs:sync              # Update both CLAUDE.md and README.md (default)
/docs:sync readme       # Update README.md only
/docs:sync claude       # Update CLAUDE.md only
/docs:sync docs/        # Update all documentation in docs/ directory
/docs:sync API.md       # Update specific documentation file
```
</examples>

**Mission**: Maintain comprehensive, accurate, and up-to-date project documentation that evolves seamlessly with your codebase changes.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ccshare** is a TypeScript CLI tool for sharing Claude Code prompts and results as HTML reports or via an API. The project uses strict TypeScript configuration, ES modules, and Commander.js for CLI functionality.

## Essential Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run CLI in development mode
npm run dev

# Run the built CLI
node dist/cli.js

# Common usage examples
npm run dev                           # Share to ccshare.cc with prompt selection  
npm run dev --html                    # Generate HTML report locally
npm run dev --all --no-select         # Share all sessions without selection
npm run dev post                      # Post to share API (deprecated - now default)
npm run dev post -s session.json      # Post specific session file
npm run dev watch                     # Real-time tracking mode
npm run dev load <slug>               # Load and execute prompts from shared session

# Publishing to npm
npm publish
```

## Architecture

### Core Modules

- **src/cli.ts**: Main CLI entry point using Commander.js with commands:
  - Default action: Shares sessions to ccshare.cc via browser form submission
  - `--html` flag: Generates local HTML reports instead of sharing
  - `post` command: (Deprecated) Shares sessions via API - now the default behavior
  - `watch` command: Real-time session tracking with interactive controls
  - `load` command: Fetches and executes prompts from shared sessions

- **src/capture.ts**: Session file discovery and parsing
  - Searches default locations: `~/.claude/projects/`, `~/.claude/sessions/`, `.claude-sessions/`
  - Parses Claude's JSONL history format
  - Handles new toolUseResult format with edits array
  - Associates file changes with user prompts via parent chain traversal
  
- **src/html-generator.ts**: HTML report generation with syntax highlighting
  - Associates file changes with prompts that triggered them
  - Generates responsive HTML with tech stack visualization
  - Uses embedded Tailwind CSS for styling

- **src/share-service.ts**: API integration for sharing sessions
  - Default API endpoint: `https://ccshare.cc/shares`
  - Transforms session data to shareable format
  - Handles both sharing (POST) and fetching (GET) operations

- **src/browser-post.ts**: Browser-based form submission for large payloads
  - Creates temporary HTML files with auto-submitting forms
  - Uses dark mode styling
  - Fallback for when data exceeds URL length limits (>2000 chars)

- **src/watch.ts**: Real-time session monitoring
  - Watches for new prompts and file changes
  - Interactive controls: [S]hare, [C]lear, [Q]uit
  - Displays tech stack and session statistics

## Key Implementation Details

1. **Session File Format**: Parses Claude's JSONL format where each line contains:
   - User prompts with `type: "user"`
   - Assistant responses with `type: "assistant"`
   - Tool use results with `toolUseResult` containing file changes

2. **File Change Tracking**: 
   - Primary: Extracts from `toolUseResult.edits` array (new format)
   - Fallback: Uses git diff for uncommitted changes
   - Associates changes with prompts using UUID parent chain traversal

3. **Prompt Association Logic**:
   - For last prompt: Includes all recent file changes if no direct association
   - Filters auto-generated prompts unless `--exclude-auto` is used
   - Maintains prompt timestamps and source file references

4. **API Communication**:
   - Direct POST for payloads < 2000 chars
   - Browser form submission for larger payloads
   - Supports custom API URLs via `--api-url` flag

## Development Notes

- ES modules configuration requires `.js` extensions in imports
- TypeScript strict mode is enabled - ensure proper type checking
- The CLI is published as `ccshare` on npm
- Reports are saved to `ccshare-reports/` directory (git-ignored)
- Default API endpoint is `https://ccshare.cc/shares` (changed from localhost:3000)
- Temporary HTML pages use dark mode styling

## Recent Changes & Known Issues

- Updated to handle Claude Code's new toolUseResult format with edits array
- File change association uses fallback for last prompt when parent chain is incomplete
- Parent-child UUID traversal in JSONL can be complex due to multiple intermediate entries
- **Parent Chain Depth Issue**: Some file changes may be associated with system messages (e.g., "This session is being continued...") when the parent chain exceeds 20 levels. This typically occurs when sessions are restored with deep tool_result chains.
- **JSON Output**: Fixed issue where progress messages were mixed with JSON output when using `--json` flag

## Rules

- 코드 수정마다 npm run build를 해줘 
- 작업마다 git commit을 해줘
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **ccshare**, a TypeScript CLI tool for sharing Claude Code prompts and results. The project uses strict TypeScript configuration and ES modules.

## Essential Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run the CLI in development
npm run dev

# Run the built CLI
node dist/cli.js

# Test the share command with the test fixture
npm run dev share test-session.json
```

## Architecture

The codebase follows a modular architecture with clear separation of concerns:

- **src/capture.ts**: Core logic for reading and parsing Claude session files from various formats (JSON conversations, raw text)
- **src/upload.ts**: Handles uploading captured sessions (currently mocked implementation)
- **src/analyze.ts**: Provides detailed project analysis including git integration
- **src/cli.ts**: Main CLI entry point using Commander.js
- **src/types.ts**: TypeScript type definitions for sessions, messages, and file changes

## Key Implementation Details

1. **Session File Discovery**: The capture module searches multiple default locations for Claude session files:
   - `~/.claude/sessions/`
   - `~/Documents/Claude/`
   - `~/.config/claude/sessions/`

2. **File Change Tracking**: When analyzing sessions, the tool extracts file changes and can generate git diffs for modified files.

3. **Mock Upload**: The upload functionality is currently mocked and simulates the upload process with a progress bar.

## Development Notes

- The project uses ES modules (type: "module" in package.json)
- TypeScript is configured with strict mode
- The CLI binary is registered as `ccshare` when installed
- Git integration is used for tracking file changes and generating diffs
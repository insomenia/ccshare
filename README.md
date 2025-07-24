# ccshare

Instantly share your Claude Code sessions on ccshare.cc - featuring beautiful syntax highlighting, code diffs, and automatic tech stack detection.

## Features

- 🚀 Instant sharing to ccshare.cc with one command
- 📝 Export Claude Code conversations online with raw session data
- 🎨 Beautiful syntax highlighting and clean formatting
- 📊 Automatic tech stack detection with version information and dependencies
- 🔍 Interactive prompt selection (choose which prompts to include)
- 📁 Reads Claude's project-specific history files automatically
- 🎯 Preserves complete session context with raw JSONL data
- 🔄 Load and execute shared prompts from other sessions
- 💡 Tracks all session data including assistant responses and tool executions
- ⚡ Direct browser submission for reliable sharing

## Installation

### Global Installation
```bash
npm install -g ccshare
```

### Run Without Installation
You can run ccshare directly using npx or bunx - no installation needed:

```bash
# Using npx
npx ccshare

# Using bunx (if you have Bun installed)
bunx ccshare

# Run a specific version
npx ccshare@latest
```

## Usage

### Basic Usage

Share your Claude Code session to ccshare.cc:

```bash
ccshare
```

This will:
1. Find the most recent Claude Code session in your project
2. Show an interactive prompt selector (newest prompts first, use spacebar to select/deselect)
3. Share selected prompts to ccshare.cc via browser submission
4. Open the share page in your browser

### Advanced Usage

```bash
# Share with custom API URL
ccshare --api-url https://myapi.com/shares

# Output JSON format
ccshare --json

# Include only the N most recent prompts (skips selection)
ccshare --recent 5

# Fetch more prompts from session history
ccshare --limit 50  # Default is 20

# Exclude auto-generated prompts (commands, system messages)
ccshare --exclude-auto
```

### Load and Execute Shared Prompts

You can load prompts from a shared session and execute them with Claude:

```bash
# Load and execute all prompts from a share
ccshare load AdsrMP

# Preview prompts without executing (dry run)
ccshare load AdsrMP --dry-run

# Select which prompts to execute
ccshare load AdsrMP --select

# Use a custom API URL
ccshare load AdsrMP --api-url https://myapi.com/shares
```

This will:
1. Fetch the shared session from the API
2. Extract user prompts (excluding auto-generated ones)
3. Execute each prompt sequentially using `claude -p`
4. Show progress and handle errors gracefully

### Command Options

```bash
# Skip prompt selection (include all prompts)
ccshare --no-select

# Include all historical sessions from Claude's project folder
ccshare --all

# Specify a custom session file
ccshare -s /path/to/session.json
ccshare --session /path/to/session.json

# Specify a directory containing session files
ccshare -s /path/to/sessions/

# Combine options
ccshare --all --no-select
```

## How It Works

ccshare reads Claude Code session data from:
1. Claude's project-specific folders: `~/.claude/projects/{project-path}/`
2. Custom session files or directories you specify with `-s`
3. Local `.claude-sessions/` folder for archived sessions

The tool automatically:
- Finds the most recently modified JSONL file (your current session)
- Detects your project's tech stack including versions and dependencies
- Extracts file changes from toolUseResult entries
- Shares to ccshare.cc via browser form submission for reliability
- Preserves complete session context with raw JSONL data

## What Gets Shared

Shared sessions include:
- **Tech Stack Tags**: Automatically detected languages, frameworks, tools, and databases
- **Version Information**: Package versions and dependencies from your project
- **Prompts**: User prompts with timestamps (auto-generated prompts can be excluded)
- **Assistant Responses**: Complete AI responses with tool executions
- **File Changes**: All edits and modifications tracked from toolUseResult
- **Session Metadata**: Git info, OS details, Node version, and more
- **CLAUDE.md**: Project context file if present in your working directory
- **Raw Session Data**: Complete JSONL entries preserving full context

## Local Session Storage

You can also store sessions locally in `.claude-sessions/` folder for:
- Team collaboration (sharing session files)
- Archiving important problem-solving sessions
- Demo/tutorial sessions
- Importing sessions from other AI tools

Example:
```bash
# Copy a session to local folder
cp ~/Downloads/shared-session.json .claude-sessions/

# Include it in the report
ccshare --all
```

## Examples

### Share current session with prompt selection
```bash
ccshare
```

### Share all sessions without selection dialog
```bash
ccshare --all --no-select
```

### Share specific session file
```bash
ccshare -s ~/my-session.json
```

### Share only recent prompts
```bash
ccshare --recent 10
```

## Requirements

- Node.js >= 16.0.0
- npm or yarn

## Development

```bash
# Clone the repository
git clone https://github.com/insomenia/ccshare.git
cd ccshare

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues

If you find any bugs or have feature requests, please create an issue on [GitHub](https://github.com/insomenia/ccshare/issues).
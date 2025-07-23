# ccshare

Share your Claude Code sessions as beautiful HTML reports with syntax-highlighted code diffs and project tech stack information.

## Features

- 📝 Export Claude Code conversations to HTML
- 🎨 Beautiful, responsive HTML reports with syntax highlighting
- 📊 Automatic tech stack detection (languages, frameworks, tools, databases)
- 🔍 Interactive prompt selection (choose which prompts to include)
- 📁 Reads Claude's project-specific history files
- 🎯 Associates file changes with specific prompts
- 📂 Organized output in `ccshare-reports/` folder

## Installation

### Global Installation
```bash
npm install -g ccshare
```

### Direct Execution (without installation)
You can also run ccshare directly using npx or bunx:

```bash
# Using npx
npx ccshare --share

# Using bunx (if you have Bun installed)
bunx ccshare --share

# Run a specific version
npx ccshare@0.2.0 --share
```

## Usage

### Basic Usage

Share your Claude Code session to ccshare.cc:

```bash
ccshare
```

This will:
1. Show an interactive prompt selector (use spacebar to select/deselect)
2. Share selected prompts to ccshare.cc
3. Open the share page in your browser

### Advanced Usage

```bash
# Generate HTML report locally (instead of sharing)
ccshare --html

# Share with custom API URL
ccshare --api-url https://myapi.com/shares

# Output JSON format
ccshare --json

# Include only the N most recent prompts
ccshare --recent 5

# Exclude auto-generated prompts (commands, system messages)
ccshare --exclude-auto

# Include CLAUDE.md without asking
ccshare --include-claude-md
```

### Watch Mode (Real-time tracking)

Watch mode allows you to track prompts in real-time and share whenever you want:

```bash
# Start watch mode
ccshare watch

# Watch with custom options
ccshare watch --exclude-auto --api-url https://myapi.com/shares
```

In watch mode:
- Press **[S]** to share the current session
- Press **[C]** to clear the screen
- Press **[Q]** to quit
- New prompts are displayed as they are detected
- File changes are tracked in real-time

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
1. Current conversation (when no history is available)
2. Claude's project-specific folders: `~/.claude/projects/{project-path}/`
3. Custom session files or directories you specify

The tool automatically:
- Detects your project's tech stack by analyzing config files
- Associates file changes with the prompts that caused them
- Generates clean, readable HTML with syntax highlighting
- Saves reports in `ccshare-reports/` folder (git-ignored)

## Output

HTML reports include:
- **Tech Stack Tags**: Visual tags showing detected technologies
- **Prompts**: User prompts with timestamps and source files
- **File Changes**: Syntax-highlighted diffs associated with each prompt
- **Session Info**: Summary of total prompts, time range, and sources

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
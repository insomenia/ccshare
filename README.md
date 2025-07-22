# ccshare

Share your Claude Code sessions as beautiful HTML reports with syntax-highlighted code diffs and project tech stack information.

## Features

- =Ý Export Claude Code conversations to HTML
- <¨ Beautiful, responsive HTML reports with syntax highlighting
- =Ê Automatic tech stack detection (languages, frameworks, tools, databases)
- = Interactive prompt selection (choose which prompts to include)
- =Á Reads Claude's project-specific history files
- <¯ Associates file changes with specific prompts
- =Â Organized output in `ccshare-reports/` folder

## Installation

```bash
npm install -g ccshare
```

## Usage

### Basic Usage

Generate an HTML report from your current Claude Code session:

```bash
ccshare
```

This will:
1. Show an interactive prompt selector (use spacebar to select/deselect)
2. Generate an HTML report with selected prompts
3. Open the report in your default browser

### Command Options

```bash
# Skip prompt selection (include all prompts)
ccshare --no-select

# Include all historical sessions from Claude's project folder
ccshare --all

# Specify a custom session file
ccshare -s /path/to/session.json

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
git clone https://github.com/yourusername/ccshare.git
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

If you find any bugs or have feature requests, please create an issue on [GitHub](https://github.com/yourusername/ccshare/issues).
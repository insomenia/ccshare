#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { captureSession, captureRawSession } from './capture.js';
import { uploadSession } from './upload.js';
import { SessionData, RawSessionData } from './types.js';
import { generateHtml, HtmlData } from './html-generator.js';
import { detectTechStack } from './tech-detector.js';
import { transformToShareData, shareToAPI, shareToAPIRaw, fetchFromSlug } from './share-service.js';
import { createAutoPostForm } from './browser-post.js';
import { SessionWatcher } from './watch.js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function openUrl(url: string) {
  const platform = process.platform;
  let command;
  
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  
  try {
    await execAsync(command);
  } catch (error) {
    console.error('Failed to open URL:', error);
  }
}

const program = new Command();

program
  .name('ccshare')
  .description('Share Claude Code prompts and results')
  .version('0.1.0')
  .option('-s, --session <path>', 'Path to session file or directory')
  .option('-a, --all', 'Include all session history')
  .option('-n, --no-select', 'Skip prompt selection')
  .option('-r, --recent <number>', 'Include only the N most recent prompts', parseInt)
  .option('--html', 'Generate HTML report instead of sharing')
  .option('--api-url <url>', 'Custom API URL for sharing', 'https://ccshare.cc/shares')
  .option('--json', 'Output JSON format instead of HTML')
  .option('--include-claude-md', 'Include CLAUDE.md file without asking')
  .option('--exclude-auto', 'Exclude auto-generated prompts')
  .option('--file-window <minutes>', 'Time window in minutes after prompts to include file changes (default: 5)', parseInt)
  .option('-l, --limit <number>', 'Maximum number of prompts to fetch from session files', parseInt)
  .option('--raw', 'Send raw session data instead of processed format')
  .action(async (options) => {
    // Default action - share to API, or generate HTML if --html flag is used
    try {
      // Handle raw session data
      if (options.raw) {
        const limit = options.limit || 20;
        const spinner = options.json ? null : ora('Fetching raw session data...').start();
        
        const rawData = await captureRawSession(options.session, limit);
        
        if (spinner) spinner.succeed('Session data fetched');
        
        // Allow user to select prompts
        let selectedPrompts = rawData.prompts;
        
        if (options.select && !options.json && rawData.prompts.length > 0) {
          const choices = rawData.prompts.map((p, index) => ({
            name: `${index + 1}. ${p.userPrompt.message?.content?.substring(0, 100)}...`,
            value: index,
            checked: true
          }));
          
          const { selected } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'selected',
            message: 'Select prompts to share:',
            choices,
            pageSize: 15
          }]);
          
          selectedPrompts = selected.map((idx: number) => rawData.prompts[idx]);
        }
        
        if (options.json) {
          console.log(JSON.stringify({ prompts: selectedPrompts, metadata: rawData.metadata }, null, 2));
          process.exit(0);
        }
        
        // Send to API
        const apiUrl = options.apiUrl;
        const payload = { prompts: selectedPrompts, metadata: rawData.metadata };
        
        try {
          const result = await shareToAPIRaw(payload, apiUrl);
          if (result.url) {
            console.log(chalk.green(`\n✅ Shared successfully: ${result.url}`));
            await openUrl(result.url);
          }
        } catch (error) {
          console.error(chalk.red('\n❌ Error sharing session:'), error);
          
          // Fallback to form submission
          const tempFilePath = await createAutoPostForm(payload, apiUrl);
          console.log(chalk.yellow('📤 Opening browser to submit data...'));
          await openUrl(`file://${tempFilePath}`);
        }
        
        process.exit(0);
      }
      
      const spinner = options.json ? null : ora('Analyzing Claude Code session...').start();
      
      // Find and capture session
      const sessionData = await captureSession(options.session, options.all);
      
      if (spinner) spinner.succeed('Analysis complete');
      
      // Build data for HTML with prompts grouped with their changes
      let userPrompts = sessionData.prompts.filter(p => p.role === 'user');
      
      // Filter out auto-generated prompts if requested
      if (options.excludeAuto) {
        userPrompts = userPrompts.filter(p => !p.isAutoGenerated);
        if (!options.json) {
          console.log(chalk.cyan('\n🤖 Excluding auto-generated prompts'));
        }
      }
      
      // If --recent flag is used, limit to N most recent prompts
      if (options.recent && options.recent > 0) {
        userPrompts = userPrompts.slice(-options.recent);
        if (!options.json) {
          console.log(chalk.cyan(`\n📝 Limiting to ${options.recent} most recent prompts`));
        }
      }
      
      // Allow user to select prompts if not disabled (skip if JSON output)
      if (options.select !== false && userPrompts.length > 0 && !options.recent && !options.json) {
        const promptChoices = userPrompts.map((prompt, index) => {
          const cleanContent = prompt.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          const displayContent = cleanContent.substring(0, 80);
          const autoLabel = prompt.isAutoGenerated ? ' [AUTO]' : '';
          return {
            name: `${index + 1}. ${displayContent}${cleanContent.length > 80 ? '...' : ''}${autoLabel}`,
            value: index,
            checked: !prompt.isAutoGenerated  // Auto-generated prompts unchecked by default
          };
        });
        
        const { selectedPrompts } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedPrompts',
            message: 'Select prompts to include (use spacebar to select/deselect):',
            choices: promptChoices,
            pageSize: 15
          }
        ]);
        
        // Filter prompts based on selection
        userPrompts = userPrompts.filter((_, index) => selectedPrompts.includes(index));
        
        if (userPrompts.length === 0) {
          console.log(chalk.yellow('\nNo prompts selected.'));
          process.exit(0);
        }
      }
      
      // Prepare prompts data
      const promptsData = userPrompts.map(prompt => ({
        prompt: prompt.content,
        timestamp: prompt.timestamp,
        sourceFile: (prompt as any).sourceFile,
        uuid: (prompt as any).uuid
      }));
      
      // Collect file diffs based on prompt timestamps
      // Get the timestamp range from selected prompts
      const promptTimestamps = userPrompts.map(p => new Date(p.timestamp).getTime());
      const earliestPromptTime = Math.min(...promptTimestamps);
      const latestPromptTime = Math.max(...promptTimestamps);
      
      // Filter file changes that occurred after the earliest prompt
      // and within a reasonable time window after the latest prompt
      const timeWindowMinutes = options.fileWindow || 5;
      const timeWindowMs = timeWindowMinutes * 60 * 1000;
      
      const fileDiffs = sessionData.changes
        .filter(change => {
          if (!change.diff || !change.timestamp) return false;
          
          const changeTime = new Date(change.timestamp).getTime();
          // Include changes that happened after the first prompt
          // and within 5 minutes after the last prompt
          return changeTime >= earliestPromptTime && 
                 changeTime <= (latestPromptTime + timeWindowMs);
        })
        .map(change => ({
          path: change.path,
          diff: change.diff!
        }));
      
      if (process.env.DEBUG_FILE_CHANGES) {
        console.log(`\n[DEBUG] Prompt time range: ${new Date(earliestPromptTime).toISOString()} to ${new Date(latestPromptTime).toISOString()}`);
        console.log(`[DEBUG] Total file changes: ${sessionData.changes.length}`);
        console.log(`[DEBUG] Filtered file changes: ${fileDiffs.length}`);
      }
      
      // Detect tech stack
      const techStack = await detectTechStack(process.cwd());
      
      // Calculate session info
      let sessionInfo = undefined;
      if (options.session || options.all) {
        const timestamps = userPrompts
          .map(p => new Date(p.timestamp))
          .filter(d => !isNaN(d.getTime()));
        
        const sources = [...new Set(userPrompts
          .map((p: any) => p.sourceFile)
          .filter(Boolean))];
        
        sessionInfo = {
          totalPrompts: userPrompts.length,
          timeRange: timestamps.length >= 2 ? 
            `${timestamps[0].toLocaleDateString('en-US')} ~ ${timestamps[timestamps.length - 1].toLocaleDateString('en-US')}` : 
            undefined,
          sources: sources.length > 0 ? sources : undefined,
          projectPath: sessionData.metadata?.workingDirectory,
          claudeProjectPath: sessionData.metadata?.claudeProjectPath
        };
      }
      
      // Extract assistant actions and tool executions if available
      // Filter by timestamp to match selected prompts
      const assistantActions = (sessionData.assistantActions || []).filter(action => {
        if (!action.timestamp) return false;
        const actionTime = new Date(action.timestamp).getTime();
        return actionTime >= earliestPromptTime && 
               actionTime <= (latestPromptTime + timeWindowMs);
      });
      
      const toolExecutions = (sessionData.toolExecutions || []).filter(exec => {
        if (!exec.timestamp) return false;
        const execTime = new Date(exec.timestamp).getTime();
        return execTime >= earliestPromptTime && 
               execTime <= (latestPromptTime + timeWindowMs);
      });
      
      
      const htmlData: HtmlData = {
        prompts: promptsData,
        fileDiffs,
        assistantActions,
        toolExecutions,
        sessionInfo,
        techStack
      };
      
      // If JSON output requested, output JSON and exit
      if (options.json) {
        const shareData = transformToShareData(htmlData, sessionData);
        console.log(JSON.stringify(shareData, null, 2));
        process.exit(0);
      }
      
      // If HTML option is used, generate HTML report
      if (options.html) {
        const html = generateHtml(htmlData);
      
      // Create reports directory if it doesn't exist
      const reportsDir = path.join(process.cwd(), 'ccshare-reports');
      await fs.mkdir(reportsDir, { recursive: true });
      
        // Save HTML file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `claude-session-${timestamp}.html`;
        const filepath = path.join(reportsDir, filename);
        
        await fs.writeFile(filepath, html, 'utf-8');
        
        console.log(chalk.green(`\n✅ HTML report generated: ccshare-reports/${filename}`));
        
        // Open the file
        const openCommand = process.platform === 'darwin' ? 'open' : 
                           process.platform === 'win32' ? 'start' : 'xdg-open';
        
        try {
          await execAsync(`${openCommand} "${filepath}"`);
          console.log(chalk.cyan('📄 Opening in your default browser...'));
        } catch (err) {
          console.log(chalk.yellow('⚠️  Could not auto-open file. Please open manually.'));
        }
        
        // Exit after HTML generation
        process.exit(0);
      }
      
      // Default action: Share to API
      const shareSpinner = ora('Preparing to share...').start();
      try {
        const shareData = transformToShareData(htmlData, sessionData);
        
        // Check if CLAUDE.md exists and ask if user wants to include it
        const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
        try {
          const claudeMdContent = await fs.readFile(claudeMdPath, 'utf-8');
          
          // If --include-claude-md flag is set, include without asking
          if (options.includeClaudeMd) {
            shareData.claudeMd = claudeMdContent;
          } else {
            shareSpinner.stop();
            
            const { includeClaudeMd } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'includeClaudeMd',
                message: 'Found CLAUDE.md file. Include it in the share?',
                default: true
              }
            ]);
            
            if (includeClaudeMd) {
              shareData.claudeMd = claudeMdContent;
            }
            
            shareSpinner.start('Preparing to share...');
          }
        } catch {
          // CLAUDE.md doesn't exist, continue without it
        }
        
        // Show JSON if requested (for debugging)
        if (process.env.DEBUG_SHARE) {
          console.log('\nJSON being sent to API:');
          console.log(JSON.stringify(shareData, null, 2));
        }
        
        // Create temporary HTML file with auto-submitting form
        const tempHtmlPath = await createAutoPostForm(shareData, options.apiUrl);
        
        shareSpinner.succeed('Opening browser with share data...');
        
        // Open the temporary HTML file in browser
        const openCommand = process.platform === 'darwin' ? 'open' : 
                           process.platform === 'win32' ? 'start' : 'xdg-open';
        
        try {
          await execAsync(`${openCommand} "${tempHtmlPath}"`);
          console.log(chalk.cyan(`📄 Sharing to ${options.apiUrl}...`));
        } catch (err) {
          console.log(chalk.yellow(`⚠️  Could not open browser. Please open: ${tempHtmlPath}`));
        }
      } catch (err: any) {
        shareSpinner.fail(`Share failed: ${err.message}`);
      }
      
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('share')
  .description('Capture and share current Claude Code session')
  .option('-f, --file <path>', 'Path to Claude Code session file')
  .option('-m, --message <message>', 'Optional message to include with share')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🚀 CCShare - Claude Code Session Sharing Tool'));
      
      const spinner = ora('Capturing Claude Code session...').start();
      
      let sessionData: SessionData;
      
      if (options.file) {
        sessionData = await captureSession(options.file);
      } else {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'sessionPath',
            message: 'Enter path to Claude Code session file (or press enter to use default):',
            default: process.env.HOME + '/.claude/sessions/latest.json'
          }
        ]);
        sessionData = await captureSession(answers.sessionPath);
      }
      
      spinner.succeed('Session captured successfully');
      
      if (!options.message) {
        const messageAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'message',
            message: 'Add a description for this share (optional):'
          }
        ]);
        sessionData.message = messageAnswer.message;
      } else {
        sessionData.message = options.message;
      }
      
      spinner.start('Uploading session to ccshare...');
      const shareUrl = await uploadSession(sessionData);
      spinner.succeed('Session uploaded successfully');
      
      console.log(chalk.green('\n✅ Your session has been shared!'));
      console.log(chalk.white('Share URL: ') + chalk.cyan(shareUrl));
      console.log(chalk.gray('\nAnyone with this link can view your Claude Code session.'));
      
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch for new prompts and share on demand')
  .option('--api-url <url>', 'Custom API URL for sharing', 'https://ccshare.cc/shares')
  .option('--include-claude-md', 'Include CLAUDE.md file without asking')
  .option('--exclude-auto', 'Exclude auto-generated prompts')
  .action(async (options) => {
    try {
      const watcher = new SessionWatcher({
        apiUrl: options.apiUrl,
        includeClaudeMd: options.includeClaudeMd,
        excludeAuto: options.excludeAuto
      });
      
      await watcher.start();
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('load <slug>')
  .description('Load prompts from a shared slug and execute with claude -p')
  .option('--api-url <url>', 'Custom API URL', 'https://ccshare.cc/shares')
  .option('--dry-run', 'Show prompts without executing')
  .option('--select', 'Select which prompts to execute')
  .action(async (slug, options) => {
    try {
      const spinner = ora(`Fetching share: ${slug}...`).start();
      
      const shareData = await fetchFromSlug(slug, options.apiUrl);
      
      if (!shareData) {
        spinner.fail('Failed to fetch share');
        process.exit(1);
      }
      
      spinner.succeed(`Fetched ${shareData.prompts.length} prompts`);
      
      // Extract user prompts
      const userPrompts = shareData.prompts.filter(p => !p.isAutoGenerated);
      
      if (userPrompts.length === 0) {
        console.log(chalk.yellow('No user prompts found in this share.'));
        process.exit(0);
      }
      
      // Select prompts if requested
      let selectedPrompts = userPrompts;
      if (options.select) {
        const promptChoices = userPrompts.map((prompt, index) => {
          const preview = prompt.content.substring(0, 80).replace(/\n/g, ' ');
          return {
            name: `${index + 1}. ${preview}${prompt.content.length > 80 ? '...' : ''}`,
            value: index,
            checked: true
          };
        });
        
        const { selected } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selected',
            message: 'Select prompts to execute:',
            choices: promptChoices,
            pageSize: 15
          }
        ]);
        
        selectedPrompts = userPrompts.filter((_, index) => selected.includes(index));
      }
      
      if (selectedPrompts.length === 0) {
        console.log(chalk.yellow('No prompts selected.'));
        process.exit(0);
      }
      
      // Show what will be executed
      console.log(chalk.cyan(`\nWill execute ${selectedPrompts.length} prompts:`));
      selectedPrompts.forEach((prompt, index) => {
        const preview = prompt.content.substring(0, 100).replace(/\n/g, ' ');
        console.log(chalk.white(`${index + 1}. ${preview}${prompt.content.length > 100 ? '...' : ''}`));
      });
      
      if (options.dryRun) {
        console.log(chalk.gray('\n[Dry run mode - not executing]'));
        process.exit(0);
      }
      
      // Execute each prompt with claude -p
      console.log(chalk.cyan('\nExecuting prompts...\n'));
      
      for (let i = 0; i < selectedPrompts.length; i++) {
        const prompt = selectedPrompts[i];
        console.log(chalk.blue(`[${i + 1}/${selectedPrompts.length}] Executing prompt...`));
        
        try {
          // Escape quotes in the prompt content
          const escapedPrompt = prompt.content.replace(/'/g, "'\\''");
          
          // Execute claude -p command
          const { stdout, stderr } = await execAsync(`claude -p '${escapedPrompt}'`, {
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          });
          
          if (stdout) {
            console.log(stdout);
          }
          
          if (stderr) {
            console.error(chalk.red('Error output:'), stderr);
          }
          
          // Add a small delay between prompts to avoid overwhelming
          if (i < selectedPrompts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error: any) {
          console.error(chalk.red(`Failed to execute prompt ${i + 1}:`), error.message);
          
          const { continueExecution } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueExecution',
              message: 'Continue with remaining prompts?',
              default: true
            }
          ]);
          
          if (!continueExecution) {
            process.exit(1);
          }
        }
      }
      
      console.log(chalk.green('\n✅ All prompts executed successfully!'));
      
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List your recent shares')
  .action(async () => {
    console.log(chalk.yellow('This feature is coming soon!'));
  });

program.parse();
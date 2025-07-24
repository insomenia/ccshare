#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { captureSession, captureRawSession } from './capture.js';
import { uploadSession } from './upload.js';
import { SessionData, RawSessionData } from './types.js';
import { shareToAPIRaw, fetchFromSlug } from './share-service.js';
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
  .action(async (options) => {
    // Default action - share raw session data to API
    try {
      // Use limit from options, recent flag, or default to 20
      const limit = options.limit || options.recent || (options.all ? 1000 : 20);
      const spinner = options.json ? null : ora('Fetching session data...').start();
      
      const rawData = await captureRawSession(options.session, limit);
      
      if (spinner) spinner.succeed('Session data fetched');
      
      // Allow user to select prompts
      let selectedPrompts = rawData.prompts;
      
      // If --recent is used, skip prompt selection
      if (options.recent) {
        selectedPrompts = rawData.prompts.slice(-options.recent);
        if (!options.json) {
          console.log(chalk.cyan(`\n📝 Using ${options.recent} most recent prompts`));
        }
      } else if (options.select !== false && !options.json && rawData.prompts.length > 0) {
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
        
        if (selectedPrompts.length === 0) {
          console.log(chalk.yellow('\nNo prompts selected.'));
          process.exit(0);
        }
      }
      
      // Flatten selected prompts into raw session entries array
      const sessionEntries: any[] = [];
      selectedPrompts.forEach(prompt => {
        // Add user prompt
        sessionEntries.push(prompt.userPrompt);
        // Add all subsequent entries
        sessionEntries.push(...prompt.sessionEntries);
      });
      
      // Add ccshare metadata
      const metadata = {
        ...rawData.metadata,
        ccshareVersion: '0.3.0',
        generatedAt: new Date().toISOString(),
        selectedPromptsCount: selectedPrompts.length,
        totalEntriesCount: sessionEntries.length
      };
      
      const payload = {
        sessionEntries,
        metadata
      };
      
      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        process.exit(0);
      }
      
      // HTML generation is now deprecated
      if (options.html) {
        console.log(chalk.yellow('⚠️  HTML generation is deprecated. Use --json to see the raw data.'));
        process.exit(0);
      }
      
      // Send to API
      const apiUrl = options.apiUrl;
      
      // Show JSON if requested (for debugging)
      if (process.env.DEBUG_SHARE) {
        console.log('\nJSON being sent to API:');
        console.log(JSON.stringify(payload, null, 2));
      }
      
      try {
        const result = await shareToAPIRaw(payload, apiUrl);
        if (result.url) {
          console.log(chalk.green(`\n✅ Shared successfully: ${result.url}`));
          await openUrl(result.url);
        }
      } catch (error: any) {
        // API might return HTML login page or other errors
        if (!options.json) {
          console.log(chalk.yellow('\n⚠️  Direct API sharing failed, using browser submission...'));
        }
        
        // Fallback to form submission
        const tempFilePath = await createAutoPostForm(payload, apiUrl);
        if (!options.json) {
          console.log(chalk.yellow('📤 Opening browser to submit data...'));
        }
        await openUrl(`file://${tempFilePath}`);
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
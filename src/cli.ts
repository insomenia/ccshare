#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { captureSession, captureRawSession } from './capture.js';
import { uploadSession } from './upload.js';
import { SessionData, RawSessionData } from './types.js';
import { fetchFromSlug } from './share-service.js';
import { createAutoPostForm } from './browser-post.js';
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
  .option('--exclude-auto', 'Exclude auto-generated prompts')
  .option('-l, --limit <number>', 'Maximum number of prompts to fetch from session files', parseInt)
  .option('-o, --optimize', 'Generate optimized prompt using Claude')
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
        // Reverse the prompts to show most recent first
        const reversedPrompts = [...rawData.prompts].reverse();
        const choices = reversedPrompts.map((p, index) => {
          // Replace newlines and multiple spaces with single space
          const cleanContent = p.userPrompt.message?.content
            ?.replace(/\n+/g, ' ')
            ?.replace(/\s+/g, ' ')
            ?.trim() || '';
          const preview = cleanContent.substring(0, 100);
          
          return {
            name: `${reversedPrompts.length - index}. ${preview}${cleanContent.length > 100 ? '...' : ''}`,
            value: rawData.prompts.length - 1 - index, // Map back to original index
            checked: true
          };
        });
        
        const { selected } = await inquirer.prompt([{
          type: 'checkbox',
          name: 'selected',
          message: 'Select prompts to share (most recent first):',
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
      
      const payload: any = {
        sessionEntries,
        metadata
      };
      
      // Generate optimized prompt if requested
      if (options.optimize) {
        if (!options.json) {
          const spinner = ora('Generating optimized prompt with Claude...').start();
          try {
            // Create a summary of the session data for the prompt
            const sessionSummary = {
              prompts: selectedPrompts.map(p => ({
                content: p.userPrompt.message?.content || '',
                timestamp: p.userPrompt.timestamp
              })),
              metadata: {
                techStack: metadata.techStack,
                totalPrompts: selectedPrompts.length,
                projectName: metadata.workingDirectory?.split('/').pop()
              }
            };
            
            // Create prompt for Claude
            const optimizationPrompt = `Claude Code 세션 데이터를 기반으로 동일한 결과를 얻을 수 있는 최적화된 프롬프트를 만들어줘.

프로젝트 정보:
- 프로젝트명: ${sessionSummary.metadata.projectName || 'Unknown'}
- 기술 스택: ${JSON.stringify(sessionSummary.metadata.techStack || {}, null, 2)}

사용자 프롬프트들:
${sessionSummary.prompts.map((p, i) => `${i + 1}. ${p.content}`).join('\n')}

위 내용을 하나의 통합된 프롬프트로 만들어서 마크다운 형식으로 작성해줘. 프롬프트는 명확하고 구체적이어야 하며, 모든 요구사항을 포함해야 해.`;
            
            // Save to temp file to avoid shell escaping issues
            const tempFile = path.join(process.env.TMPDIR || '/tmp', `ccshare-prompt-${Date.now()}.txt`);
            await fs.writeFile(tempFile, optimizationPrompt);
            
            // Execute claude -p command with file
            const { stdout } = await execAsync(`claude -p "$(cat '${tempFile}')"`, {
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
              timeout: 60000 // 60 second timeout
            });
            
            // Clean up temp file
            await fs.unlink(tempFile).catch(() => {});
            
            // Add optimized prompt to payload
            payload.optimizedPrompt = stdout.trim();
            
            spinner.succeed('Optimized prompt generated');
          } catch (error: any) {
            spinner.fail('Failed to generate optimized prompt');
            console.error(chalk.red('Error:'), error.message);
            // Continue without optimized prompt
          }
        } else {
          // For JSON output, generate optimized prompt without spinner
          try {
            const sessionSummary = {
              prompts: selectedPrompts.map(p => ({
                content: p.userPrompt.message?.content || '',
                timestamp: p.userPrompt.timestamp
              })),
              metadata: {
                techStack: metadata.techStack,
                totalPrompts: selectedPrompts.length,
                projectName: metadata.workingDirectory?.split('/').pop()
              }
            };
            
            const optimizationPrompt = `Claude Code 세션 데이터를 기반으로 동일한 결과를 얻을 수 있는 최적화된 프롬프트를 만들어줘.

프로젝트 정보:
- 프로젝트명: ${sessionSummary.metadata.projectName || 'Unknown'}
- 기술 스택: ${JSON.stringify(sessionSummary.metadata.techStack || {}, null, 2)}

사용자 프롬프트들:
${sessionSummary.prompts.map((p, i) => `${i + 1}. ${p.content}`).join('\n')}

위 내용을 하나의 통합된 프롬프트로 만들어서 마크다운 형식으로 작성해줘. 프롬프트는 명확하고 구체적이어야 하며, 모든 요구사항을 포함해야 해.`;
            
            const tempFile = path.join(process.env.TMPDIR || '/tmp', `ccshare-prompt-${Date.now()}.txt`);
            await fs.writeFile(tempFile, optimizationPrompt);
            
            const { stdout } = await execAsync(`claude -p "$(cat '${tempFile}')"`, {
              maxBuffer: 1024 * 1024 * 10,
              timeout: 60000
            });
            
            await fs.unlink(tempFile).catch(() => {});
            
            payload.optimizedPrompt = stdout.trim();
          } catch (error: any) {
            // Silent fail for JSON mode
          }
        }
      }
      
      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        process.exit(0);
      }
      
      // HTML generation is now deprecated
      if (options.html) {
        console.log(chalk.yellow('⚠️  HTML generation is deprecated. Use --json to see the raw data.'));
        process.exit(0);
      }
      
      // Send to API via browser form submission
      const apiUrl = options.apiUrl;
      
      // Show JSON if requested (for debugging)
      if (process.env.DEBUG_SHARE) {
        console.log('\nJSON being sent to API:');
        console.log(JSON.stringify(payload, null, 2));
      }
      
      // Always use browser form submission
      const tempFilePath = await createAutoPostForm(payload, apiUrl);
      if (!options.json) {
        console.log(chalk.cyan('📤 Opening browser to share...'));
      }
      await openUrl(`file://${tempFilePath}`);
      
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
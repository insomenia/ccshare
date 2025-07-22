#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { captureSession } from './capture.js';
import { uploadSession } from './upload.js';
import { analyzeProject } from './analyze.js';
import { SessionData } from './types.js';
import { generateHtml } from './html-generator.js';
import { detectTechStack } from './tech-detector.js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const program = new Command();

program
  .name('ccshare')
  .description('Share Claude Code prompts and results')
  .version('0.1.0')
  .option('-s, --session <path>', 'Path to session file or directory')
  .option('-a, --all', 'Include all session history')
  .option('-n, --no-select', 'Skip prompt selection')
  .action(async (options) => {
    // Default action - generate HTML report and open it
    try {
      const spinner = ora('Analyzing Claude Code session...').start();
      
      // Find and capture session
      const sessionData = await captureSession(options.session, options.all);
      
      // Get git diffs for changed files
      const projectInfo = await analyzeProject();
      
      spinner.succeed('Analysis complete');
      
      // Build data for HTML with prompts grouped with their changes
      let userPrompts = sessionData.prompts.filter(p => p.role === 'user');
      const allDiffs = projectInfo.fileDiffs || [];
      
      // Allow user to select prompts if not disabled
      if (options.select !== false && userPrompts.length > 0) {
        const promptChoices = userPrompts.map((prompt, index) => {
          const cleanContent = prompt.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          const displayContent = cleanContent.substring(0, 80);
          return {
            name: `${index + 1}. ${displayContent}${cleanContent.length > 80 ? '...' : ''}`,
            value: index,
            checked: true
          };
        });
        
        const { selectedPrompts } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedPrompts',
            message: '선택할 프롬프트를 체크하세요 (스페이스바로 선택/해제):',
            choices: promptChoices,
            pageSize: 15
          }
        ]);
        
        // Filter prompts based on selection
        userPrompts = userPrompts.filter((_, index) => selectedPrompts.includes(index));
        
        if (userPrompts.length === 0) {
          console.log(chalk.yellow('\n선택된 프롬프트가 없습니다.'));
          process.exit(0);
        }
      }
      
      // Match file diffs with prompts based on associated files
      const promptsWithChanges = userPrompts.map((prompt) => {
        let associatedDiffs: typeof allDiffs = [];
        
        if (prompt.associatedFiles && prompt.associatedFiles.length > 0) {
          // Find diffs for files associated with this prompt
          associatedDiffs = allDiffs.filter(diff => 
            prompt.associatedFiles!.some((file: string) => diff.path.includes(file))
          );
        }
        
        return {
          prompt: prompt.content,
          timestamp: prompt.timestamp,
          sourceFile: (prompt as any).sourceFile,
          fileDiffs: associatedDiffs
        };
      });
      
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
            `${timestamps[0].toLocaleDateString('ko-KR')} ~ ${timestamps[timestamps.length - 1].toLocaleDateString('ko-KR')}` : 
            undefined,
          sources: sources.length > 0 ? sources : undefined
        };
      }
      
      const htmlData = {
        promptsWithChanges,
        sessionInfo,
        techStack
      };
      
      // Generate HTML
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
  .command('list')
  .description('List your recent shares')
  .action(async () => {
    console.log(chalk.yellow('This feature is coming soon!'));
  });

program.parse();
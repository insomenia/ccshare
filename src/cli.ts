#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { captureSession } from './capture.js';
import { uploadSession } from './upload.js';
import { analyzeProject } from './analyze.js';
import { SessionData } from './types.js';

const program = new Command();

program
  .name('ccshare')
  .description('Share Claude Code prompts and results')
  .version('0.1.0')
  .action(async () => {
    // Default action - show project info
    try {
      const spinner = ora('Analyzing project...').start();
      const projectInfo = await analyzeProject();
      spinner.succeed('Analysis complete');
      
      console.log('\n' + chalk.blue('📊 CCShare Project Analysis'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(JSON.stringify(projectInfo, null, 2));
      
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
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { SessionData, Prompt } from './types.js';
import { parseJSONLSessionData } from './capture.js';
import { createAutoPostForm } from './browser-post.js';
import { transformToShareData } from './share-service.js';
import { detectTechStack } from './tech-detector.js';
import { execSync } from 'child_process';
import readline from 'readline';

export interface WatchOptions {
  apiUrl: string;
  includeClaudeMd?: boolean;
  excludeAuto?: boolean;
}

interface WatchState {
  sessionData: SessionData;
  lastProcessedLine: number;
  prompts: Prompt[];
  currentSessionFile?: string;
}

export class SessionWatcher {
  private state: WatchState;
  private watcher?: fs.FSWatcher;
  private options: WatchOptions;
  private rl: readline.Interface;

  constructor(options: WatchOptions) {
    this.options = options;
    this.state = {
      sessionData: {
        timestamp: new Date().toISOString(),
        prompts: [],
        changes: [],
        toolCalls: [],
        metadata: {
          platform: process.platform,
          workingDirectory: process.cwd(),
          models: [],
          mcpServers: []
        }
      },
      lastProcessedLine: 0,
      prompts: []
    };

    // Setup readline for keyboard input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Handle Ctrl+C gracefully
    this.rl.on('SIGINT', () => {
      this.stop();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    console.clear();
    console.log(chalk.blue('🔍 CCShare Watch Mode'));
    console.log(chalk.gray('Watching for new prompts...'));
    console.log(chalk.gray('Press [S] to share, [C] to clear, [Q] to quit\n'));

    // Find the current session file
    const projectPath = process.cwd();
    const projectDirName = projectPath.replace(/[\/\.]/g, '-');
    const claudeProjectPath = path.join(process.env.HOME || '', '.claude', 'projects', projectDirName);

    try {
      // Find the most recent JSONL file
      const files = fs.readdirSync(claudeProjectPath)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(claudeProjectPath, f),
          mtime: fs.statSync(path.join(claudeProjectPath, f)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (files.length === 0) {
        console.log(chalk.yellow('No session files found. Waiting for Claude Code to create one...'));
        this.watchDirectory(claudeProjectPath);
        return;
      }

      this.state.currentSessionFile = files[0].path;
      console.log(chalk.green(`Watching: ${files[0].name}`));
      
      // Initial read
      await this.processFile(this.state.currentSessionFile);
      
      // Start watching
      this.watchFile(this.state.currentSessionFile);
      
    } catch (err) {
      console.error(chalk.red('Error finding session files:'), err);
      return;
    }

    // Handle keyboard input
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', async (str, key) => {
      if (key.ctrl && key.name === 'c') {
        this.stop();
        process.exit(0);
      }

      switch (str?.toLowerCase()) {
        case 's':
          await this.share();
          break;
        case 'c':
          console.clear();
          this.displayPrompts();
          break;
        case 'q':
          this.stop();
          process.exit(0);
          break;
      }
    });
  }

  private watchFile(filePath: string): void {
    this.watcher = fs.watch(filePath, async (eventType) => {
      if (eventType === 'change') {
        await this.processFile(filePath);
      }
    });
  }

  private watchDirectory(dirPath: string): void {
    this.watcher = fs.watch(dirPath, async (eventType, filename) => {
      if (filename?.endsWith('.jsonl')) {
        const filePath = path.join(dirPath, filename);
        if (fs.existsSync(filePath)) {
          console.log(chalk.green(`\nNew session file detected: ${filename}`));
          this.state.currentSessionFile = filePath;
          this.state.lastProcessedLine = 0;
          
          // Stop watching directory, start watching file
          this.watcher?.close();
          await this.processFile(filePath);
          this.watchFile(filePath);
        }
      }
    });
  }

  private async processFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length <= this.state.lastProcessedLine) {
        return; // No new lines
      }

      // Process only new lines
      const newLines = lines.slice(this.state.lastProcessedLine);
      const newContent = newLines.join('\n');
      
      // Parse the new content
      const newData = parseJSONLSessionData(newContent);
      
      // Filter prompts if needed
      let newPrompts = newData.prompts.filter(p => p.role === 'user');
      if (this.options.excludeAuto) {
        newPrompts = newPrompts.filter(p => !p.isAutoGenerated);
      }

      // Add new prompts and changes
      if (newPrompts.length > 0) {
        this.state.prompts.push(...newPrompts);
        this.state.sessionData.prompts.push(...newData.prompts);
        this.state.sessionData.changes.push(...newData.changes);
        
        // Update metadata
        if (newData.metadata?.models) {
          newData.metadata.models.forEach(model => {
            if (!this.state.sessionData.metadata?.models?.includes(model)) {
              this.state.sessionData.metadata?.models?.push(model);
            }
          });
        }

        // Display new prompts
        console.log(chalk.cyan(`\n[${new Date().toLocaleTimeString()}] New prompt detected:`));
        newPrompts.forEach(prompt => {
          const preview = prompt.content.substring(0, 100).replace(/\n/g, ' ');
          console.log(chalk.white(`  ${preview}${prompt.content.length > 100 ? '...' : ''}`));
          
          if (prompt.associatedFiles && prompt.associatedFiles.length > 0) {
            console.log(chalk.gray(`  Files: ${prompt.associatedFiles.join(', ')}`));
          }
        });
        
        console.log(chalk.gray(`\nTotal prompts: ${this.state.prompts.length}`));
      }
      
      this.state.lastProcessedLine = lines.length;
      
    } catch (err) {
      console.error(chalk.red('Error processing file:'), err);
    }
  }

  private displayPrompts(): void {
    console.log(chalk.blue('🔍 CCShare Watch Mode'));
    console.log(chalk.gray('Press [S] to share, [C] to clear, [Q] to quit\n'));
    
    if (this.state.prompts.length === 0) {
      console.log(chalk.gray('No prompts captured yet...'));
      return;
    }

    console.log(chalk.cyan(`Captured ${this.state.prompts.length} prompts:\n`));
    
    this.state.prompts.forEach((prompt, index) => {
      const preview = prompt.content.substring(0, 80).replace(/\n/g, ' ');
      console.log(chalk.white(`${index + 1}. ${preview}${prompt.content.length > 80 ? '...' : ''}`));
      
      if (prompt.associatedFiles && prompt.associatedFiles.length > 0) {
        console.log(chalk.gray(`   Files: ${prompt.associatedFiles.join(', ')}`));
      }
    });
  }

  private async share(): Promise<void> {
    if (this.state.prompts.length === 0) {
      console.log(chalk.yellow('\nNo prompts to share yet.'));
      return;
    }

    console.log(chalk.cyan('\n📤 Sharing session...'));
    
    try {
      // Prepare data for sharing
      const techStack = await detectTechStack(process.cwd());
      
      // Match file diffs with prompts
      const promptsWithChanges = this.state.prompts.map(prompt => {
        let associatedDiffs: Array<{ path: string; diff: string }> = [];
        
        if (prompt.associatedFiles && prompt.associatedFiles.length > 0) {
          const relatedChanges = this.state.sessionData.changes.filter(change => 
            prompt.associatedFiles!.includes(change.path) && change.diff
          );
          
          associatedDiffs = relatedChanges.map(change => ({
            path: change.path,
            diff: change.diff!
          }));
        }
        
        return {
          prompt: prompt.content,
          timestamp: prompt.timestamp,
          fileDiffs: associatedDiffs
        };
      });

      const htmlData = {
        promptsWithChanges,
        sessionInfo: {
          totalPrompts: this.state.prompts.length,
          projectPath: process.cwd()
        },
        techStack
      };

      const shareData = transformToShareData(htmlData, this.state.sessionData);
      
      // Check for CLAUDE.md
      if (!this.options.includeClaudeMd) {
        try {
          const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
          const claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8');
          shareData.claudeMd = claudeMdContent;
        } catch {
          // CLAUDE.md doesn't exist
        }
      }

      // Create and open share form
      const tempHtmlPath = await createAutoPostForm(shareData, this.options.apiUrl);
      
      const openCommand = process.platform === 'darwin' ? 'open' : 
                         process.platform === 'win32' ? 'start' : 'xdg-open';
      
      execSync(`${openCommand} "${tempHtmlPath}"`);
      console.log(chalk.green('✅ Opening browser to share...'));
      
    } catch (err) {
      console.error(chalk.red('Error sharing:'), err);
    }
  }

  stop(): void {
    console.log(chalk.yellow('\n\nStopping watch mode...'));
    this.watcher?.close();
    this.rl.close();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }
}

// Export function for parsing JSONL (needed by SessionWatcher)
export { parseJSONLSessionData } from './capture.js';
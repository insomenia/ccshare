import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { SessionData, Prompt } from './types.js';
import { parseJSONLSessionData, parseSessionData } from './capture.js';
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
  recentFileChanges: Array<{ path: string; timestamp: string }>;
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
      prompts: [],
      recentFileChanges: []
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
    // Replace all non-alphanumeric characters with dashes, matching Claude's behavior
    const projectDirName = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
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

      // Check for new file changes
      const newFileChanges = newData.changes.filter(change => 
        change.diff && 
        !this.state.recentFileChanges.some(rc => 
          rc.path === change.path && rc.timestamp === change.timestamp
        )
      );
      
      // Debug logging
      if (process.env.DEBUG_FILE_CHANGES) {
        console.log(`\n[DEBUG] Total changes in newData: ${newData.changes.length}`);
        console.log(`[DEBUG] Changes with diff: ${newData.changes.filter(c => c.diff).length}`);
        console.log(`[DEBUG] New file changes: ${newFileChanges.length}`);
        newData.changes.forEach(change => {
          console.log(`[DEBUG] Change: ${change.path}, has diff: ${!!change.diff}`);
        });
      }
      
      if (newFileChanges.length > 0) {
        this.state.sessionData.changes.push(...newFileChanges);
        newFileChanges.forEach(change => {
          this.state.recentFileChanges.push({
            path: change.path,
            timestamp: change.timestamp
          });
        });
        
        // Display file changes
        console.log(chalk.yellow(`\n[${new Date().toLocaleTimeString()}] File changes detected:`));
        newFileChanges.forEach(change => {
          console.log(chalk.green(`  ✓ ${change.path}`));
        });
      }
      
      // Add new prompts and all related data
      if (newPrompts.length > 0 || newData.prompts.length > 0) {
        // Add user prompts to our filtered list
        this.state.prompts.push(...newPrompts);
        
        // Add ALL prompts (including assistant responses) to sessionData
        // This is important for proper prompt-file association
        this.state.sessionData.prompts.push(...newData.prompts);
        
        // Update metadata
        if (newData.metadata?.models) {
          newData.metadata.models.forEach(model => {
            if (!this.state.sessionData.metadata?.models?.includes(model)) {
              this.state.sessionData.metadata?.models?.push(model);
            }
          });
        }
        
        // Also add any tool calls
        if (newData.toolCalls) {
          this.state.sessionData.toolCalls = [
            ...(this.state.sessionData.toolCalls || []),
            ...newData.toolCalls
          ];
        }
        
        // Display new prompts
        if (newPrompts.length > 0) {
          console.log(chalk.cyan(`\n[${new Date().toLocaleTimeString()}] New prompt detected:`));
          newPrompts.forEach(prompt => {
            const preview = prompt.content.substring(0, 100).replace(/\n/g, ' ');
            console.log(chalk.white(`  ${preview}${prompt.content.length > 100 ? '...' : ''}`));
            
            if (prompt.associatedFiles && prompt.associatedFiles.length > 0) {
              console.log(chalk.gray(`  Associated files: ${prompt.associatedFiles.join(', ')}`));
            }
          });
        }
      }
      
      // Display current status
      if (newPrompts.length > 0 || newFileChanges.length > 0) {
        console.log(chalk.gray(`\nStatus: ${this.state.prompts.length} prompts, ${this.state.sessionData.changes.filter(c => c.diff).length} file changes`));
      }
      
      this.state.lastProcessedLine = lines.length;
      
    } catch (err) {
      console.error(chalk.red('Error processing file:'), err);
    }
  }

  private displayPrompts(): void {
    console.log(chalk.blue('🔍 CCShare Watch Mode'));
    console.log(chalk.gray('Press [S] to share, [C] to clear, [Q] to quit\n'));
    
    if (this.state.prompts.length === 0 && this.state.sessionData.changes.filter(c => c.diff).length === 0) {
      console.log(chalk.gray('No prompts or file changes captured yet...'));
      return;
    }

    // Display prompts
    if (this.state.prompts.length > 0) {
      console.log(chalk.cyan(`\nPrompts (${this.state.prompts.length}):\n`));
      
      this.state.prompts.forEach((prompt, index) => {
        const preview = prompt.content.substring(0, 80).replace(/\n/g, ' ');
        console.log(chalk.white(`${index + 1}. ${preview}${prompt.content.length > 80 ? '...' : ''}`));
        
        if (prompt.associatedFiles && prompt.associatedFiles.length > 0) {
          console.log(chalk.gray(`   Associated: ${prompt.associatedFiles.join(', ')}`));
        }
      });
    }
    
    // Display file changes
    const fileChanges = this.state.sessionData.changes.filter(c => c.diff);
    if (fileChanges.length > 0) {
      console.log(chalk.yellow(`\nFile Changes (${fileChanges.length}):\n`));
      
      // Group by file path and show latest change
      const latestChanges = new Map<string, typeof fileChanges[0]>();
      fileChanges.forEach(change => {
        const existing = latestChanges.get(change.path);
        if (!existing || new Date(change.timestamp) > new Date(existing.timestamp)) {
          latestChanges.set(change.path, change);
        }
      });
      
      Array.from(latestChanges.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10) // Show last 10 files
        .forEach(change => {
          const time = new Date(change.timestamp).toLocaleTimeString();
          console.log(chalk.green(`  ✓ ${change.path} ${chalk.gray(`(${time})`)}`));
        });
      
      if (latestChanges.size > 10) {
        console.log(chalk.gray(`  ... and ${latestChanges.size - 10} more files`));
      }
    }
  }

  private async share(): Promise<void> {
    if (this.state.prompts.length === 0) {
      console.log(chalk.yellow('\nNo prompts to share yet.'));
      return;
    }

    console.log(chalk.cyan('\n📤 Sharing session...'));
    
    try {
      // Re-read the current session file to get complete data with diffs
      let completeSessionData = this.state.sessionData;
      if (this.state.currentSessionFile) {
        try {
          const content = fs.readFileSync(this.state.currentSessionFile, 'utf-8');
          completeSessionData = parseSessionData(content);
          console.log(chalk.gray('Reloaded session file for complete data...'));
        } catch (err) {
          console.log(chalk.yellow('Could not reload session file, using cached data'));
        }
      }
      // Prepare data for sharing
      const techStack = await detectTechStack(process.cwd());
      
      // Use the prompts from state but ensure we have all the data
      const userPrompts = this.state.prompts;
      
      // Prepare prompts data
      const promptsData = userPrompts.map(prompt => ({
        prompt: prompt.content,
        timestamp: prompt.timestamp,
        sourceFile: (prompt as any).sourceFile
      }));
      
      // Collect file diffs based on prompt timestamps
      const promptTimestamps = userPrompts.map(p => new Date(p.timestamp).getTime());
      const earliestPromptTime = Math.min(...promptTimestamps);
      const latestPromptTime = Math.max(...promptTimestamps);
      
      // Filter file changes that occurred after the earliest prompt
      // and within a reasonable time window (e.g., 5 minutes after the latest prompt)
      const timeWindowMs = 5 * 60 * 1000; // 5 minutes
      
      // Debug: Check what changes we have
      if (process.env.DEBUG_FILE_CHANGES) {
        console.log(`\n[DEBUG] Total changes in sessionData: ${this.state.sessionData.changes.length}`);
        this.state.sessionData.changes.forEach((change, idx) => {
          console.log(`[DEBUG] Change ${idx}: ${change.path}, has diff: ${!!change.diff}, timestamp: ${change.timestamp}`);
        });
      }
      
      const fileDiffs = completeSessionData.changes
        .filter(change => {
          if (!change.diff || !change.timestamp) {
            if (process.env.DEBUG_FILE_CHANGES) {
              console.log(`[DEBUG] Skipping change without diff: ${change.path}`);
            }
            return false;
          }
          
          const changeTime = new Date(change.timestamp).getTime();
          // Include changes that happened after the first prompt
          // and within 5 minutes after the last prompt
          const included = changeTime >= earliestPromptTime && 
                 changeTime <= (latestPromptTime + timeWindowMs);
          
          if (process.env.DEBUG_FILE_CHANGES) {
            console.log(`[DEBUG] Change ${change.path}: time check ${included} (${new Date(changeTime).toISOString()})`);
          }
          
          return included;
        })
        .map(change => ({
          path: change.path,
          diff: change.diff!
        }));
      
      if (process.env.DEBUG_FILE_CHANGES) {
        console.log(`[DEBUG] Final fileDiffs count: ${fileDiffs.length}`);
      }

      const htmlData = {
        prompts: promptsData,
        fileDiffs,
        sessionInfo: {
          totalPrompts: this.state.prompts.length,
          projectPath: process.cwd()
        },
        techStack
      };

      const shareData = transformToShareData(htmlData, completeSessionData);
      
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
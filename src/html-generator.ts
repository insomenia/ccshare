import { escape } from 'html-escaper';
import { TechStack } from './tech-detector.js';
import { WorkflowItem, AssistantAction, ToolExecution } from './types.js';

export interface HtmlData {
  prompts: Array<{
    prompt: string;
    timestamp?: string;
    sourceFile?: string;
  }>;
  fileDiffs: Array<{
    path: string;
    diff: string;
  }>;
  workflow?: WorkflowItem[];  // Combined workflow
  assistantActions?: AssistantAction[];
  toolExecutions?: ToolExecution[];
  sessionInfo?: {
    totalPrompts: number;
    timeRange?: string;
    sources?: string[];
    projectPath?: string;
    claudeProjectPath?: string;
  };
  techStack?: TechStack;
}

export function generateHtml(data: HtmlData): string {
  const { prompts, fileDiffs, assistantActions, toolExecutions, workflow, sessionInfo, techStack } = data;

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Session - ${new Date().toLocaleString('en-US')}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* Custom styles for diff highlighting */
    .diff-line { font-family: 'Consolas', 'Monaco', 'Courier New', monospace; }
    .diff-added { background-color: #065f46; color: #d1fae5; }
    .diff-removed { background-color: #7f1d1d; color: #fee2e2; }
    .diff-header { background-color: #374151; color: #9ca3af; }
    .diff-context { color: #9ca3af; }
    
    /* Custom scrollbar for code blocks */
    .diff-content::-webkit-scrollbar {
      height: 8px;
      width: 8px;
    }
    .diff-content::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }
    .diff-content::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    .diff-content::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  </style>
  <script>
    function copyPrompt(index) {
      const promptElement = document.querySelector(\`#prompt-\${index} .prompt-content\`);
      const promptText = promptElement.textContent.trim();
      
      const markdown = \`## Prompt #\${index + 1}\\n\\n\${promptText}\`;
      
      navigator.clipboard.writeText(markdown).then(() => {
        const btn = document.querySelector(\`#copy-prompt-\${index}\`);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('bg-green-600');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('bg-green-600');
        }, 2000);
      });
    }
    
    function copyFileDiff(index) {
      const fileChange = document.querySelector(\`#file-\${index}\`);
      const filePath = fileChange.querySelector('.file-path').textContent.trim();
      const diffContent = fileChange.querySelector('.diff-content pre').textContent.trim();
      
      const markdown = \`#### \${filePath}\\n\\n\\\`\\\`\\\`diff\\n\${diffContent}\\n\\\`\\\`\\\`\`;
      
      navigator.clipboard.writeText(markdown).then(() => {
        const btn = document.querySelector(\`#copy-file-\${index}\`);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('bg-green-600');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('bg-green-600');
        }, 2000);
      });
    }
  </script>
</head>
<body class="min-h-full bg-gray-900">
  <!-- Header -->
  <header class="bg-gray-800 shadow-lg border-b border-gray-700">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 class="text-3xl text-white">
        <span class="font-bold">Claude Code</span>
        <span class="font-light">Session</span>
      </h1>
      <div class="text-gray-400 mt-2 text-sm">
        ${new Date().toLocaleString('en-US')}
      </div>
      ${sessionInfo ? `
        <div class="mt-4 text-gray-300 text-sm space-y-1">
          <div>• Total ${sessionInfo.totalPrompts} prompts</div>
          ${sessionInfo.timeRange ? `<div>• Period: ${sessionInfo.timeRange}</div>` : ''}
          ${sessionInfo.sources && sessionInfo.sources.length > 0 ? `<div>• Sources: ${sessionInfo.sources.join(', ')}</div>` : ''}
          ${sessionInfo.projectPath ? `<div>• Project Path: ${escape(sessionInfo.projectPath)}</div>` : ''}
          ${sessionInfo.claudeProjectPath ? `<div>• Claude Project Path: ${escape(sessionInfo.claudeProjectPath)}</div>` : ''}
        </div>
      ` : ''}
    </div>
  </header>
  
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Tech Stack -->
    ${techStack && (techStack.languages.length > 0 || techStack.frameworks.length > 0 || techStack.tools.length > 0 || techStack.databases.length > 0) ? `
      <div class="bg-gray-800 rounded-lg shadow-sm p-6 mb-8 border border-gray-700">
        <h3 class="text-lg font-semibold text-gray-200 mb-4">
          Tech Stack
        </h3>
        <div class="flex flex-wrap gap-2">
          ${techStack.languages.map(lang => `
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-900 text-blue-300 border border-blue-700">
              ${escape(lang)}
            </span>
          `).join('')}
          ${techStack.frameworks.map(fw => `
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-900 text-red-300 border border-red-700">
              ${escape(fw)}
            </span>
          `).join('')}
          ${techStack.tools.map(tool => `
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-900 text-green-300 border border-green-700">
              ${escape(tool)}
            </span>
          `).join('')}
          ${techStack.databases.map(db => `
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-900 text-yellow-300 border border-yellow-700">
              ${escape(db)}
            </span>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Prompts Section -->
    <div class="bg-gray-800 rounded-lg shadow-sm p-6 mb-8 border border-gray-700">
      <h2 class="text-2xl font-semibold text-gray-200 mb-6 pb-4 border-b border-gray-700">
        Prompts (${prompts.length})
      </h2>
      
      ${prompts.length > 0 ? `
        <div class="space-y-6">
          ${prompts.map((item, index) => `
            <div id="prompt-${index}" class="border-l-4 border-orange-500 pl-6">
              <div class="bg-gray-700 rounded-r-lg p-4">
                <div class="flex justify-between items-start mb-2">
                  <div class="font-semibold text-orange-400">Prompt #${index + 1}</div>
                  <button
                    id="copy-prompt-${index}"
                    onclick="copyPrompt(${index})"
                    class="px-3 py-1 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <div class="prompt-content text-gray-200 whitespace-pre-wrap">${escape(item.prompt)}</div>
                ${item.timestamp || item.sourceFile ? `
                  <div class="mt-3 flex flex-wrap gap-4 text-sm text-gray-400">
                    ${item.timestamp ? `
                      <span class="flex items-center">
                        ${new Date(item.timestamp).toLocaleString('en-US')}
                      </span>
                    ` : ''}
                    ${item.sourceFile ? `
                      <span class="flex items-center">
                        ${escape(item.sourceFile)}
                      </span>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="text-center text-gray-400 italic py-8">
          No prompts found
        </div>
      `}
    </div>

    <!-- File Changes Section -->
    ${fileDiffs && fileDiffs.length > 0 ? `
      <div class="bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-700">
        <h2 class="text-2xl font-semibold text-gray-200 mb-6 pb-4 border-b border-gray-700">
          File Changes (${fileDiffs.length})
        </h2>
        
        <div class="space-y-4">
          ${fileDiffs.map((file, index) => {
            const parsedLines = parseDiff(file.diff);
            return `
              <div id="file-${index}" class="file-change border border-gray-600 rounded-lg overflow-hidden">
                <div class="file-path bg-gray-900 text-gray-200 px-4 py-2 text-sm font-mono flex justify-between items-center">
                  <span>${escape(file.path)}</span>
                  <button
                    id="copy-file-${index}"
                    onclick="copyFileDiff(${index})"
                    class="px-2 py-1 text-xs font-medium text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <div class="diff-content bg-gray-800 overflow-x-auto max-h-96">
                  <pre class="p-4 text-sm">${parsedLines.map(line => {
                    let className = 'diff-line block px-2 ';
                    if (line.type === 'added') className += 'diff-added';
                    else if (line.type === 'removed') className += 'diff-removed';
                    else if (line.type === 'header') className += 'diff-header font-semibold py-1';
                    else className += 'diff-context';
                    
                    return `<span class="${className}">${escape(line.content)}</span>`;
                  }).join('')}</pre>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Workflow Section -->
    ${workflow && workflow.length > 0 ? `
      <div class="bg-gray-800 rounded-lg shadow-sm p-6 mb-8 border border-gray-700">
        <h2 class="text-2xl font-semibold text-gray-200 mb-6 pb-4 border-b border-gray-700">
          Workflow (${workflow.length})
        </h2>
        
        <div class="space-y-4">
          ${workflow.map((item, index) => {
            if (item.type === 'assistant_action') {
              let icon = '📝';
              let colorClass = 'text-gray-400';
              
              switch(item.actionType) {
                case 'explanation':
                  icon = '💡';
                  colorClass = 'text-blue-400';
                  break;
                case 'analysis':
                  icon = '🔍';
                  colorClass = 'text-purple-400';
                  break;
                case 'code_change':
                  icon = '✏️';
                  colorClass = 'text-green-400';
                  break;
                case 'file_read':
                  icon = '📖';
                  colorClass = 'text-yellow-400';
                  break;
                case 'command_execution':
                  icon = '⚡';
                  colorClass = 'text-orange-400';
                  break;
              }
              
              return `
                <div class="flex items-start space-x-3 p-3 rounded-lg bg-gray-700/50">
                  <span class="text-2xl flex-shrink-0">${icon}</span>
                  <div class="flex-1">
                    <div class="${colorClass} font-medium capitalize">${item.actionType?.replace('_', ' ') || 'Action'}</div>
                    <div class="text-gray-300 text-sm mt-1">${escape(item.description || '')}</div>
                    <div class="text-gray-500 text-xs mt-1">${new Date(item.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              `;
            } else if (item.type === 'tool_execution' || item.type === 'tool_result') {
              let icon = '⚙️';
              let colorClass = 'text-gray-400';
              
              switch(item.tool) {
                case 'Bash':
                  icon = '⚡';
                  colorClass = 'text-yellow-400';
                  break;
                case 'Edit':
                case 'MultiEdit':
                  icon = '✏️';
                  colorClass = 'text-blue-400';
                  break;
                case 'Read':
                  icon = '📖';
                  colorClass = 'text-green-400';
                  break;
                case 'Write':
                  icon = '📝';
                  colorClass = 'text-purple-400';
                  break;
                case 'TodoWrite':
                  icon = '✅';
                  colorClass = 'text-orange-400';
                  break;
              }
              
              return `
                <div class="border border-gray-600 rounded-lg overflow-hidden">
                  <div class="bg-gray-900 px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <span class="text-2xl">${icon}</span>
                      <span class="${colorClass} font-mono">${item.tool}</span>
                      <span class="text-gray-500 text-sm">${new Date(item.timestamp).toLocaleTimeString()}</span>
                      ${item.type === 'tool_result' ? '<span class="text-xs text-gray-400 ml-2">[Result]</span>' : ''}
                    </div>
                    ${item.status ? `
                      <span class="text-xs px-2 py-1 rounded ${
                        item.status === 'success' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                      }">
                        ${item.status}
                      </span>
                    ` : ''}
                  </div>
                  ${item.type === 'tool_execution' && item.parameters ? `
                    <div class="bg-gray-800 px-4 py-2 border-t border-gray-700">
                      <div class="text-gray-400 text-sm font-mono">
                        ${item.tool === 'Bash' && item.parameters.command ? 
                          `$ ${escape(item.parameters.command)}` :
                          item.tool === 'Edit' && item.parameters.file_path ?
                          `File: ${escape(item.parameters.file_path)}` :
                          item.tool === 'Read' && item.parameters.file_path ?
                          `File: ${escape(item.parameters.file_path)}` :
                          JSON.stringify(item.parameters, null, 2)
                        }
                      </div>
                    </div>
                  ` : ''}
                  ${item.type === 'tool_result' && item.result ? `
                    <div class="bg-gray-700 px-4 py-3 border-t border-gray-600 max-h-48 overflow-y-auto">
                      <pre class="text-gray-300 text-sm whitespace-pre-wrap">${escape(item.result.substring(0, 1000))}${item.result.length > 1000 ? '\n...' : ''}</pre>
                    </div>
                  ` : ''}
                </div>
              `;
            }
          }).join('')}
        </div>
      </div>
    ` : (assistantActions && assistantActions.length > 0) || (toolExecutions && toolExecutions.length > 0) ? `
      <!-- Assistant Actions Section -->
      ${assistantActions && assistantActions.length > 0 ? `
        <div class="bg-gray-800 rounded-lg shadow-sm p-6 mb-8 border border-gray-700">
          <h2 class="text-2xl font-semibold text-gray-200 mb-6 pb-4 border-b border-gray-700">
            Assistant Actions (${assistantActions.length})
          </h2>
          
          <div class="space-y-3">
            ${assistantActions.map((action, index) => {
              let icon = '📝';
              let colorClass = 'text-gray-400';
              
              switch(action.type) {
                case 'explanation':
                  icon = '💡';
                  colorClass = 'text-blue-400';
                  break;
                case 'analysis':
                  icon = '🔍';
                  colorClass = 'text-purple-400';
                  break;
                case 'code_change':
                  icon = '✏️';
                  colorClass = 'text-green-400';
                  break;
                case 'file_read':
                  icon = '📖';
                  colorClass = 'text-yellow-400';
                  break;
                case 'command_execution':
                  icon = '⚡';
                  colorClass = 'text-orange-400';
                  break;
              }
              
              return `
                <div class="flex items-start space-x-3 p-3 rounded-lg bg-gray-700/50">
                  <span class="text-2xl flex-shrink-0">${icon}</span>
                  <div class="flex-1">
                    <div class="${colorClass} font-medium capitalize">${action.type.replace('_', ' ')}</div>
                    <div class="text-gray-300 text-sm mt-1">${escape(action.description)}</div>
                    <div class="text-gray-500 text-xs mt-1">${new Date(action.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Tool Executions Section -->
      ${toolExecutions && toolExecutions.length > 0 ? `
        <div class="bg-gray-800 rounded-lg shadow-sm p-6 mb-8 border border-gray-700">
          <h2 class="text-2xl font-semibold text-gray-200 mb-6 pb-4 border-b border-gray-700">
            Tool Executions (${toolExecutions.length})
          </h2>
          
          <div class="space-y-4">
            ${toolExecutions.map((exec, index) => {
              let icon = '⚙️';
              let colorClass = 'text-gray-400';
              
              switch(exec.tool) {
                case 'Bash':
                  icon = '⚡';
                  colorClass = 'text-yellow-400';
                  break;
                case 'Edit':
                case 'MultiEdit':
                  icon = '✏️';
                  colorClass = 'text-blue-400';
                  break;
                case 'Read':
                  icon = '📖';
                  colorClass = 'text-green-400';
                  break;
                case 'Write':
                  icon = '📝';
                  colorClass = 'text-purple-400';
                  break;
                case 'TodoWrite':
                  icon = '✅';
                  colorClass = 'text-orange-400';
                  break;
              }
              
              return `
                <div class="border border-gray-600 rounded-lg overflow-hidden">
                  <div class="bg-gray-900 px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <span class="text-2xl">${icon}</span>
                      <span class="${colorClass} font-mono">${exec.tool}</span>
                      <span class="text-gray-500 text-sm">${new Date(exec.timestamp).toLocaleTimeString()}</span>
                    </div>
                    ${exec.status ? `
                      <span class="text-xs px-2 py-1 rounded ${
                        exec.status === 'success' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                      }">
                        ${exec.status}
                      </span>
                    ` : ''}
                  </div>
                  ${exec.parameters ? `
                    <div class="bg-gray-800 px-4 py-2 border-t border-gray-700">
                      <div class="text-gray-400 text-sm font-mono">
                        ${exec.tool === 'Bash' && exec.parameters.command ? 
                          `$ ${escape(exec.parameters.command)}` :
                          exec.tool === 'Edit' && exec.parameters.file_path ?
                          `File: ${escape(exec.parameters.file_path)}` :
                          exec.tool === 'Read' && exec.parameters.file_path ?
                          `File: ${escape(exec.parameters.file_path)}` :
                          JSON.stringify(exec.parameters, null, 2)
                        }
                      </div>
                    </div>
                  ` : ''}
                  ${exec.result ? `
                    <div class="bg-gray-700 px-4 py-3 border-t border-gray-600 max-h-48 overflow-y-auto">
                      <pre class="text-gray-300 text-sm whitespace-pre-wrap">${escape(exec.result.substring(0, 1000))}${exec.result.length > 1000 ? '\n...' : ''}</pre>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    ` : ''}
  </main>
  
  <!-- Footer -->
  <footer class="mt-12 pb-8">
    <div class="text-center text-gray-400 text-sm">
      Generated by <a href="https://ccshare.cc" target="_blank" class="text-orange-400 hover:text-orange-500 underline">ccshare</a>
    </div>
  </footer>
</body>
</html>`;
}

function parseDiff(diff: string): Array<{type: string; content: string}> {
  const lines = diff.split('\n');
  const result: Array<{type: string; content: string}> = [];
  
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff') || line.startsWith('index')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      result.push({ type: 'added', content: line });
    } else if (line.startsWith('-')) {
      result.push({ type: 'removed', content: line });
    } else {
      result.push({ type: 'context', content: line });
    }
  }
  
  return result;
}
import { escape } from 'html-escaper';
import { TechStack } from './tech-detector.js';

export interface HtmlData {
  promptsWithChanges: Array<{
    prompt: string;
    timestamp?: string;
    sourceFile?: string;
    fileDiffs: Array<{
      path: string;
      diff: string;
    }>;
  }>;
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
  const { promptsWithChanges, sessionInfo, techStack } = data;

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
    function copyPromptOnly(index) {
      const promptElement = document.querySelector(\`#prompt-\${index} .prompt-content\`);
      const promptText = promptElement.textContent.trim();
      
      const markdown = \`## Prompt #\${index + 1}\\n\\n\${promptText}\`;
      
      navigator.clipboard.writeText(markdown).then(() => {
        const btn = document.querySelector(\`#copy-prompt-only-\${index}\`);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('bg-green-600');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('bg-green-600');
        }, 2000);
      });
    }
    
    function copyPromptWithChanges(index) {
      const promptElement = document.querySelector(\`#prompt-\${index} .prompt-content\`);
      const promptText = promptElement.textContent.trim();
      
      let markdown = \`## Prompt #\${index + 1}\\n\\n\${promptText}\\n\\n### File Changes\\n\`;
      
      const fileChanges = document.querySelectorAll(\`#prompt-\${index} .file-change\`);
      fileChanges.forEach((fileChange) => {
        const filePath = fileChange.querySelector('.file-path').textContent.trim();
        const diffContent = fileChange.querySelector('.diff-content pre').textContent.trim();
        markdown += \`\\n#### \${filePath}\\n\\n\\\`\\\`\\\`diff\\n\${diffContent}\\n\\\`\\\`\\\`\\n\`;
      });
      
      navigator.clipboard.writeText(markdown).then(() => {
        const btn = document.querySelector(\`#copy-with-changes-\${index}\`);
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
        <span class="font-light">Prompts</span>
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
    
    <!-- Prompts and Changes -->
    <div class="bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-700">
      <h2 class="text-2xl font-semibold text-gray-200 mb-6 pb-4 border-b border-gray-700">
        Prompts and Changes (${promptsWithChanges.length})
      </h2>
      
      ${promptsWithChanges.length > 0 ? `
        <div class="space-y-8">
          ${promptsWithChanges.map((item, index) => `
            <div id="prompt-${index}" class="border-l-4 border-orange-500 pl-6">
              <!-- Prompt -->
              <div class="bg-gray-700 rounded-r-lg p-4 mb-4">
                <div class="flex justify-between items-start mb-2">
                  <div class="font-semibold text-orange-400">Prompt #${index + 1}</div>
                  <div class="flex gap-2">
                    <button
                      id="copy-prompt-only-${index}"
                      onclick="copyPromptOnly(${index})"
                      class="px-3 py-1 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors"
                    >
                      Copy Prompt
                    </button>
                    <button
                      id="copy-with-changes-${index}"
                      onclick="copyPromptWithChanges(${index})"
                      class="px-3 py-1 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors"
                    >
                      Copy with Changes
                    </button>
                  </div>
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
              
              <!-- File Changes -->
              ${item.fileDiffs.length > 0 ? `
                <div class="ml-4">
                  <h3 class="text-lg font-medium text-gray-300 mb-4">
                    Changed Files (${item.fileDiffs.length})
                  </h3>
                  <div class="space-y-4">
                    ${item.fileDiffs.map(file => {
                      const parsedLines = parseDiff(file.diff);
                      return `
                        <div class="file-change border border-gray-600 rounded-lg overflow-hidden">
                          <div class="file-path bg-gray-900 text-gray-200 px-4 py-2 text-sm font-mono">
                            ${escape(file.path)}
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
              ` : `
                <div class="ml-4 text-gray-400 italic">
                  No file changes for this prompt
                </div>
              `}
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="text-center text-gray-400 italic py-8">
          No prompts found
        </div>
      `}
    </div>
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
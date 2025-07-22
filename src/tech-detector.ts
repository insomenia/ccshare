import fs from 'fs/promises';
import path from 'path';

export interface TechStack {
  languages: string[];
  frameworks: string[];
  tools: string[];
  databases: string[];
}

export async function detectTechStack(projectPath: string): Promise<TechStack> {
  const techStack: TechStack = {
    languages: [],
    frameworks: [],
    tools: [],
    databases: []
  };

  // Check for various config files and detect tech stack
  const filesToCheck = [
    'package.json',
    'Gemfile',
    'requirements.txt',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'composer.json',
    '.gitignore',
    'Dockerfile',
    'docker-compose.yml'
  ];

  for (const file of filesToCheck) {
    try {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      detectFromFile(file, content, techStack);
    } catch {
      // File doesn't exist
    }
  }

  // Check file extensions in src or root directory
  try {
    const files = await fs.readdir(projectPath);
    await detectFromFileExtensions(files, techStack);
    
    // Also check src directory if exists
    try {
      const srcFiles = await fs.readdir(path.join(projectPath, 'src'));
      await detectFromFileExtensions(srcFiles, techStack);
    } catch {}
  } catch {}

  // Remove duplicates and return
  return {
    languages: [...new Set(techStack.languages)],
    frameworks: [...new Set(techStack.frameworks)],
    tools: [...new Set(techStack.tools)],
    databases: [...new Set(techStack.databases)]
  };
}

function detectFromFile(filename: string, content: string, techStack: TechStack) {
  switch (filename) {
    case 'package.json':
      techStack.languages.push('javascript', 'node');
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Frameworks
      if (deps.react) techStack.frameworks.push('react');
      if (deps.vue) techStack.frameworks.push('vue');
      if (deps.angular) techStack.frameworks.push('angular');
      if (deps.express) techStack.frameworks.push('express');
      if (deps.next) techStack.frameworks.push('nextjs');
      if (deps.gatsby) techStack.frameworks.push('gatsby');
      if (deps.svelte) techStack.frameworks.push('svelte');
      if (deps.nuxt) techStack.frameworks.push('nuxt');
      if (deps.nestjs || deps['@nestjs/core']) techStack.frameworks.push('nestjs');
      
      // Tools
      if (deps.typescript) techStack.languages.push('typescript');
      if (deps.webpack) techStack.tools.push('webpack');
      if (deps.vite) techStack.tools.push('vite');
      if (deps.jest) techStack.tools.push('jest');
      if (deps.mocha) techStack.tools.push('mocha');
      if (deps.eslint) techStack.tools.push('eslint');
      
      // Databases
      if (deps.mongodb || deps.mongoose) techStack.databases.push('mongodb');
      if (deps.mysql || deps.mysql2) techStack.databases.push('mysql');
      if (deps.pg || deps.postgres) techStack.databases.push('postgresql');
      if (deps.redis) techStack.databases.push('redis');
      if (deps.sqlite3) techStack.databases.push('sqlite');
      break;

    case 'Gemfile':
      techStack.languages.push('ruby');
      if (content.includes('rails')) techStack.frameworks.push('rails');
      if (content.includes('sinatra')) techStack.frameworks.push('sinatra');
      if (content.includes('rspec')) techStack.tools.push('rspec');
      if (content.includes('pg')) techStack.databases.push('postgresql');
      if (content.includes('mysql2')) techStack.databases.push('mysql');
      if (content.includes('redis')) techStack.databases.push('redis');
      break;

    case 'requirements.txt':
      techStack.languages.push('python');
      if (content.includes('django')) techStack.frameworks.push('django');
      if (content.includes('flask')) techStack.frameworks.push('flask');
      if (content.includes('fastapi')) techStack.frameworks.push('fastapi');
      if (content.includes('pytest')) techStack.tools.push('pytest');
      if (content.includes('numpy')) techStack.tools.push('numpy');
      if (content.includes('pandas')) techStack.tools.push('pandas');
      if (content.includes('tensorflow')) techStack.tools.push('tensorflow');
      if (content.includes('torch')) techStack.tools.push('pytorch');
      break;

    case 'Cargo.toml':
      techStack.languages.push('rust');
      if (content.includes('actix-web')) techStack.frameworks.push('actix');
      if (content.includes('rocket')) techStack.frameworks.push('rocket');
      if (content.includes('tokio')) techStack.tools.push('tokio');
      break;

    case 'go.mod':
      techStack.languages.push('go');
      if (content.includes('gin-gonic/gin')) techStack.frameworks.push('gin');
      if (content.includes('fiber')) techStack.frameworks.push('fiber');
      if (content.includes('echo')) techStack.frameworks.push('echo');
      break;

    case 'pom.xml':
      techStack.languages.push('java');
      if (content.includes('spring')) techStack.frameworks.push('spring');
      if (content.includes('junit')) techStack.tools.push('junit');
      break;

    case 'build.gradle':
      techStack.languages.push('java');
      if (content.includes('kotlin')) techStack.languages.push('kotlin');
      if (content.includes('spring')) techStack.frameworks.push('spring');
      break;

    case 'composer.json':
      techStack.languages.push('php');
      const composer = JSON.parse(content);
      const phpDeps = { ...composer.require, ...composer['require-dev'] || {} };
      if (phpDeps['laravel/framework']) techStack.frameworks.push('laravel');
      if (phpDeps['symfony/framework-bundle']) techStack.frameworks.push('symfony');
      break;

    case 'Dockerfile':
      techStack.tools.push('docker');
      break;

    case 'docker-compose.yml':
      techStack.tools.push('docker', 'docker-compose');
      if (content.includes('postgres')) techStack.databases.push('postgresql');
      if (content.includes('mysql')) techStack.databases.push('mysql');
      if (content.includes('mongo')) techStack.databases.push('mongodb');
      if (content.includes('redis')) techStack.databases.push('redis');
      break;
  }
}

async function detectFromFileExtensions(files: string[], techStack: TechStack) {
  const extensions = files.map(f => path.extname(f).toLowerCase());
  
  if (extensions.includes('.js') || extensions.includes('.jsx')) {
    techStack.languages.push('javascript');
  }
  if (extensions.includes('.ts') || extensions.includes('.tsx')) {
    techStack.languages.push('typescript');
  }
  if (extensions.includes('.py')) {
    techStack.languages.push('python');
  }
  if (extensions.includes('.rb')) {
    techStack.languages.push('ruby');
  }
  if (extensions.includes('.java')) {
    techStack.languages.push('java');
  }
  if (extensions.includes('.kt')) {
    techStack.languages.push('kotlin');
  }
  if (extensions.includes('.go')) {
    techStack.languages.push('go');
  }
  if (extensions.includes('.rs')) {
    techStack.languages.push('rust');
  }
  if (extensions.includes('.php')) {
    techStack.languages.push('php');
  }
  if (extensions.includes('.cs')) {
    techStack.languages.push('csharp');
  }
  if (extensions.includes('.swift')) {
    techStack.languages.push('swift');
  }
  if (extensions.includes('.cpp') || extensions.includes('.cc') || extensions.includes('.c')) {
    techStack.languages.push('c++');
  }
}
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const testDir = __dirname;
const thisFile = path.basename(__filename);

const runCommand = (label, command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  child.on('error', (error) => {
    reject(error);
  });
  child.on('close', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`${label} failed with code ${code}`));
  });
});

const listTestFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTestFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === thisFile) continue;
    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.mjs')) continue;
    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
};

const runValidation = async () => {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  console.log('=== ESLint ===');
  await runCommand('eslint', npxCmd, ['eslint', '.'], {
    cwd: rootDir,
    shell: process.platform === 'win32'
  });

  const testFiles = await listTestFiles(testDir);
  if (testFiles.length === 0) {
    console.log('No test files found.');
    return;
  }

  for (const file of testFiles) {
    console.log(`\n=== ${path.basename(file)} ===`);
    await runCommand(path.basename(file), process.execPath, [file], { cwd: rootDir });
  }

  console.log('\nAll validation steps passed.');
};

runValidation().catch((error) => {
  console.error(`\nValidation failed: ${error.message}`);
  process.exit(1);
});

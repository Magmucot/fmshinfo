import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT_DIR = process.cwd();

test('report-crash.py creates structured reports in reports.json with sanitized logs', () => {
  const testDir = join(tmpdir(), `sunc-test-watchdog-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });

  const logFile = join(testDir, 'bot.log');
  const dummyLog = [
    '[2026-10-03 09:40:01.100 NSK] [INFO] [BOT] Bot polling active',
    '\u001b[31m[2026-10-03 09:40:15.220 NSK] [FATAL] [PROCESS] Uncaught exception: Database connection reset by peer\u001b[0m',
    '    at async handleUpdate (index.ts:1520:12)',
    '    at async Bot.start (index.ts:3840:5)',
  ].join('\n');
  writeFileSync(logFile, dummyLog, 'utf-8');

  const reporterScript = join(ROOT_DIR, 'deploy/report-crash.py');
  const res = spawnSync('python3', [
    reporterScript,
    '--exit-code', '1',
    '--uptime', '125',
    '--log-file', logFile,
    '--data-dir', testDir,
  ], { encoding: 'utf-8' });

  assert.equal(res.status, 0, `report-crash.py failed with: ${res.stderr}`);

  const reportsFile = join(testDir, 'reports.json');
  assert.ok(existsSync(reportsFile), 'reports.json should be created');

  const content = JSON.parse(readFileSync(reportsFile, 'utf-8'));
  assert.ok(Array.isArray(content), 'reports.json should contain an array');
  assert.equal(content.length, 1, 'Should have exactly 1 report');

  const report = content[0];
  assert.ok(report.name.includes('Watchdog'), 'Report title should mention Watchdog');
  assert.ok(report.name.includes('код: 1'), 'Report title should contain exit code');
  assert.equal(report.contact, 'system@watchdog');
  assert.ok(report.message.includes('125с'), 'Report message should contain uptime');
  assert.ok(report.message.includes('Uncaught exception: Database connection reset by peer'), 'Report should include clean log message');
  assert.ok(!report.message.includes('\u001b[31m'), 'ANSI color codes must be stripped');
  assert.ok(report.formattedTime.includes('NSK'), 'Time should be formatted in Novosibirsk timezone');

  // Clean up
  rmSync(testDir, { recursive: true, force: true });
});

test('bot-watchdog.sh supervises process, auto-restarts on crash, and terminates on SIGTERM', async () => {
  const testDir = join(tmpdir(), `sunc-watchdog-loop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const stateDir = join(testDir, 'state');
  const dataDir = join(testDir, 'data');
  const logFile = join(stateDir, 'bot.log');
  const envFile = join(testDir, 'bot.env');

  mkdirSync(stateDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // Create a mock run-production script
  const mockRunProd = join(testDir, 'mock-run.sh');
  const counterFile = join(testDir, 'runs.txt');
  writeFileSync(counterFile, '0', 'utf-8');

  // Script that increments counter: runs 1st time and crashes (exit 1), runs 2nd time and sleeps
  writeFileSync(mockRunProd, `#!/usr/bin/env bash
count=$(cat "${counterFile}")
count=$(( count + 1 ))
echo "$count" > "${counterFile}"
echo "[$(date)] Mock bot run #$count started" >> "${logFile}"

if [[ "$count" -eq 1 ]]; then
  echo "[$(date)] Mock bot run #$count simulated crash!" >> "${logFile}"
  exit 1
fi

# 2nd run stays alive until killed
sleep 30
`, { mode: 0o755 });

  writeFileSync(envFile, `
PORTAL_API="internal"
BOT_DATA_DIR="${dataDir}"
TELEGRAM_BOT_TOKEN=""
`, 'utf-8');

  // Create isolated watchdog script pointing to mock worker
  const isolatedWatchdog = join(testDir, 'test-watchdog.sh');
  let watchdogContent = readFileSync(join(ROOT_DIR, 'deploy/bot-watchdog.sh'), 'utf-8');
  // replace run-production.sh with mockRunProd
  watchdogContent = watchdogContent.replace('"$ROOT_DIR/mini-services/tg-bot/run-production.sh"', `"${mockRunProd}"`);
  writeFileSync(isolatedWatchdog, watchdogContent, { mode: 0o755 });

  // Start the watchdog process
  const watchdogChild = spawn('bash', [isolatedWatchdog, ROOT_DIR, envFile, stateDir, logFile], {
    detached: false,
    stdio: 'ignore',
  });

  const watchdogPid = watchdogChild.pid;
  assert.ok(watchdogPid, 'Watchdog should have a valid PID');

  // Wait for watchdog to start worker, detect 1st crash, and restart 2nd worker
  let restarted = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const count = Number(readFileSync(counterFile, 'utf-8').trim());
      if (count >= 2) {
        restarted = true;
        break;
      }
    } catch {}
  }

  assert.ok(restarted, 'Watchdog should have auto-restarted worker after 1st crash');

  // Verify that reports.json was created with the crash report from run #1
  const reportsFile = join(dataDir, 'reports.json');
  assert.ok(existsSync(reportsFile), 'reports.json should be created after worker crash');
  const reports = JSON.parse(readFileSync(reportsFile, 'utf-8'));
  assert.ok(reports.length >= 1, 'Should have at least 1 crash report recorded');
  assert.ok(reports[0].message.includes('simulated crash'), 'Report message should capture the crash log');

  // Verify worker PID file exists and worker is running
  const workerPidFile = join(stateDir, 'bot-worker.pid');
  assert.ok(existsSync(workerPidFile), 'bot-worker.pid should exist while worker is running');
  const workerPid = Number(readFileSync(workerPidFile, 'utf-8').trim());
  assert.ok(workerPid > 0, 'Worker PID should be a valid positive integer');

  // Send SIGTERM to watchdog
  watchdogChild.kill('SIGTERM');

  // Wait for watchdog to terminate cleanly
  await new Promise((resolve) => {
    watchdogChild.on('close', resolve);
    setTimeout(resolve, 3000);
  });

  // Verify that worker was also terminated
  let workerAlive = false;
  try {
    process.kill(workerPid, 0);
    workerAlive = true;
  } catch {
    workerAlive = false;
  }
  assert.equal(workerAlive, false, 'Bot worker should be terminated when watchdog stops');

  // Clean up
  rmSync(testDir, { recursive: true, force: true });
});

test('start_nohup.sh wrapper forwards correctly and responds to status', () => {
  const rootWrapper = join(ROOT_DIR, 'start_nohup.sh');
  assert.ok(existsSync(rootWrapper), 'start_nohup.sh in root should exist');

  const res = spawnSync('bash', [rootWrapper, 'status'], { encoding: 'utf-8' });
  assert.equal(res.status, 0, `status check should exit 0: ${res.stderr}`);
  assert.ok(res.stdout.includes('bot:'), 'status output should mention bot');
  assert.ok(res.stdout.includes('portal:'), 'status output should mention portal');
});

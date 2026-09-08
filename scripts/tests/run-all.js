#!/usr/bin/env node
/**
 * Runs every suite in scripts/tests/ sequentially against a running server
 * and the local Docker Postgres, and prints a combined pass/fail total.
 *
 * Requires: a `next start` (or `next dev`) server already running, JWT_SECRET
 * in the environment, and the Docker Postgres reachable via DATABASE_URL.
 *
 * Usage:
 *   JWT_SECRET=... VERIFY_BASE_URL=http://localhost:3002 node scripts/tests/run-all.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUITES = [
  'verify-notifications',
  'verify-mentor-flows',
  'e2e-mentor-features',
  'e2e-mentor-stats',
  'e2e-delete-cleanup',
  'e2e-upload-paths',
  'e2e-member-add-window',
  'e2e-meeting-links',
  'e2e-disable-accounts',
  'e2e-event-reminder',
  'e2e-import',
  'e2e-notifications',
  'e2e-milestone',
  'e2e-milestone-submission',
  'e2e-phases',
  'e2e-pending-no-email',
  'e2e-phase1',
  'e2e-phase2',
  'e2e-phase3',
  'e2e-phase4',
  'e2e-att-1',
  'e2e-att-2',
  'e2e-golden-path',
  'e2e-admin-auth-fix',
  'e2e-passwordhash-leak',
  'e2e-login-errors',
  'e2e-auth-flows',
];

let totalPass = 0;
let totalFail = 0;
let anyFailed = false;

for (const suite of SUITES) {
  const file = path.join(__dirname, `${suite}.js`);
  if (!fs.existsSync(file)) {
    console.log(`  SKIP  ${suite} (file not found)`);
    continue;
  }

  process.stdout.write(`  ${suite.padEnd(24)} `);
  let output;
  let failed = false;
  try {
    output = execFileSync('node', [file], { env: process.env, encoding: 'utf8' });
  } catch (err) {
    output = (err.stdout || '') + (err.stderr || '');
    failed = true;
  }

  const match = output.match(/^(\d+) passed, (\d+) failed/m);
  if (match) {
    const [, pass, fail] = match;
    totalPass += Number(pass);
    totalFail += Number(fail);
    if (Number(fail) > 0) anyFailed = true;
    console.log(`${pass} passed, ${fail} failed`);
  } else {
    anyFailed = true;
    console.log('COULD NOT PARSE RESULT (see output below)');
    console.log(output);
  }
}

console.log('  ══════════════════════════════════');
console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed`);

process.exit(anyFailed || totalFail > 0 ? 1 : 0);

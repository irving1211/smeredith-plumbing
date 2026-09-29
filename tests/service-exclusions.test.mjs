import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceFiles = [
  new URL('../src/services.json', import.meta.url),
  new URL('../src/areas.json', import.meta.url),
];

test('does not advertise drain cleaning, unclogging, or drain-backup service', async () => {
  const marketingCopy = (
    await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))
  ).join('\n');

  const excludedClaims = [
    /drain cleaning/i,
    /sewer cleaning/i,
    /unclogg(?:ing|ed)?/i,
    /backed[- ]up drains?/i,
    /(?:emergency )?drain backup/i,
    /sewage backups?/i,
  ];

  for (const claim of excludedClaims) {
    assert.doesNotMatch(marketingCopy, claim);
  }
});

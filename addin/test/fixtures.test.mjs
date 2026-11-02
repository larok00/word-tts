/** Check the committed long DOCX with the generator's small OOXML assertions. */
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
test('long document has one page-15 marker and at least 25 explicit page breaks', async () => {
  await promisify(execFile)('python3', [
    new URL('../../testing/fixtures/make_sample_long.py', import.meta.url).pathname, '--check',
  ]);
});

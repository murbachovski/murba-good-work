// v0.1.5: `sed -i` operands — the BSD suffix word ('' / .bak) and the script are not files
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpProj, runHook, bash, sub, setState, isDeny } from './helpers.mjs';
import { sedFiles, tokenize } from '../scripts/lib/patterns.mjs';
import path from 'node:path';

test('v0.1.5: sedFiles picks only the edited files (GNU, BSD, -e, suffixes, --)', () => {
  const cases = [
    ["sed -i '' 's#tests/a.spec.js#e2e/AC-001.spec.js#' .murba/ac-test-map.md", ['.murba/ac-test-map.md']],
    ["sed -i 's/a/b/' f1 f2", ['f1', 'f2']],
    ["sed -i.bak 's/a/b/' f", ['f']],
    ["sed -i .bak 's/a/b/' f", ['f']],
    ["sed -i -e 's/a/b/' -e 's/c/d/' f", ['f']],
    ["sed -ni 's/a/b/p' f", ['f']],
    ["sed -i -- 's/a/b/' -f", ['-f']],
    ["sed --in-place=.b -E 's/a/b/' f", ['f']],
    ["sed -i '' -f fix.sed tests/a.test.js", ['tests/a.test.js']],
    ["sed -e 's/a/b/' -i .mocharc.yml", ['.mocharc.yml']],
    ["sed -Ei 's/a/b/' f", ['f']],
    ["sed -Ei '' 's/a/b/' f", ['f']],
    ["sed -es/a/b/ -i f", ['f']],
    ["sed -l 80 -i 's#tests/a.test.js#x#' src/a.js", ['src/a.js']],
    ["sed -i '' -l 's/a/b/' f", ['f']], // BSD -l takes no argument
    ["sed -i -l 's/a/b/' f", ['f']],
    ["sed -i '' -l 's/1/2/' f", ['f']], // a script with digits is still not the -l value
    ["sed -n -i '' f", ['f']], // GNU: '' is an empty script and -n empties f
    ["sed -s -n -i '' f x.txt", ['x.txt', 'f']],
    ["sed -i '' f", ['f']],
    ["sed --line-length 80 -i 's#tests/a.test.js#x#' src/a.js", ['src/a.js']],
    ["sed -i .gitignore -e 's/a/b/'", ['.gitignore']], // GNU permutes: -e later still makes .gitignore a file
    ["sed .gitignore -i -e 's/a/b/'", ['.gitignore']],
    ["sed -i tests/a.test.js -e s/a/b/", ['tests/a.test.js']],
    ["sed -I '' 's#tests/a.test.js#x#' src/a.js", ['src/a.js']],
    ["sed --expression=s/a/b/ -i f", ['f']],
    ["sed --expr 's/a/b/' --expr 's/c/d/' -i f", ['f']],
    ["sed --in-pl=.bak --fi fix.sed f", ['f']],
    ["sed -i~ '' f", ['f']], // attached suffix: '' is the (empty) script
  ];
  for (const [c, want] of cases) assert.deepEqual(sedFiles(tokenize(c)), want, c);
});

test('v0.1.5: main session BSD sed in test-write edits a non-test file even if the script names a test path; test targets still denied', () => {
  const p = tmpProj();
  setState(p, s => { s.phase = 'test-write'; s.approved = true; });
  assert.equal(isDeny(runHook('guard', bash(p, "sed -i '' 's#tests/kanban.spec.js#e2e/AC-xxx.spec.js#' .murba/ac-test-map.md"), p)), false, 'script is not a file');
  assert.ok(isDeny(runHook('guard', bash(p, "sed -i '' 's/a/b/' tests/a.test.js"), p)), 'BSD sed on a test file');
  assert.ok(isDeny(runHook('guard', bash(p, "sed -i 's/a/b/' tests/a.test.js"), p)), 'GNU sed on a test file');
  assert.ok(isDeny(runHook('guard', bash(p, "sed -i .bak -e 's/a/b/' tests/a.test.js"), p)), 'suffix + -e on a test file');
  setState(p, s => { s.phase = 'build'; });
  assert.ok(isDeny(runHook('guard', bash(p, "sed -i '' 's/x/y/' tests/a.test.js", sub('builder')), p)), 'builder BSD sed on a test file');
  assert.equal(isDeny(runHook('guard', bash(p, "sed -i '' 's#tests/a.test.js#x#' src/a.js", sub('builder')), p)), false, 'builder edits source; script mentions a test path');
});

test('v0.1.5 r1: guard denies every in-place form on protected files (GNU reordered options, combined flags, long options, -I, gsed)', () => {
  const p = tmpProj();
  setState(p, s => { s.phase = 'build'; s.approved = true; });
  for (const c of ["sed -e 's/a/b/' -i .mocharc.yml", "sed 's/a/b/' -i .mocharc.yml", "sed -f fix.sed -i .mocharc.yml", "sed -n -e 's/a/b/p' -i .mocharc.yml",
    "sed --in-place=.bak 's/a/b/' tests/a.test.js", "sed -i --expression=s/a/b/ tests/a.test.js", 'sed -i -es/a/b/ tests/a.test.js',
    "sed -Ei 's/a/b/' tests/a.test.js", "sed -n -i '' tests/a.test.js", "sed --quiet -i '' -- tests/a.test.js", "sed -ni '' .mocharc.yml", "sed --i 's/a/b/' tests/a.test.js", "sed -i '' -l 's/1/2/' tests/a.test.js", "sed -i '' -l 's/a/b/' tests/a.test.js", "sed -i -l 's/a/b/' tests/a.test.js", "sed -i tests/a.test.js -e s/a/b/",
    "sed -i -f fix.sed .mocharc.yml", "sed -i --file=fix.sed tests/a.test.js", "sed --fi=fix.sed -i tests/a.test.js", "sed -i .mocharc.yml -e s/a/b/", "sed --in-pl 's/a/b/' tests/a.test.js", "sed --expr 's/a/b/' -i tests/a.test.js", "sed -ni 's/a/b/p' tests/a.test.js", "sed -I '' 's/a/b/' tests/a.test.js", "gsed -i 's/a/b/' tests/a.test.js"])
    assert.ok(isDeny(runHook('guard', bash(p, c, sub('builder')), p)), `builder: ${c}`);
  const q = tmpProj();
  setState(q, s => { s.phase = 'grill'; s.approved = false; s.task_type = 'feature'; });
  for (const c of ["sed -e 's/a/b/' -i .gitignore", "sed 's/x/y/' -i .eslintrc.json", "sed -i .gitignore -e 's/a/b/'", "sed .gitignore -i -e 's/a/b/'", "sed -i .eslintrc.json -f fix.sed", "sed -i -l 's/a/b/' .gitignore", "sed -n -i '' .gitignore"]) assert.ok(isDeny(runHook('guard', bash(q, c), q)), `pre-approval: ${c}`);
  setState(p, s => { s.phase = 'test-write'; });
  assert.ok(isDeny(runHook('guard', bash(p, "cd tests && sed -e 's/a/b/' -i .setup.js"), p)), 'main test-write: dot file in tests/');
  assert.equal(isDeny(runHook('guard', bash(p, "sed -l 80 -i 's#tests/a.test.js#x#' src/a.js"), p)), false, '-l N value is not the script');
});

import {readFile, realpath, writeFile, mkdir} from 'node:fs/promises';
import {resolve, relative, isAbsolute, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import catalogue from '../../src/catalogue.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requiredArtifacts = ['still.webp', 'video.mp4', 'animation.webp', 'animation.gif', 'motion.glb'];
const requiredReviews = ['identity', 'anatomy', 'contact', 'equipment', 'loop', 'framing'];

async function fileInside(root, name) {
  if (typeof name !== 'string' || isAbsolute(name)) throw new Error('Evidence path must be relative');
  const base = await realpath(root);
  const path = await realpath(resolve(base, name));
  const delta = relative(base, path);
  if (delta.startsWith('..') || isAbsolute(delta)) throw new Error('Evidence path escapes task root');
  return readFile(path);
}

// No inferred approval: each ID needs a final render and hash-bound review.
export async function checkCoverage({root, catalogue: expected, coverage}) {
  const issues = [];
  const expectedIds = new Set(expected.map(e => String(e.id)));
  const actualIds = new Set();
  let approved = 0;
  for (const row of coverage) {
    const id = String(row.id);
    if (actualIds.has(id)) issues.push({id, reason:'duplicate-id'});
    actualIds.add(id);
    if (!expectedIds.has(id)) { issues.push({id, reason:'unexpected-id'}); continue; }
    if (row.stillStatus !== 'approved' || row.motionStatus !== 'approved') {
      issues.push({id, reason:'not-approved'}); continue;
    }
    try {
      const review = JSON.parse(await fileInside(root, row.reviewFile));
      if (review.exerciseId !== id || !review.notes?.trim()) throw new Error('Review identity or notes missing');
      if (!requiredReviews.every(key => review.checks?.[key] === 'passed')) throw new Error('Review checks incomplete');
      const renderBytes = await fileInside(root, row.renderFile);
      if (digest(renderBytes) !== review.renderSha256) throw new Error('Reviewed render changed');
      const render = JSON.parse(renderBytes);
      if (render.quality !== 'final' || render.inputsUnchanged !== true) throw new Error('Final stable render required');
      if (render.exercise !== row.replacementAsset || !render.recipeSha256 || !render.inputs) throw new Error('Recipe binding missing');
      const recipeFile = `media/recipes/${render.exercise}.json`;
      const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
      if (digest(await fileInside(app, recipeFile)) !== render.recipeSha256) throw new Error('Exercise recipe changed');
      const source = JSON.parse(await readFile(resolve(app, 'media/sources.json'))).motions.find(m => m.id === render.exercise);
      if (!source || !['CC0-1.0','AGPL-3.0-only'].includes(source.license)) throw new Error('Unapproved motion source');
      const folder = dirname(row.renderFile);
      for (const name of requiredArtifacts) {
        const artifact = render.artifacts?.[name];
        const data = await fileInside(root, `${folder}/${name}`);
        if (!artifact || data.byteLength !== artifact.bytes || digest(data) !== artifact.sha256) throw new Error(`Changed or missing ${name}`);
      }
      approved++;
    } catch (error) { issues.push({id, reason:String(error.message)}); }
  }
  for (const id of expectedIds) if (!actualIds.has(id)) issues.push({id, reason:'missing-id'});
  return {target:expectedIds.size, records:coverage.length, approved,
    remaining:expectedIds.size-approved, releaseAllowed:issues.length === 0 && approved === expectedIds.size,
    policy:'all-at-once', issues};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootAt = args.indexOf('--root');
  if (rootAt < 0 || !args[rootAt+1]) throw new Error('Pass --root TASK_ROOT explicitly');
  const root = resolve(args[rootAt+1]);
  if (catalogue.length !== 5632) throw new Error('Full catalogue must contain 5,632 exercises');
  const coverage = JSON.parse(await readFile(resolve(root,'analysis/media-rebuild/coverage.json')));
  const report = await checkCoverage({root,catalogue,coverage});
  await mkdir(resolve(root,'reports/media'),{recursive:true});
  await writeFile(resolve(root,'reports/media/coverage-gate.json'),JSON.stringify(report,null,2)+'\n');
  const {issues,...summary} = report;
  console.log(JSON.stringify({...summary,issueExamples:issues.slice(0,8)},null,2));
  process.exitCode = report.releaseAllowed ? 0 : 1;
}

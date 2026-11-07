import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { verificationContext } from './lib/verification.mjs';

// 대상 커밋을 반드시 받아 과거에 성공한 게시를 이번 결과로 오인하지 않습니다.
const sha = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('확인할 커밋의 전체 SHA를 지정해 주세요.');
const project = await verificationContext('publication', { publicSite: true });
const settings = project.tooling.publication;
const api = 'https://api.github.com/repos/' + settings.repository;
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': project.site.site.name + '-publication-check' };
const deadline = Date.now() + settings.timeoutMilliseconds;
let previous, completed = false;
while (Date.now() < deadline) {
  const response = await fetch(api + '/actions/runs?per_page=10', { headers });
  if (!response.ok) throw new Error('Actions status: ' + response.status);
  const runs = (await response.json()).workflow_runs;
  const run = runs.find(run => run.head_sha === sha && run.name === settings.workflowName);
  const state = run ? run.status + '/' + (run.conclusion || 'pending') : 'Waiting for Pages workflow';
  if (state !== previous) console.log(state, run?.html_url || '');
  previous = state;
  if (run?.status === 'completed') {
    if (run.conclusion !== 'success') throw new Error('Pages deployment ' + run.conclusion + ': ' + run.html_url);
    const receipt = { checkedAt: new Date().toISOString(), commit: sha, runId: run.id, runUrl: run.html_url, conclusion: run.conclusion };
    await writeFile(path.join(project.output, sha + '.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt)); completed = true; break;
  }
  await new Promise(resolve => setTimeout(resolve, settings.pollMilliseconds));
}
if (!completed) throw new Error('Timed out waiting for Pages deployment');

import path from 'node:path';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadProject } from './lib/configuration.mjs';
import { buildSite, outputPath } from './lib/site-builder.mjs';

/**
 * 생성물과 편집 가능한 원본을 게시 준비 폴더에 모읍니다. 네트워크 쓰기는 하지 않습니다.
 * 날짜별 파일 목록이나 소스 문자열 치환 대신 설정과 생성 목록을 사용합니다.
 * 원격 저장소는 정적 파일을 루트에 두므로 output 설정만 게시용 값으로 바꿉니다.
 */
const project = await loadProject();
const manifest = await buildSite(project, { check: true });
const staging = outputPath(project.root, project.tooling.paths.staging);
const files = new Map();
for (const filename of manifest.files) files.set(filename, await readFile(outputPath(project.resolve(project.tooling.paths.output), filename)));
async function collect(relative) {
  const filename = project.resolve(relative);
  const entries = await readdir(filename, { withFileTypes: true }).catch(error => error.code === 'ENOTDIR' ? null : Promise.reject(error));
  if (!entries) { files.set(relative.replaceAll('\\', '/'), await readFile(filename)); return; }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('게시 원본에 심볼릭 링크가 있습니다: ' + entry.name);
    await collect(path.posix.join(relative, entry.name));
  }
}
for (const filename of project.tooling.publication.sources) await collect(filename);
const remoteConfig = structuredClone(project.tooling);
remoteConfig.paths.output = project.tooling.publication.output;
files.set('project.config.json', Buffer.from(JSON.stringify(remoteConfig, null, 2) + '\n'));
files.set(project.tooling.build.manifestFile, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
const packet = [];
for (const [filename, bytes] of files) {
  const destination = outputPath(staging, filename);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  // Git blob 해시로 기존 이미지와 같은 내용인지 판별해 불필요한 재업로드를 피합니다.
  packet.push({ path: filename, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    gitBlob: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') });
}
await writeFile(path.join(staging, 'publication-packet.json'), JSON.stringify({ files: packet,
  remove: project.tooling.publication.remove }, null, 2) + '\n');
console.log(JSON.stringify({ staging, files: packet.length, remove: project.tooling.publication.remove }));

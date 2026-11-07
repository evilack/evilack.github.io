import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { loadProject, projectDate } from './configuration.mjs';

/**
 * 검증 도구는 같은 설정과 날짜 규칙을 사용합니다.
 * EV_CABINET_VERIFY_ORIGIN으로 공개 주소를 검사할 때도 파일 경로나 서버 포트를 고치지 않습니다.
 */
export async function verificationContext(name, { publicSite = false } = {}) {
  const project = await loadProject();
  const preview = project.tooling.preview;
  const localOrigin = `http://${preview.host}:${process.env.EV_CABINET_PREVIEW_PORT || preview.port}/`;
  const origin = new URL(process.env.EV_CABINET_VERIFY_ORIGIN || (publicSite ? project.site.site.origin : localOrigin)).href;
  const destination = origin === localOrigin ? 'local' : 'public';
  const output = path.join(project.resolve(project.tooling.paths.evidence), name + '-' + projectDate(project), destination);
  await mkdir(output, { recursive: true });
  return { ...project, origin, output };
}

import { loadProject } from './lib/configuration.mjs';
import { createStaticServer } from './lib/static-server.mjs';

const project = await loadProject();
const server = createStaticServer({ root: project.resolve(project.tooling.paths.output),
  host: project.tooling.preview.host,
  port: Number(process.env.EV_CABINET_PREVIEW_PORT || project.tooling.preview.port) });
// 포트 충돌을 숨기거나 다른 프로그램을 종료하지 않고 오류를 그대로 알립니다.
console.log(project.site.site.name + ' preview: ' + await server.start());

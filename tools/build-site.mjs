import { loadProject } from './lib/configuration.mjs';
import { buildSite } from './lib/site-builder.mjs';

// 명령 진입점은 인자 해석과 결과 안내만 합니다. 생성 규칙과 데이터 처리는 라이브러리가 담당합니다.
const manifest = await buildSite(await loadProject(), { check: process.argv.includes('--check') });
console.log(`${process.argv.includes('--check') ? '확인' : '생성'} 완료: ${manifest.files.length}개 파일`);

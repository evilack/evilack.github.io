import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 모든 Node 도구의 설정 진입점입니다. 실행한 터미널의 현재 폴더에 의존하지 않습니다.
 * 파일 경로와 개발 서버 값은 project.config.json, 사이트의 공개 정보는 site.json이 소유합니다.
 * 원격 게시본은 output 경로만 저장소 루트로 바꾸므로 소스 코드를 문자열 치환할 필요가 없습니다.
 */
export async function loadProject(configurationUrl = new URL('../../project.config.json', import.meta.url)) {
  const root = fileURLToPath(new URL('./', configurationUrl));
  const tooling = JSON.parse(await readFile(configurationUrl, 'utf8'));
  const resolve = relative => path.resolve(root, relative);
  const site = JSON.parse(await readFile(resolve(tooling.paths.site), 'utf8'));
  const locales = Object.fromEntries(await Promise.all(site.localization.languages.map(async language => [
    language.code, JSON.parse(await readFile(path.join(resolve(tooling.paths.locales), language.code + '.json'), 'utf8')),
  ])));
  validateSite(site, locales);
  return { root, tooling, site, locales, resolve };
}

/** 사용자 설정의 오타가 실제 결제 주소나 페이지를 망가뜨리기 전에 빌드를 중단합니다. */
export function validateSite(site, locales) {
  const require = (condition, message) => { if (!condition) throw new Error('설정 오류: ' + message); };
  const languages = site.localization.languages.map(language => language.code);
  require(languages.every(code => /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(code)), '언어 코드는 안전한 언어 태그여야 합니다.');
  require(new Set(languages.map(code => code.toLowerCase())).size === languages.length, '언어 코드가 중복되었습니다.');
  require(languages.includes(site.localization.default), '기본 언어가 지원 언어 목록에 없습니다.');
  const files = new Set();
  for (const [family, page] of Object.entries(site.pages)) {
    for (const language of languages) {
      require(typeof page.routes[language] === 'string', `${family}/${language} 경로가 없습니다.`);
      require(locales[language]?.[family], `${family}/${language} 번역이 없습니다.`);
    }
    for (const filename of [...Object.values(page.routes), ...Object.keys(page.aliases)]) {
      require(/^[\w-]+\.html$/.test(filename), '페이지 경로는 하위 폴더나 외부 URL이 아닌 HTML 파일명이어야 합니다.');
      require(!files.has(filename), '페이지 경로가 중복되었습니다: ' + filename);
      files.add(filename);
    }
    for (const code of Object.values(page.aliases)) require(languages.includes(code), '호환 페이지의 언어가 잘못되었습니다.');
  }
  const ids = new Set();
  // 정적 호스팅의 루트 진입점은 index.html입니다. 이름을 바꿀 때는 이 호환 주소를 남겨야 합니다.
  require([...Object.values(site.pages.home.routes), ...Object.keys(site.pages.home.aliases)].includes('index.html'),
    '홈페이지에는 정적 호스팅의 루트 진입점 index.html이 필요합니다. 경로를 바꿀 때 호환 주소로 유지해 주세요.');
  const documentIds = [...Object.values(site.anchors), ...Object.entries(site.dom)
    .filter(([key]) => key.endsWith('Id')).map(([, value]) => value)];
  require(documentIds.every(id => /^[A-Za-z][\w-]*$/.test(id)) && new Set(documentIds).size === documentIds.length,
    '문서 ID는 공백 없는 고유 식별자여야 합니다.');
  for (const project of site.support.projects) {
    require(/^[a-z][a-z0-9-]*$/.test(project.id) && !ids.has(project.id), '프로젝트 식별자가 잘못되었거나 중복되었습니다.');
    ids.add(project.id);
    for (const code of languages) require(project.name || project.labels?.[code], `${project.id}/${code} 표시 이름이 없습니다.`);
    const destination = new URL(project.payment.url);
    require(destination.protocol === 'https:' && destination.origin === site.support.paymentOrigin,
      '결제 링크는 설정된 HTTPS 결제 제공자만 허용합니다: ' + project.id);
    require(project.payment.itemName, '결제 항목명이 없습니다: ' + project.id);
  }
  require(ids.has(site.support.defaultProject), '기본 후원 프로젝트가 없습니다.');
  require(ids.has(site.featured.project), '홈페이지 대표 프로젝트가 카탈로그에 없습니다.');
  for (const code of languages) {
    require(locales[code]?.ui, '공통 UI 번역이 없습니다: ' + code);
    require(site.site.author[code], '개발자 이름 번역이 없습니다: ' + code);
    for (const item of site.navigation) {
      require(locales[code].ui.nav[item.label], '메뉴 번역이 없습니다: ' + item.label);
      require(item.page ? site.pages[item.page] : site.site.links[item.link], '메뉴 목적지가 없습니다: ' + item.label);
      require(!item.anchor || site.anchors[item.anchor], '메뉴의 섹션 앵커가 없습니다: ' + item.label);
    }
  }
}

/** 기준 날짜는 호스트의 시간대가 아니라 프로젝트에 지정한 사용자 시간대를 따릅니다. */
export function projectDate(project) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: project.tooling.publication.timezone }).format(new Date());
}

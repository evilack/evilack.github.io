/** 텍스트와 속성에 공통으로 사용하는 HTML 이스케이프입니다. JSON 문구도 기본적으로 신뢰하지 않습니다. */
export function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/**
 * 템플릿의 {{경로}}는 항상 이스케이프합니다.
 * {{{경로}}}는 이 파일의 안전한 렌더러가 만든 조각에만 사용합니다.
 * 누락된 값을 빈 문자열로 숨기지 않아 번역이나 설정 누락을 빌드에서 발견할 수 있습니다.
 */
export function renderTemplate(template, values) {
  return template.replace(/\{\{\{([\w.]+)\}\}\}|\{\{([\w.]+)\}\}/g, (_, raw, escaped) => {
    const key = raw || escaped;
    const value = key.split('.').reduce((value, segment) => value && Object.hasOwn(value, segment) ? value[segment] : undefined, values);
    if (value === undefined || value === null) throw new Error('템플릿 값 누락: ' + key);
    return raw ? String(value) : escapeHtml(value);
  });
}

/** 번역의 {brand} 같은 명명된 자리표시자도 누락을 검사합니다. 배열/객체 구조는 유지합니다. */
export function localize(value, variables) {
  if (typeof value === 'string') return value.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in variables)) throw new Error('번역 자리표시자 누락: ' + key);
    return variables[key];
  });
  if (Array.isArray(value)) return value.map(item => localize(item, variables));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localize(item, variables)]));
  return value;
}

/**
 * 원본 번역에 있는 줄바꿈/강조/PayPal 워드마크만 허용합니다.
 * 다른 HTML은 실행하지 않고 글자로 출력하므로 번역 파일에 스크립트나 이벤트를 넣을 수 없습니다.
 */
export function inlineMarkup(value) {
  const allowed = new Set(['<br>', '<em>', '</em>', '<span class="paypal-word">', '<span aria-hidden="true">', '</span>']);
  return String(value).split(/(<[^>]*>)/g).map(part => allowed.has(part) ? part : escapeHtml(part)).join('');
}

/** 페이지 경로를 만드는 유일한 함수입니다. 템플릿과 메뉴가 같은 라우트 데이터를 사용합니다. */
export function pageUrl(site, family, language, fragment) {
  const url = './' + site.pages[family].routes[language];
  return fragment ? url + '#' + fragment : url;
}

export function projectLabel(project, language, variables) {
  return localize(project.name || project.labels[language], variables);
}

export function renderHeader(site, language, family, text) {
  const link = item => {
    const fragment = item.anchor ? site.anchors[item.anchor] : undefined;
    const href = item.page ? pageUrl(site, item.page, language, fragment) : site.site.links[item.link];
    const current = item.page === family && !fragment;
    return `<a${current ? ' aria-current="page"' : ''}${item.className ? ' class="' + escapeHtml(item.className) + '"' : ''} href="${escapeHtml(href)}">${escapeHtml(text.nav[item.label])}</a>`;
  };
  const alternatives = site.localization.languages.filter(item => item.code !== language).map(item =>
    `<a class="${escapeHtml(site.dom.languageLinkClass)}" href="${escapeHtml(pageUrl(site, family, item.code) + '?' + site.localization.query + '=' + item.code)}" lang="${escapeHtml(item.code)}" hreflang="${escapeHtml(item.code)}">${escapeHtml(item.name)}</a>`);
  return `<header class="site-header">
    <a class="brand" href="${escapeHtml(pageUrl(site, 'home', language))}" aria-label="${escapeHtml(text.homeLabel)}"><span class="brand-mark" aria-hidden="true">${escapeHtml(site.site.mark)}</span><span>${escapeHtml(site.site.name)}</span></a>
    <nav aria-label="${escapeHtml(text.navLabel)}">${[...site.navigation.map(link), ...alternatives].join('\n      ')}</nav>
  </header>`;
}

/** DOM 식별자도 설정에서 생성해 템플릿과 브라우저가 서로 다른 이름을 갖지 않게 합니다. */
export function renderProjectPicker(site, language, text, variables) {
  const dom = site.dom;
  const projects = site.support.projects;
  const defaultProject = projects.find(project => project.id === site.support.defaultProject);
  const options = projects.map(project => {
    const id = dom.radioIdPrefix + project.id;
    return `<label class="project-option" for="${escapeHtml(id)}"><input type="radio" id="${escapeHtml(id)}" name="${escapeHtml(dom.radioName)}" value="${escapeHtml(project.id)}"${project === defaultProject ? ' checked' : ''}><span>${escapeHtml(projectLabel(project, language, variables))}</span></label>`;
  });
  const fallback = projects.map(project => `<a href="${escapeHtml(project.payment.url)}" data-direct-project="${escapeHtml(project.id)}">${escapeHtml(projectLabel(project, language, variables))} <span aria-hidden="true">↗</span></a>`);
  return `<p class="project-choice-note" id="${escapeHtml(dom.choiceNoteId)}">${escapeHtml(text.note)}</p>
        <fieldset class="project-picker" id="${escapeHtml(dom.pickerId)}" aria-describedby="${escapeHtml(dom.choiceNoteId)}" hidden><legend>${escapeHtml(text.legend)}</legend><div class="project-options">${options.join('\n')}</div></fieldset>
        <div class="project-fallback-links" id="${escapeHtml(dom.fallbackId)}"><p>${escapeHtml(text.fallback)}</p>${fallback.join('\n')}</div>
        <p class="project-selection-summary" id="${escapeHtml(dom.summaryId)}">${escapeHtml(text.summaryPrefix + projectLabel(defaultProject, language, variables))}</p>
        <p class="project-funding-note">${escapeHtml(text.funding)}</p>`;
}

export function renderFooter(site, language, family, text) {
  const copyright = `© ${site.site.copyrightYear} ${site.site.name}`;
  if (family === 'home') return `<footer><span>${escapeHtml(copyright)}</span><span>${escapeHtml(text.location)}</span><a href="${escapeHtml(pageUrl(site, 'support', language))}">${escapeHtml(text.support)}</a></footer>`;
  return `<footer><a href="${escapeHtml(pageUrl(site, 'home', language))}">${escapeHtml(site.site.mark)} &nbsp; ${escapeHtml(site.site.name)} <span aria-hidden="true">↗</span></a><span>${escapeHtml(copyright + ' · ' + text.thanks)}</span><a href="${escapeHtml(pageUrl(site, 'home', language))}">${escapeHtml(text.home)}</a></footer>`;
}

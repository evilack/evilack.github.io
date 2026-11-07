/**
 * 언어 선택 규칙만 담당합니다. DOM, localStorage, 화면 이동을 직접 다루지 않습니다.
 * 이렇게 분리하면 브라우저 없이 규칙을 검증할 수 있고, 언어나 파일명을 추가할 때
 * 이 코드를 수정하지 않고 설정 데이터만 바꿀 수 있습니다.
 */
export class LanguagePolicy {
  #settings;
  #pages;
  #supported;

  constructor(settings, pages) {
    this.#settings = settings;
    this.#pages = pages;
    // 비교는 대소문자를 무시하되 결과는 설정의 표기(pt-BR 등)를 유지합니다.
    this.#supported = new Map(settings.languages.map(language => [language.code.toLowerCase(), language.code]));
  }

  /** URL과 저장값은 언어 코드여야 합니다. 지역 코드 처리는 브라우저 선호에만 적용합니다. */
  normalize(value) {
    if (typeof value !== 'string') return null;
    const code = value.toLowerCase();
    return this.#supported.get(code) || null;
  }

  explicit(url) {
    return this.normalize(new URL(url).searchParams.get(this.#settings.query));
  }

  /** 명시 URL → 저장된 수동 선택 → 브라우저의 첫 지원 언어 → 설정의 기본 언어 순서입니다. */
  select({ url, saved, languages = [] }) {
    const chosen = this.explicit(url) || this.normalize(saved);
    if (chosen) return chosen;
    for (const locale of languages) {
      if (typeof locale !== 'string') continue;
      const supported = this.normalize(locale) || this.normalize(locale.split('-')[0]);
      if (supported) return supported;
    }
    return this.#settings.default;
  }

  /** null이면 현재 페이지를 유지합니다. 이동할 때는 외부에서 받은 query/hash도 보존합니다. */
  destination({ url, family, currentLanguage, ...preferences }) {
    const routes = this.#pages[family]?.routes;
    if (!routes) return null;
    const language = this.select({ url, ...preferences });
    if (language === currentLanguage) return null;
    const source = new URL(url);
    const destination = new URL(routes[language], source);
    destination.search = source.search;
    destination.hash = source.hash;
    return destination.href;
  }

  /** 내부 이동에만 언어를 전달하기 위한 허용 목록입니다. 호환 주소도 설정에서 가져옵니다. */
  pageFiles() {
    return new Set(Object.values(this.#pages).flatMap(page => [
      ...Object.values(page.routes), ...Object.keys(page.aliases),
    ]));
  }
}

/**
 * 프로젝트 조회와 선택 우선순위를 캡슐화합니다.
 * URL의 project 값은 식별자로만 사용하며 결제 주소로 사용하지 않습니다.
 * 실제 목적지는 검증된 설정 카탈로그에서만 꺼내므로 임의 사이트로 결제를 유도할 수 없습니다.
 */
export class ProjectPolicy {
  #settings;
  #projects;

  constructor(settings) {
    this.#settings = settings;
    this.#projects = new Map(settings.projects.map(project => [project.id, project]));
  }

  normalize(value) {
    if (typeof value !== 'string') return null;
    const id = value.toLowerCase();
    return this.#projects.has(id) ? id : null;
  }

  explicit(url) {
    return this.normalize(new URL(url).searchParams.get(this.#settings.query));
  }

  get(value) {
    return this.#projects.get(this.normalize(value) || this.#settings.defaultProject);
  }

  select({ url, saved }) {
    return this.explicit(url) || this.normalize(saved) || this.#settings.defaultProject;
  }
}

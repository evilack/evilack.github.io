import { LanguagePolicy } from './policies.js';

/**
 * LanguagePolicy의 결정을 브라우저에 적용하는 어댑터입니다.
 * 첫 실행은 head에서 동기적으로 수행해 다른 언어가 잠깐 보이는 현상을 방지합니다.
 * 링크 처리는 DOM이 준비된 뒤에만 수행하며, 같은 링크를 매번 검색하지 않습니다.
 */
export class LocaleController {
  #config;
  #browser;
  #store;
  #policy;
  #pendingDestination = null;

  constructor(config, browser, store) {
    this.#config = config;
    this.#browser = browser;
    this.#store = store;
    this.#policy = new LanguagePolicy(config.localization, config.pages);
  }

  #browserLanguages() {
    try {
      const navigator = this.#browser.navigator;
      return Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages : [navigator.language];
    } catch { return []; }
  }

  /** BFCache 복원에서는 스크립트가 다시 실행되지 않으므로 pageshow에서도 다시 판단합니다. */
  apply() {
    const { location, document } = this.#browser;
    const explicit = this.#policy.explicit(location.href);
    if (explicit) this.#store.write(this.#config.localization.storage, explicit);
    const destination = this.#policy.destination({
      url: location.href,
      family: document.documentElement.dataset.page,
      currentLanguage: document.documentElement.lang,
      saved: this.#store.read(this.#config.localization.storage),
      languages: this.#browserLanguages(),
    });
    if (!destination) { this.#pendingDestination = null; return false; }
    // 초기 로드와 pageshow가 가까이 발생해도 동일 주소로 중복 이동하지 않습니다.
    if (destination !== this.#pendingDestination) {
      this.#pendingDestination = destination;
      location.replace(destination);
    }
    return true;
  }

  start() {
    const redirected = this.apply();
    this.#browser.addEventListener('languagechange', () => this.apply());
    this.#browser.addEventListener('pageshow', () => this.apply());
    return redirected;
  }

  connectLinks() {
    const { document, location } = this.#browser;
    const languageClass = this.#config.dom.languageLinkClass;
    const languageLinks = [...document.getElementsByClassName(languageClass)];
    for (const link of languageLinks) {
      link.addEventListener('click', () => {
        const language = this.#policy.normalize(link.hreflang);
        if (language) this.#store.write(this.#config.localization.storage, language);
      });
    }
    const explicit = this.#policy.explicit(location.href);
    if (!explicit) return;
    const localPages = this.#policy.pageFiles();
    for (const link of document.querySelectorAll('a[href]')) {
      if (link.getAttribute('href').startsWith('#') || link.classList.contains(languageClass)) continue;
      const destination = new URL(link.href);
      if (destination.origin !== location.origin || !localPages.has(destination.pathname.split('/').pop())) continue;
      // 저장소를 쓸 수 없어도 사용자가 명시한 언어는 다음 내부 페이지에 전달합니다.
      destination.searchParams.set(this.#config.localization.query, explicit);
      link.href = destination.href;
    }
  }
}

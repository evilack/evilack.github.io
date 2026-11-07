import { ProjectPolicy } from './policies.js';

/**
 * 후원 화면의 상태와 DOM 참조를 한 인스턴스 안에 보관합니다.
 * 카탈로그, 문구, 저장 키, DOM 연결 이름은 모두 생성된 설정으로 전달받습니다.
 * 전체/특정 프로그램을 따로 분기하지 않아 새 프로젝트도 데이터 추가만으로 동작합니다.
 */
export class SupportController {
  #config;
  #browser;
  #store;
  #policy;
  #elements;

  constructor(config, browser, store) {
    this.#config = config;
    this.#browser = browser;
    this.#store = store;
    this.#policy = new ProjectPolicy(config.support);
  }

  connect() {
    const document = this.#browser.document;
    const dom = this.#config.dom;
    const picker = document.getElementById(dom.pickerId);
    if (!picker) return; // 홈페이지에는 후원 선택 폼이 없으므로 연결할 작업이 없습니다.
    const payment = document.getElementById(dom.paymentId);
    const summary = document.getElementById(dom.summaryId);
    const fallback = document.getElementById(dom.fallbackId);
    if (!payment || !summary || !fallback) throw new Error('후원 화면의 필수 요소가 누락되었습니다. 생성 결과를 확인해 주세요.');
    this.#elements = {
      picker, payment, summary, fallback,
      radios: [...picker.querySelectorAll('input')].filter(input => input.name === dom.radioName),
      languageLinks: [...document.getElementsByClassName(dom.languageLinkClass)],
    };
    this.restore();
    picker.addEventListener('change', event => {
      if (event.target instanceof this.#browser.HTMLInputElement && event.target.name === dom.radioName) {
        this.#apply(event.target.value, true);
      }
    });
    this.#browser.addEventListener('pageshow', () => this.restore());
    // 정상 연결을 확인한 뒤에만 개선된 폼을 노출합니다. 실패 시 직접 결제 링크가 남습니다.
    picker.hidden = false;
    fallback.hidden = true;
  }

  restore() {
    const url = this.#browser.location.href;
    const saved = this.#store.read(this.#config.support.storage);
    this.#apply(this.#policy.select({ url, saved }));
    const explicit = this.#policy.explicit(url);
    if (explicit) this.#store.write(this.#config.support.storage, explicit);
  }

  #apply(id, remember = false) {
    const project = this.#policy.get(id);
    const { radios, payment, summary, languageLinks } = this.#elements;
    for (const radio of radios) radio.checked = radio.value === project.id;
    payment.href = project.payment.url;
    summary.textContent = this.#config.messages.projectSummaryPrefix + project.label;
    for (const link of languageLinks) {
      const url = new URL(link.href);
      url.searchParams.set(this.#config.support.query, project.id);
      link.href = url.href;
    }
    if (!remember) return;
    this.#store.write(this.#config.support.storage, project.id);
    const url = new URL(this.#browser.location.href);
    url.searchParams.set(this.#config.support.query, project.id);
    // 선택마다 뒤로 가기 항목을 늘리지 않고 현재 페이지의 선택만 갱신합니다.
    this.#browser.history.replaceState(this.#browser.history.state, '', url);
  }
}

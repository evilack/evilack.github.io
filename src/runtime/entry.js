import { PreferenceStore } from './preferences.js';
import { LocaleController } from './locale-controller.js';

/**
 * 브라우저 진입점입니다. 작은 IIFE 번들로 생성되므로 전역 변수나 프레임워크가 필요 없습니다.
 * 설정 JSON은 HTML에 함께 들어 있어 추가 fetch 없이 첫 화면의 언어를 결정할 수 있습니다.
 * 사용자 화면과 결제 링크는 이미 HTML에 있으므로 스크립트가 없어도 기본 기능이 작동합니다.
 */
export function startPage(connectPage = () => {}) {
  const script = document.currentScript;
  const settingsElement = document.getElementById(script.dataset.siteSettings);
  const config = JSON.parse(settingsElement.textContent);
  const store = new PreferenceStore(() => window.localStorage);
  const locale = new LocaleController(config, window, store);
  if (!locale.start()) {
    const connect = () => {
      locale.connectLinks();
      connectPage(config, window, store);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect, { once: true });
    else connect();
  }
}

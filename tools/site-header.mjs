// Single authoring source for the static header in every language/page.
// Run node tools/sync-site-header.mjs after editing; generated pages work without JavaScript.

export function renderSiteHeader(language, page) {
  if (!['en', 'ko'].includes(language) || !['home', 'support'].includes(page)) throw new Error('Unknown site header locale/page');
  const ko = language === 'ko';
  const home = ko ? 'index-ko.html' : 'index.html';
  const support = ko ? 'donate-ko.html' : 'donate.html';
  const alternate = page === 'home' ? (ko ? 'index.html' : 'index-ko.html') : (ko ? 'donate.html' : 'donate-ko.html');
  const alternateLanguage = ko ? 'en' : 'ko';
  return `<header class="site-header">
    <a class="brand" href="./${home}" aria-label="${ko ? '홈으로' : 'Home'}">
      <span class="brand-mark" aria-hidden="true">EV</span>
      <span>Ev-Cabinet</span>
    </a>
    <nav aria-label="${ko ? '주요 메뉴' : 'Main navigation'}">
      <a href="./${home}#app">${ko ? '프로젝트' : 'Work'}</a>
      <a href="https://evilack.github.io/portfolio/">${ko ? '포트폴리오' : 'Portfolio'}</a>
      <a class="support-nav" href="./${support}"${page === 'support' ? ' aria-current="page"' : ''}>${ko ? '개발 후원' : 'Support'}</a>
      <a class="language-link" href="./${alternate}?lang=${alternateLanguage}" lang="${alternateLanguage}" hreflang="${alternateLanguage}">${ko ? 'English' : '한국어'}</a>
    </nav>
  </header>`;
}

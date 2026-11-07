/* Static-hosting locale routing shared by the Ev-Cabinet homepage and support pages.
   Priority: explicit URL/manual choice, saved choice, browser preferences, English. */
(() => {
  const storageKey = 'ev-cabinet-language';
  const families = {
    home: { ko: 'index-ko.html', en: 'index.html' },
    support: { ko: 'donate-ko.html', en: 'donate.html' },
  };
  const pages = families[document.documentElement.dataset.page];
  if (!pages) return;
  const supported = value => value === 'ko' || value === 'en' ? value : null;

  function remember(language) {
    try { localStorage.setItem(storageKey, language); }
    catch { /* The explicit language URL still works when storage is unavailable. */ }
  }

  function preferredLanguage() {
    const explicit = supported(new URL(location.href).searchParams.get('lang')?.toLowerCase());
    if (explicit) {
      remember(explicit);
      return explicit;
    }
    try {
      const saved = supported(localStorage.getItem(storageKey));
      if (saved) return saved;
    } catch { /* Continue with browser preferences in restricted/private contexts. */ }
    try {
      const languages = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages : [navigator.language];
      for (const locale of languages) {
        if (typeof locale !== 'string') continue;
        const language = supported(locale.toLowerCase().split('-')[0]);
        if (language) return language;
      }
    } catch { /* English is also the fallback if locale information is unavailable. */ }
    return 'en';
  }

  function applyLanguage() {
    const language = preferredLanguage();
    if (document.documentElement.lang === language) return;
    const destination = new URL(pages[language], location.href);
    destination.search = location.search;
    destination.hash = location.hash;
    // Replace the automatic hop so Back returns to the page the visitor came from.
    location.replace(destination.href);
  }

  // This non-deferred script runs before the page styles/content to avoid a wrong-language flash.
  applyLanguage();
  window.addEventListener('languagechange', applyLanguage);
  // Back/forward cache restores skip script execution; respect the latest saved choice.
  window.addEventListener('pageshow', applyLanguage);
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a.language-link') : null;
    const language = link && supported(link.hreflang);
    if (language) remember(language);
  });

  // Keep an explicit choice usable across pages even when browser storage is denied.
  // Browser-detected preferences are not saved as manual selections.
  document.addEventListener('DOMContentLoaded', () => {
    const explicit = supported(new URL(location.href).searchParams.get('lang')?.toLowerCase());
    if (!explicit) return;
    const localPages = new Set([...Object.values(families).flatMap(family => Object.values(family)), 'donate-en.html']);
    for (const link of document.querySelectorAll('a[href]')) {
      const raw = link.getAttribute('href');
      if (raw.startsWith('#') || link.classList.contains('language-link')) continue;
      const destination = new URL(link.href);
      if (destination.origin !== location.origin || !localPages.has(destination.pathname.split('/').pop())) continue;
      destination.searchParams.set('lang', explicit);
      link.href = destination.href;
    }
  });
})();

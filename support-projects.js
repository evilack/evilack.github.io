// Public catalog: each project uses a real, separately named PayPal payment item.
// The shared link is preserved; all contributions still support Ev-Cabinet as a whole.
export const SUPPORT_PROJECTS = Object.freeze([
  { id: 'all', label: { ko: 'Ev-Cabinet 전체', en: 'All Ev-Cabinet projects' },
    paypal: 'https://www.paypal.com/ncp/payment/U3EX8XP6BREYA', item: 'Ev-Cabinet — One-time developer support' },
  { id: 'quietmic', label: { ko: 'QuietMic', en: 'QuietMic' },
    paypal: 'https://www.paypal.com/ncp/payment/WWM6KYZ4E3S2W', item: 'Ev-Cabinet — QuietMic support' },
  { id: 'mdownloader', label: { ko: 'MDownloader', en: 'MDownloader' },
    paypal: 'https://www.paypal.com/ncp/payment/8SAZVLEDCZFNU', item: 'Ev-Cabinet — MDownloader support' },
]);

const validId = value => typeof value === 'string'
  ? SUPPORT_PROJECTS.find(project => project.id === value.toLowerCase())?.id : undefined;
export function getSupportProject(value) {
  return SUPPORT_PROJECTS.find(project => project.id === validId(value)) || SUPPORT_PROJECTS[0];
}
export function preferredSupportProject(url, saved) {
  return validId(new URL(url).searchParams.get('project')) || validId(saved) || 'all';
}

if (typeof document !== 'undefined') {
  const picker = document.getElementById('support-project-picker');
  const payment = document.getElementById('paypal-support');
  if (picker && payment) {
    const key = 'ev-cabinet-support-project';
    const language = document.documentElement.lang === 'ko' ? 'ko' : 'en';
    function savedChoice() {
      try { return localStorage.getItem(key); }
      catch { return null; }
    }
    function apply(id, remember = false) {
      const project = getSupportProject(id);
      for (const radio of picker.querySelectorAll('input[name="support-project"]')) radio.checked = radio.value === project.id;
      payment.href = project.paypal;
      document.getElementById('project-selection-summary').textContent =
        (language === 'ko' ? '응원 프로젝트: ' : 'Cheering for: ') + project.label[language];
      for (const link of document.querySelectorAll('a.language-link')) {
        const url = new URL(link.href);
        url.searchParams.set('project', project.id);
        link.href = url.href;
      }
      if (remember) {
        try { localStorage.setItem(key, project.id); }
        catch { /* The explicit URL also retains the choice when storage is blocked. */ }
        const url = new URL(location.href);
        url.searchParams.set('project', project.id);
        history.replaceState(null, '', url);
      }
    }
    function restore() {
      const explicit = validId(new URL(location.href).searchParams.get('project'));
      apply(preferredSupportProject(location.href, savedChoice()));
      if (explicit) {
        try { localStorage.setItem(key, explicit); }
        catch { /* Keep the URL selection usable without storage. */ }
      }
    }
    restore();
    picker.addEventListener('change', event => {
      if (event.target instanceof HTMLInputElement && event.target.name === 'support-project') apply(event.target.value, true);
    });
    window.addEventListener('pageshow', restore);
    picker.hidden = false;
    document.getElementById('project-fallback-links').hidden = true;
  }
}

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build, transform } from 'esbuild';
import { escapeHtml, inlineMarkup, localize, pageUrl, projectLabel, renderTemplate,
  renderHeader, renderProjectPicker, renderFooter } from './rendering.mjs';

/** 경로 검사는 쓰기/삭제 양쪽에 적용합니다. 다른 폴더의 파일을 생성 목록으로 처리하지 않습니다. */
export function outputPath(root, relative) {
  const filename = path.resolve(root, relative);
  const resolved = path.relative(root, filename);
  if (!resolved || resolved.startsWith('..') || path.isAbsolute(resolved)) throw new Error('출력 폴더 밖의 경로입니다: ' + relative);
  return filename;
}

function variables(site, language) {
  const featured = site.support.projects.find(project => project.id === site.featured.project);
  return { brand: site.site.name, featured: featured.name, author: site.site.author[language],
    currency: site.support.currency, provider: site.support.providerName };
}

/** 공개 설정에는 브라우저 동작에 필요한 값만 넣습니다. 개발 경로나 배포 설정은 포함하지 않습니다. */
function browserSettings(site, language, text) {
  const names = variables(site, language);
  const config = {
    localization: site.localization,
    pages: Object.fromEntries(Object.entries(site.pages).map(([family, page]) => [family, { routes: page.routes, aliases: page.aliases }])),
    dom: site.dom,
  };
  // 선택 폼이 없는 홈페이지에는 결제 링크와 프로젝트 카탈로그를 중복 싣지 않습니다.
  if (text.picker) {
    config.support = { defaultProject: site.support.defaultProject, query: site.support.query, storage: site.support.storage,
      projects: site.support.projects.map(project => ({ id: project.id,
        label: projectLabel(project, language, names), payment: { url: project.payment.url } })) };
    config.messages = { projectSummaryPrefix: text.picker.summaryPrefix };
  }
  return config;
}

function renderPage(project, language, family, assets, body) {
  const site = project.site;
  const page = site.pages[family];
  const names = variables(site, language);
  const locale = localize(project.locales[language], names);
  const text = { ...locale[family], ui: locale.ui };
  const urls = { home: pageUrl(site, 'home', language), support: pageUrl(site, 'support', language),
    work: pageUrl(site, 'home', language, site.anchors.work), ...site.site.links };
  const copyright = site.site.copyrightYear;
  const featured = { ...site.featured, name: names.featured,
    screenshot: assets.media[site.featured.screenshot], icon: assets.media[site.featured.icon] };
  const components = { header: renderHeader(site, language, family, locale.ui), footer: renderFooter(site, language, family, text.footer) };
  if (text.work) {
    components.features = `<ul class="feature-list">${text.work.features.map((feature, index) => `<li><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span> ${escapeHtml(feature)}</li>`).join('')}</ul>`;
    components.technologies = `<div class="tech-list" role="group" aria-label="${escapeHtml(text.technologies.label)}">${text.technologies.items.map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>`;
  }
  if (text.picker) {
    components.projectPicker = renderProjectPicker(site, language, text.picker, names);
    components.whyTitle = inlineMarkup(text.why.title);
    components.fundUses = `<div class="fund-uses">${text.why.uses.map((use, index) => `<div><span>${String(index + 1).padStart(2, '0')}</span><p><strong>${escapeHtml(use.title)}</strong>${escapeHtml(use.description)}</p></div>`).join('')}</div>`;
    components.faq = `<div class="faq-list">${text.faq.items.map(item => `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`).join('')}</div>`;
    const payment = site.support.projects.find(item => item.id === site.support.defaultProject).payment;
    components.paymentLink = `<a class="button paypal-button" id="${escapeHtml(site.dom.paymentId)}" href="${escapeHtml(payment.url)}" aria-describedby="${escapeHtml(site.dom.amountNoteId + ' ' + site.dom.summaryId)}">${inlineMarkup(text.payment.button)}</a>`;
  }
  const canonical = new URL(page.routes[language], site.site.origin).href;
  const alternate = site.localization.languages.map(item => `<link rel="alternate" hreflang="${escapeHtml(item.code)}" href="${escapeHtml(new URL(page.routes[item.code], site.site.origin).href)}">`);
  alternate.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(new URL(page.routes[site.localization.default], site.site.origin).href)}">`);
  // HTML 안의 JSON은 <를 유니코드 이스케이프로 바꿔 </script>가 태그를 닫을 수 없게 합니다.
  const settings = JSON.stringify(browserSettings(site, language, text)).replaceAll('<', '\\u003c');
  const styles = [assets.styles.base, ...(text.picker ? [assets.styles.support] : []), assets.styles.localization];
  return `<!doctype html>
<html lang="${escapeHtml(language)}" data-page="${escapeHtml(family)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(text.description)}">
  <meta name="theme-color" content="${escapeHtml(page.themeColor)}">
  <title>${escapeHtml(text.title)}</title>
  <script type="application/json" id="${escapeHtml(site.dom.settingsId)}">${settings}</script>
  <script src="${escapeHtml(assets.runtime[family])}" data-site-settings="${escapeHtml(site.dom.settingsId)}"></script>
  <link rel="icon" type="image/svg+xml" href="${escapeHtml(assets.media.favicon.src)}">
  ${styles.map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n  ')}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${alternate.join('\n  ')}
</head>
${renderTemplate(body, { text, urls, featured, components, author: names.author, copyright, dom: site.dom, anchors: site.anchors })}
</html>
`;
}

/**
 * 변경 전에는 메모리에서 모든 결과를 완성합니다. 데이터/번역 오류가 나면 기존 사이트를 건드리지 않습니다.
 * JS는 페이지별로 필요한 기능만 하나의 작은 IIFE로 묶고 CSS/JS 주소에 내용 해시를 사용합니다.
 * 설정을 브라우저에서 비동기로 가져오는 방법과 달리 첫 언어 판정이 네트워크 왕복을 추가하지 않습니다.
 */
export async function createSiteFiles(project) {
  const files = new Map();
  const assets = { styles: {}, media: {}, runtime: {} };
  const { tooling, site, resolve } = project;
  const version = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, tooling.build.hashLength);
  for (const [name, style] of Object.entries(tooling.build.styles)) {
    const input = await readFile(path.join(resolve(tooling.paths.styles), style.source), 'utf8');
    const result = await transform(input, { loader: 'css', minify: true, target: tooling.build.target });
    files.set(style.output, Buffer.from(result.code));
    assets.styles[name] = './' + style.output + '?v=' + version(result.code);
  }
  for (const [name, asset] of Object.entries(site.assets)) {
    files.set(asset.output, await readFile(path.join(resolve(tooling.paths.assets), asset.source)));
    assets.media[name] = { src: './' + asset.output, width: asset.width, height: asset.height };
  }
  const bundle = await build({ absWorkingDir: project.root,
    entryPoints: Object.fromEntries(Object.entries(tooling.paths.runtime).map(([name, filename]) => [name, resolve(filename)])),
    outdir: resolve(tooling.build.virtualDirectory), entryNames: '[name]-[hash]',
    bundle: true, platform: 'browser', format: 'iife', target: tooling.build.target,
    minify: true, sourcemap: tooling.build.sourceMap, write: false, metafile: true, logLevel: 'silent' });
  for (const output of bundle.outputFiles) {
    const filename = path.posix.join(tooling.build.bundleDirectory, path.basename(output.path));
    files.set(filename, Buffer.from(output.contents));
    if (filename.endsWith('.js')) {
      const entry = Object.keys(tooling.paths.runtime).find(name => path.basename(filename).startsWith(name + '-'));
      assets.runtime[entry] = './' + filename;
    }
  }
  for (const [family, page] of Object.entries(site.pages)) {
    const template = await readFile(path.join(resolve(tooling.paths.templates), page.template), 'utf8');
    for (const language of site.localization.languages.map(item => item.code)) {
      files.set(page.routes[language], Buffer.from(renderPage(project, language, family, assets, template)));
    }
    for (const [alias, language] of Object.entries(page.aliases)) files.set(alias, files.get(page.routes[language]));
  }
  files.set('.nojekyll', Buffer.alloc(0));
  return files;
}

/** --check는 읽기만 수행합니다. 일반 빌드도 이전 생성 목록의 파일만 삭제하며 다른 파일은 보존합니다. */
export async function buildSite(project, { check = false } = {}) {
  const files = await createSiteFiles(project);
  const root = project.resolve(project.tooling.paths.output);
  const manifestPath = outputPath(root, project.tooling.build.manifestFile);
  let previous = [];
  try { previous = JSON.parse(await readFile(manifestPath, 'utf8')).files; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const obsolete = [...new Set([...previous, ...project.tooling.build.legacyOutputs])].filter(file => !files.has(file));
  for (const [filename, bytes] of files) {
    const destination = outputPath(root, filename);
    if (check) {
      const current = await readFile(destination).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (!current?.equals(bytes)) throw new Error('생성 결과가 최신 상태가 아닙니다: ' + filename);
    } else {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
  }
  for (const filename of obsolete) {
    const destination = outputPath(root, filename);
    if (!check) await unlink(destination).catch(error => { if (error.code !== 'ENOENT') throw error; });
    else if (await readFile(destination).then(() => true).catch(error => error.code === 'ENOENT' ? false : Promise.reject(error))) throw new Error('이전 생성 파일이 남아 있습니다: ' + filename);
  }
  const manifest = { files: [...files.keys()].sort(), bytes: Object.fromEntries([...files].map(([name, bytes]) => [name, bytes.length])) };
  if (!check) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SUPPORT_PROJECTS } from '../support-projects.js';

const scriptVersion = createHash('sha256').update(await readFile(new URL('../support-projects.js',import.meta.url))).digest('hex').slice(0,12);
const styleVersion = createHash('sha256').update(await readFile(new URL('../support.css',import.meta.url))).digest('hex').slice(0,12);
for (const [file, lang] of [['donate.html','en'],['donate-ko.html','ko'],['donate-en.html','en']]) {
  const ko=lang==='ko';
  const options=SUPPORT_PROJECTS.map(project=>`          <label class="project-option" for="project-${project.id}">
            <input type="radio" id="project-${project.id}" name="support-project" value="${project.id}"${project.id==='all'?' checked':''}>
            <span>${project.label[lang]}</span>
          </label>`).join('\n');
  const links=SUPPORT_PROJECTS.map(project=>`          <a href="${project.paypal}" data-direct-project="${project.id}">${project.label[lang]} <span aria-hidden="true">↗</span></a>`).join('\n');
  const content=`<!-- support-projects:start -->
        <p class="project-choice-note" id="project-choice-note">${ko?'응원하고 싶은 프로젝트를 골라 주세요. 선택한 이름이 PayPal 결제 항목에 표시됩니다.':'Choose a project to cheer for. Its name will appear in the PayPal payment item.'}</p>
        <fieldset class="project-picker" id="support-project-picker" aria-describedby="project-choice-note" hidden>
          <legend>${ko?'응원할 프로젝트':'Project to cheer for'}</legend>
          <div class="project-options">
${options}
          </div>
        </fieldset>
        <div class="project-fallback-links" id="project-fallback-links">
          <p>${ko?'프로젝트별 PayPal 후원 링크':'Project-specific PayPal support links'}</p>
${links}
        </div>
        <p class="project-selection-summary" id="project-selection-summary">${ko?'응원 프로젝트: Ev-Cabinet 전체':'Cheering for: All Ev-Cabinet projects'}</p>
        <p class="project-funding-note">${ko?'프로젝트 선택은 응원의 뜻을 전하는 용도입니다. 후원금은 Ev-Cabinet 전체 앱·프로젝트의 개발과 유지보수에 사용됩니다.':'Your choice expresses which project you are cheering for. Contributions support development and maintenance across all Ev-Cabinet apps and projects.'}</p>
        <!-- support-projects:end -->`;
  const url=new URL('../'+file,import.meta.url);
  let html=await readFile(url,'utf8');
  if(html.includes('<!-- support-projects:start -->')) html=html.replace(/<!-- support-projects:start -->[\s\S]*?<!-- support-projects:end -->/,()=>content);
  else html=html.replace(/<p class="support-amount-note"/,()=>content+'\n        <p class="support-amount-note"');
  html=html.replace('aria-describedby="support-amount-note"','aria-describedby="support-amount-note project-selection-summary"');
  html=html.replace(/href="(?:\.\/)?support\.css(?:\?[^\"]*)?"/,`href="./support.css?v=${styleVersion}"`);
  html=html.replace(/\s*<script type="module" src="\.\/support-projects\.js[^\"]*"><\/script>/g,'');
  html=html.replace('</body>',`  <script type="module" src="./support-projects.js?v=${scriptVersion}"></script>\n</body>`);
  await writeFile(url,html);
}
console.log('Updated project choices and native PayPal fallbacks in all 3 support pages.');

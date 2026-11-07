import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { loadProject } from './lib/configuration.mjs';

// 설치 환경별 실행 경로는 도구 설정에 두고 개인 환경의 CHROME_PATH를 우선합니다.
const project = await loadProject();
const candidates = [process.env.CHROME_PATH, ...project.tooling.verification.browserCandidates].filter(Boolean);
const chromeExecutable = candidates.find(candidate => existsSync(candidate));
if (!chromeExecutable) throw new Error('Install Chrome or set CHROME_PATH to its executable.');
export { puppeteer, chromeExecutable };

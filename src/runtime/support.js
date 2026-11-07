import { startPage } from './entry.js';
import { SupportController } from './support-controller.js';

// 공통 초기화가 끝나고 DOM이 준비되었을 때 이 페이지의 선택 폼만 연결합니다.
startPage((config, browser, store) => new SupportController(config, browser, store).connect());

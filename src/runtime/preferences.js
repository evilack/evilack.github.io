/**
 * 저장소 접근의 예외 처리를 한 곳에서 관리합니다.
 * 일부 브라우저의 비공개/저장 차단 모드에서는 localStorage 속성 접근부터 실패합니다.
 * 따라서 생성자에서 저장소 객체를 꺼내지 않고, 읽고 쓸 때 전달받은 함수를 호출합니다.
 * 실패해도 URL 선택과 기본 링크는 그대로 사용할 수 있습니다.
 */
export class PreferenceStore {
  #getStorage;

  constructor(getStorage) {
    this.#getStorage = getStorage;
  }

  read(key) {
    try { return this.#getStorage().getItem(key); }
    catch { return null; }
  }

  write(key, value) {
    try { this.#getStorage().setItem(key, value); return true; }
    catch { return false; }
  }
}

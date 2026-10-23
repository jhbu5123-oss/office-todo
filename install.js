/* Online PWA: no offline cache of account data or authentication responses. */
(() => {
 'use strict';
 let pending = null;
 const mode = window.matchMedia('(display-mode: standalone)');
 const buttons = [...document.querySelectorAll('[data-pc-install]')];
 const help = document.getElementById('pc-install-help');
 const message = document.getElementById('pc-install-message');
 const refresh = () => buttons.forEach(button => { button.hidden = mode.matches; });
 function explain(text) {
  message.textContent = text;
  if (!help.open) help.showModal();
 }
 window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); pending = event; refresh();
 });
 window.addEventListener('appinstalled', () => {
  pending = null;
  if (help.open) help.close();
  buttons.forEach(button => { button.hidden = true; });
 });
 mode.addEventListener('change', refresh);
 buttons.forEach(button => button.addEventListener('click', async () => {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
   explain('먼저 파일을 기존 GitHub Pages 저장소에 업로드한 후, HTTPS 웹 주소로 접속해 주세요. 압축 파일 속 index.html을 직접 열면 설치할 수 없습니다.'); return;
  }
  if (!pending) {
   explain('Edge 또는 Chrome 주소창의 설치 아이콘을 눌러 주세요. Edge에서는 메뉴(…) → 기타 도구 → 앱 → 이 사이트를 앱으로 설치도 사용할 수 있습니다. 이미 설치했다면 시작 메뉴에서 실행하세요. 설치 메뉴가 없으면 브라우저 종류 또는 기관의 설치 허용 정책을 확인해 주세요.'); return;
  }
  const prompt = pending; pending = null;
  buttons.forEach(button => { button.disabled = true; });
  try { await prompt.prompt(); await prompt.userChoice; }
  catch { explain('브라우저의 주소창 설치 아이콘이나 앱 설치 메뉴를 이용해 주세요.'); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
 }));
 refresh();
})();

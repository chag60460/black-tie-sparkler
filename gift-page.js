giftList.activate();
window.addEventListener('pagehide', () => giftList.deactivate());
window.addEventListener('pageshow', event => {
  if (event.persisted) giftList.activate();
});

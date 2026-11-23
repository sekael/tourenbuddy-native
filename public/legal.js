// The English legal pages: a German-speaking visitor (the app's language, else the browser's)
// reads the German page, as the PWA showed its terms in the app's language. Choosing "English" on
// a German page (`?lang=en`) keeps English for the rest of the visit.
(function () {
  try {
    if (/[?&]lang=en\b/.test(location.search)) return sessionStorage.setItem('tb.legal.en', '1');
    if (sessionStorage.getItem('tb.legal.en')) return;
    const lang = localStorage.getItem('tb.locale') || navigator.language || '';
    if (/^de\b/i.test(lang))
      location.replace('/de' + location.pathname.replace(/\/$/, '') + location.hash);
  } catch {
    // Storage blocked: the English page stays.
  }
})();

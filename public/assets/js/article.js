/* Article page — table-of-contents scrollspy. */
(function () {
  'use strict';
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (!links.length || !('IntersectionObserver' in window)) return;

  var map = {};
  var targets = links
    .map(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) map[el.id] = a;
      return el;
    })
    .filter(Boolean);

  var visible = new Set();
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      });
      var firstVisible = targets.find(function (t) { return visible.has(t.id); });
      links.forEach(function (a) { a.classList.remove('is-current'); });
      if (firstVisible && map[firstVisible.id]) map[firstVisible.id].classList.add('is-current');
    },
    { rootMargin: '-15% 0px -70% 0px' }
  );
  targets.forEach(function (t) { io.observe(t); });
})();

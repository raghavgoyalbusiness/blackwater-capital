/* Insights index — client-side category filtering over server-rendered cards. */
(function () {
  'use strict';
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var grid = document.querySelector('[data-insight-grid]');
  if (!filters.length || !grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.card--insight'));
  var empty = document.querySelector('[data-filters-empty]');
  var live = document.querySelector('[data-filter-status]');

  function categoryOf(card) {
    var el = card.querySelector('.eyebrow');
    if (!el) return '';
    var clone = el.cloneNode(true);
    var tag = clone.querySelector('.tag');
    if (tag) tag.remove();
    return clone.textContent.trim();
  }

  function apply(value) {
    var shown = 0;
    cards.forEach(function (card) {
      var match = value === 'All' || categoryOf(card) === value;
      card.classList.toggle('is-hidden', !match);
      if (match) { shown++; card.classList.add('is-in'); }
    });
    filters.forEach(function (b) {
      var on = b.getAttribute('data-filter') === value;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (empty) empty.hidden = shown !== 0;
    if (live) live.textContent = shown + (shown === 1 ? ' insight' : ' insights') + ' shown' + (value === 'All' ? '' : ' in ' + value);

    var url = new URL(window.location.href);
    if (value === 'All') url.searchParams.delete('category');
    else url.searchParams.set('category', value);
    history.replaceState(null, '', url);
  }

  filters.forEach(function (b) {
    b.addEventListener('click', function () { apply(b.getAttribute('data-filter')); });
  });

  var initial = new URL(window.location.href).searchParams.get('category');
  if (initial && filters.some(function (b) { return b.getAttribute('data-filter') === initial; })) apply(initial);
})();

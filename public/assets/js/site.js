/* Blackwater Capital — shared behaviour.
   Progressive enhancement only: every page is usable without this file. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* --- sticky nav ------------------------------------------------------- */
  var nav = $('[data-nav-root]');
  if (nav) {
    var stuck = false;
    var onScroll = function () {
      var next = window.scrollY > 24;
      if (next !== stuck) {
        stuck = next;
        nav.classList.toggle('is-stuck', stuck);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- current page marker --------------------------------------------- */
  var key = document.body.getAttribute('data-nav');
  if (key) {
    var current = $('.nav__list a[data-key="' + key + '"]');
    if (current) current.setAttribute('aria-current', 'page');
  }

  /* --- mobile menu ------------------------------------------------------ */
  var toggle = $('[data-nav-toggle]');
  var menu = $('#nav-menu');
  var scrim = $('[data-nav-scrim]');
  if (toggle && menu) {
    var lastFocus = null;
    var setMenu = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
      if (scrim) {
        if (open) { scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add('is-on'); }); }
        else { scrim.classList.remove('is-on'); setTimeout(function () { scrim.hidden = true; }, 400); }
      }
      if (open) { lastFocus = document.activeElement; var f = menu.querySelector('a'); if (f) f.focus(); }
      else if (lastFocus) { lastFocus.focus(); }
    };
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    if (scrim) scrim.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false);
    });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    // keep focus inside the drawer while it is open
    menu.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || toggle.getAttribute('aria-expanded') !== 'true') return;
      var items = $$('a, button', menu).filter(function (el) { return el.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); toggle.focus(); }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900 && toggle.getAttribute('aria-expanded') === 'true') setMenu(false);
    });
  }

  /* --- scroll reveal ----------------------------------------------------
     Content must never be left permanently invisible. If IntersectionObserver
     is unavailable, or never delivers (a tab that loads while hidden does not
     run intersection updates), everything is shown unconditionally. */
  var revealables = $$('.reveal, .reveal-media, .process');
  var revealAll = function () {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  };

  if (!('IntersectionObserver' in window) || reduced) {
    revealAll();
  } else {
    var delivered = false;
    var io = new IntersectionObserver(
      function (entries) {
        delivered = true;
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );
    revealables.forEach(function (el) { io.observe(el); });

    // Fail-safe: if no intersection update has arrived shortly after load,
    // stop hiding content and let it through.
    var safety = function () {
      if (!delivered) revealAll();
    };
    window.addEventListener('load', function () { setTimeout(safety, 2500); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') setTimeout(safety, 1200);
    });
  }

  /* --- accordions ------------------------------------------------------- */
  $$('[data-acc]').forEach(function (root) {
    var buttons = $$('.acc__btn', root);
    buttons.forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      var open = btn.getAttribute('aria-expanded') === 'true';
      panel.style.height = open ? 'auto' : '0px';
      btn.addEventListener('click', function () {
        var isOpen = btn.getAttribute('aria-expanded') === 'true';
        if (!isOpen && root.hasAttribute('data-acc-single')) {
          buttons.forEach(function (other) {
            if (other === btn || other.getAttribute('aria-expanded') !== 'true') return;
            var p = document.getElementById(other.getAttribute('aria-controls'));
            other.setAttribute('aria-expanded', 'false');
            p.style.height = p.scrollHeight + 'px';
            requestAnimationFrame(function () { p.style.height = '0px'; });
          });
        }
        btn.setAttribute('aria-expanded', String(!isOpen));
        if (isOpen) {
          panel.style.height = panel.scrollHeight + 'px';
          requestAnimationFrame(function () { panel.style.height = '0px'; });
        } else {
          panel.style.height = panel.scrollHeight + 'px';
          panel.addEventListener('transitionend', function done(e) {
            if (e.propertyName !== 'height') return;
            panel.style.height = 'auto';
            panel.removeEventListener('transitionend', done);
          });
        }
      });
    });
  });

  /* --- copy link -------------------------------------------------------- */
  $$('[data-copy-link]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var done = function () {
        var t = btn.textContent;
        btn.textContent = 'Link copied';
        setTimeout(function () { btn.textContent = t; }, 2200);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done);
      else done();
    });
  });

  /* --- cookie consent --------------------------------------------------- */
  var banner = $('[data-cookie]');
  if (banner) {
    var KEY = 'bwc.consent';
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}
    var close = function (value) {
      try { localStorage.setItem(KEY, value); } catch (e) {}
      banner.classList.remove('is-on');
      setTimeout(function () { banner.hidden = true; }, 700);
    };
    if (!stored) {
      banner.hidden = false;
      setTimeout(function () { banner.classList.add('is-on'); }, 900);
    }
    var accept = $('[data-cookie-accept]', banner);
    var decline = $('[data-cookie-decline]', banner);
    if (accept) accept.addEventListener('click', function () { close('all'); });
    if (decline) decline.addEventListener('click', function () { close('essential'); });
    // re-open from the privacy page
    $$('[data-cookie-reopen]').forEach(function (b) {
      b.addEventListener('click', function () {
        banner.hidden = false;
        requestAnimationFrame(function () { banner.classList.add('is-on'); });
      });
    });
    var state = $('[data-consent-state]');
    if (state) state.textContent = stored === 'all' ? 'Analytics cookies accepted' : stored === 'essential' ? 'Essential cookies only' : 'No preference recorded yet';
  }

  /* --- footer year ------------------------------------------------------ */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();

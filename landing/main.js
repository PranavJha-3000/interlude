/* Interlude landing — progressive enhancement only.
   The page is fully readable with JS disabled; this adds the nav's solid
   state, the mobile menu, and scroll reveals. Truth is in the markup. */
(function () {
  'use strict';

  var nav = document.querySelector('[data-nav]');
  var toggle = document.querySelector('[data-nav-toggle]');
  var mobile = document.querySelector('[data-nav-mobile]');

  /* ── Nav: transparent over the hero, solid once scrolled ─────────────── */
  function onScroll() {
    if (!nav) return;
    if (window.scrollY > 8) nav.classList.add('nav--solid');
    else nav.classList.remove('nav--solid');
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── Mobile menu ─────────────────────────────────────────────────────── */
  function closeMenu() {
    if (!toggle || !mobile) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    mobile.hidden = true;
  }
  function openMenu() {
    if (!toggle || !mobile) return;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    mobile.hidden = false;
  }
  if (toggle && mobile) {
    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') closeMenu();
      else openMenu();
    });
    mobile.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
    // A resize past the desktop breakpoint should reset the menu state.
    var mq = window.matchMedia('(min-width: 52.0625rem)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(
      function () {
        closeMenu();
      }
    );
  }

  /* ── Scroll reveals ──────────────────────────────────────────────────── */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) {
      el.classList.add('is-in');
    });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
          el.style.transitionDelay = delay * 80 + 'ms';
          el.classList.add('is-in');
          io.unobserve(el);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  }
})();

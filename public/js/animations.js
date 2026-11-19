// Add restrained page-entry and scroll-reveal motion across the visitor and staff portals.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const actionControls = document.querySelectorAll([
    '.tides-motion-control',
    '.travel-home .travel-button',
    '.travel-home .footer-book-link',
    '.travel-home .stewardship-link'
  ].join(','));
  actionControls.forEach(control => {
    control.classList.add('tides-motion-control');
    const label = document.createElement('span');
    label.className = 'tides-motion-label';
    while (control.firstChild) label.append(control.firstChild);
    control.append(label);
  });

  const restoreControl = button => {
    button.classList.remove('is-loading', 'is-complete', 'is-error');
    button.removeAttribute('aria-busy');
    if ('disabled' in button) button.disabled = false;
  };

  window.TidesButtonMotion = {
    start(button) {
      button.classList.remove('is-complete', 'is-error');
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
      if ('disabled' in button) button.disabled = true;
    },
    complete(button) {
      button.classList.remove('is-loading', 'is-error');
      button.classList.add('is-complete');
      button.setAttribute('aria-busy', 'false');
      window.setTimeout(() => restoreControl(button), 900);
    },
    fail(button) {
      button.classList.remove('is-loading', 'is-complete');
      button.classList.add('is-error');
      button.removeAttribute('aria-busy');
      if ('disabled' in button) button.disabled = false;
      window.setTimeout(() => button.classList.remove('is-error'), 450);
    }
  };

  actionControls.forEach(control => {
    if (control instanceof HTMLAnchorElement) {
      control.addEventListener('click', () => {
        control.classList.add('is-pressed');
        window.setTimeout(() => control.classList.remove('is-pressed'), 350);
      });
    }
  });

  if (reduceMotion) return;

  const main = document.querySelector('main');
  if (main) {
    main.classList.add('page-entering');
    main.addEventListener('animationend', () => main.classList.remove('page-entering'), { once: true });
    window.setTimeout(() => main.classList.remove('page-entering'), 800);
  }

  const targets = document.querySelectorAll([
    '.travel-home .travel-hero-copy',
    '.travel-home .shoal-gallery',
    '.travel-home .travel-hero-facts',
    '.travel-home .travel-section-heading',
    '.travel-home .destination-card',
    '.travel-home .experience-photo',
    '.travel-home .experience-story',
    '.travel-home .travel-gallery img',
    '.travel-home .ordinance-heading',
    '.travel-home .penalty-card',
    '.travel-home .prohibited-card',
    '.travel-home .stewardship-copy',
    '.travel-app main > .admin-heading',
    '.travel-app main > .breadcrumbs',
    '.travel-app main > .page-title',
    '.travel-app main > .stat-grid',
    '.travel-app main > .tabs',
    '.travel-app main > section:not(.split-content)',
    '.travel-app main > .page-main > section',
    '.travel-app main > .login-wrap > section',
    '.travel-app main > .grid > section.card',
    '.travel-app .split-visual',
    '.travel-app .split-card',
    '.travel-app .login-card'
  ].join(','));

  if (!targets.length) return;

  const siblingIndexes = new Map();
  targets.forEach(target => {
    const parent = target.parentElement;
    const index = siblingIndexes.get(parent) || 0;
    siblingIndexes.set(parent, index + 1);
    target.style.setProperty('--reveal-delay', `${Math.min(index * 75, 300)}ms`);
    target.classList.add('scroll-reveal');
  });

  const pending = new Set(targets);
  let observer = null;
  const reveal = target => {
    target.classList.add('is-revealed');
    pending.delete(target);
    if (observer) observer.unobserve(target);
  };
  const revealInView = () => {
    const viewportBottom = window.innerHeight * 0.94;
    pending.forEach(target => {
      const bounds = target.getBoundingClientRect();
      if (bounds.top < viewportBottom && bounds.bottom > 0) reveal(target);
    });
  };

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) reveal(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    targets.forEach(target => observer.observe(target));
  }

  window.addEventListener('scroll', revealInView, { passive: true });
  window.addEventListener('resize', revealInView);
  revealInView();
})();

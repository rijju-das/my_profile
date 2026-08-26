document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.primary-nav');
  const progress = document.querySelector('.reading-progress span');

  const closeMenu = () => {
    menuButton?.classList.remove('open');
    nav?.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  menuButton?.addEventListener('click', () => {
    const isOpen = !nav.classList.contains('open');
    menuButton.classList.toggle('open', isOpen);
    nav.classList.toggle('open', isOpen);
    menuButton.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

  const updateProgress = () => {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const value = distance > 0 ? (window.scrollY / distance) * 100 : 0;
    progress.style.width = `${Math.min(100, value)}%`;
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px' });
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

  const tabs = [...document.querySelectorAll('.atlas-tab')];
  const panels = [...document.querySelectorAll('.atlas-panel')];
  const selectTab = tab => {
    const theme = tab.dataset.theme;
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => {
      const selected = panel.dataset.panel === theme;
      panel.hidden = !selected;
      panel.classList.toggle('active', selected);
    });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  const filters = document.querySelectorAll('.filter');
  const publications = document.querySelectorAll('.publication-row');
  filters.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    filters.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    publications.forEach(publication => {
      publication.hidden = filter !== 'all' && publication.dataset.category !== filter;
    });
  }));

  document.querySelector('#year').textContent = new Date().getFullYear();
});

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
  }
});

// Docs sidebar ToC
function buildDocsToc() {
  const nav = document.querySelector('.docs-toc');
  if (!nav) return;

  const content = document.querySelector('.docs-content');
  if (!content) return;

  const headings = Array.from(content.querySelectorAll('h2, h3'));
  if (headings.length === 0) return;

  // Label
  const label = document.createElement('p');
  label.className = 'docs-toc-label';
  label.textContent = 'On this page';
  nav.appendChild(label);

  // Build nested list
  const root = document.createElement('ul');
  let currentH2Li = null;
  let currentSubList = null;

  headings.forEach(h => {
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;

    const li = document.createElement('li');
    li.appendChild(a);

    if (h.tagName === 'H2') {
      currentSubList = document.createElement('ul');
      li.appendChild(currentSubList);
      root.appendChild(li);
      currentH2Li = li;
    } else {
      // H3 — nest under current h2's sublist, or root if none
      (currentSubList || root).appendChild(li);
    }
  });

  nav.appendChild(root);

  // Active-section tracking via IntersectionObserver
  const tocLinks = nav.querySelectorAll('a');
  const linkMap = new Map(
    Array.from(tocLinks).map(a => [a.getAttribute('href').slice(1), a])
  );

  let activeLink = null;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const link = linkMap.get(entry.target.id);
        if (link) {
          if (activeLink) activeLink.classList.remove('active');
          activeLink = link;
          activeLink.classList.add('active');
        }
      }
    });
  }, {
    rootMargin: '-10% 0px -80% 0px'
  });

  headings.forEach(h => observer.observe(h));
}

document.addEventListener('DOMContentLoaded', buildDocsToc);

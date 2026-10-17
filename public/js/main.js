/**
 * Next Foundery — Main JavaScript
 * Brand: Businesses Built Better
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initFAQAccordion();
  initSmoothScroll();
  initAnalyticsTracking();
});

// 1. Mobile Navigation
function initNavbar() {
  const toggle = document.getElementById('mobileNavToggle');
  const drawer = document.getElementById('mobileNavDrawer');
  const navbar = document.getElementById('navbar');

  if (toggle && drawer) {
    toggle.addEventListener('click', () => {
      const isOpen = drawer.classList.contains('open');
      if (isOpen) {
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });

    // Close drawer when clicking mobile links
    const mobileLinks = drawer.querySelectorAll('a');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Scroll shadow effect
  window.addEventListener('scroll', () => {
    if (navbar) {
      if (window.scrollY > 20) {
        navbar.style.borderBottomColor = 'rgba(183, 245, 42, 0.2)';
      } else {
        navbar.style.borderBottomColor = 'var(--color-border-subtle)';
      }
    }
  });
}

// 2. FAQ Accordion (All 13 items)
function initFAQAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;

  faqItems.forEach((item, index) => {
    const btn = item.querySelector('.faq-question-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close all others
        faqItems.forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove('active');
            const otherBtn = otherItem.querySelector('.faq-question-btn');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });

        // Toggle clicked item
        if (isActive) {
          item.classList.remove('active');
          btn.setAttribute('aria-expanded', 'false');
        } else {
          item.classList.add('active');
          btn.setAttribute('aria-expanded', 'true');
          trackEvent('faq_opened', { question_index: index + 1, question: btn.textContent.trim() });
        }
      });
    }
  });
}

// 3. Smooth Anchor Scrolling
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

// 4. Analytics-Ready Event Dispatcher
function initAnalyticsTracking() {
  // Track primary CTA clicks
  document.querySelectorAll('a[href="/checkout"]').forEach(btn => {
    btn.addEventListener('click', () => {
      trackEvent('cta_click', {
        label: btn.textContent.trim(),
        price: 199,
        target: '/checkout'
      });
    });
  });
}

/**
 * Global trackEvent helper
 */
window.trackEvent = function(eventName, properties = {}) {
  try {
    // 1. Google Analytics 4 (if configured)
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, properties);
    }
    // 2. Meta Pixel (if configured)
    if (typeof window.fbq === 'function') {
      window.fbq('trackCustom', eventName, properties);
    }
    // 3. Console development logging
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log(`[NextFoundery Analytics] Event: ${eventName}`, properties);
    }
  } catch (err) {
    console.debug('Analytics dispatch notice:', err);
  }
};

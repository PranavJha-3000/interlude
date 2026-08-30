'use client'

/* Progressive enhancement for the landing page — the JS twin of the old
   landing/main.js. The page is fully readable and usable without any of this:
   markup carries the content, and reveals activate under
   `@media (scripting: enabled)` in landing.css (no script, no JS class). This
   island adds three behaviours and renders nothing itself.

   It attaches by data-attribute (`[data-nav]`, `[data-nav-toggle]`,
   `[data-nav-mobile]`) so the server-rendered markup stays the source of
   truth and this stays a thin, swappable enhancement layer. */

import { useEffect } from 'react'

export function LandingEnhancements() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('[data-nav]')
    const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]')
    const mobile = document.querySelector<HTMLElement>('[data-nav-mobile]')

    /* ── Nav: transparent over the hero, solid once scrolled ─────────────── */
    const onScroll = () => {
      if (!nav) return
      nav.classList.toggle('nav--solid', window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    /* ── Mobile menu ─────────────────────────────────────────────────────── */
    const closeMenu = () => {
      if (!toggle || !mobile) return
      toggle.setAttribute('aria-expanded', 'false')
      toggle.setAttribute('aria-label', 'Open menu')
      mobile.hidden = true
    }
    const openMenu = () => {
      if (!toggle || !mobile) return
      toggle.setAttribute('aria-expanded', 'true')
      toggle.setAttribute('aria-label', 'Close menu')
      mobile.hidden = false
    }
    const onToggleClick = () => {
      if (toggle?.getAttribute('aria-expanded') === 'true') closeMenu()
      else openMenu()
    }
    const onMobileClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'A') closeMenu()
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    // Crossing back to the desktop layout should reset the menu state.
    const mq = window.matchMedia('(min-width: 52.0625rem)')
    const onMqChange = () => closeMenu()

    if (toggle && mobile) {
      toggle.addEventListener('click', onToggleClick)
      mobile.addEventListener('click', onMobileClick)
      document.addEventListener('keydown', onKeydown)
      mq.addEventListener('change', onMqChange)
    }

    /* ── Scroll reveals ──────────────────────────────────────────────────── */
    const reveals = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let io: IntersectionObserver | null = null

    if (reduced || !('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('is-in'))
    } else {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            const el = entry.target as HTMLElement
            const delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10)
            el.style.transitionDelay = `${delay * 80}ms`
            el.classList.add('is-in')
            io?.unobserve(el)
          })
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
      )
      reveals.forEach((el) => io?.observe(el))
    }

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (toggle && mobile) {
        toggle.removeEventListener('click', onToggleClick)
        mobile.removeEventListener('click', onMobileClick)
        document.removeEventListener('keydown', onKeydown)
        mq.removeEventListener('change', onMqChange)
      }
      io?.disconnect()
    }
  }, [])

  return null
}

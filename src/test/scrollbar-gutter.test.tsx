import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import App from '../../src/App'

/**
 * Scrollbar gutter, layout-shift prevention, and background coverage.
 *
 * The problem: a visible gutter on the right side of the page, and layout
 * shift when expanding bookmarks triggers scroll. The background image must
 * also cover the full page width with no gap.
 *
 * jsdom has no layout engine, so these tests assert on the source (CSS and
 * TSX) rather than computed geometry, following the same approach as the
 * existing responsive.test.tsx suite.
 */

const srcRoot = resolve(__dirname, '..')
const src = (file: string) => readFileSync(resolve(srcRoot, file), 'utf8')

// ---------------------------------------------------------------------------
// 1. scrollbar-gutter on html + scroll-themed
// ---------------------------------------------------------------------------
describe('scrollbar-gutter: stable', () => {
  const css = src('index.css')

  // `html` deliberately does NOT get `scrollbar-gutter: stable`: reserving
  // the gutter unconditionally left a bare strip on the right of the page
  // whenever no scrollbar was needed, with nothing (the background layer
  // included) painted under it. `.scroll-themed` (the bookmarks panel, the
  // Modal) still gets it, since its scrollbar toggles on and off as folders
  // expand/collapse and `stable` is what stops that from flickering the
  // gutter — see index.css's own comment on this rule.
  it('does not apply scrollbar-gutter: stable to the html element', () => {
    const htmlBlock = css.match(/html,\s*\n\s*\.scroll-themed\s*\{([\s\S]*?)\}/)
    expect(htmlBlock).not.toBeNull()
    expect(htmlBlock![1]).not.toContain('scrollbar-gutter')
  })

  it('applies scrollbar-gutter: stable to .scroll-themed containers', () => {
    expect(css).toMatch(/\.scroll-themed\s*\{[\s\S]*?scrollbar-gutter:\s*stable/)
  })

  it('does not use scrollbar-gutter: stable both-edges', () => {
    expect(css).not.toContain('both-edges')
  })

  it('uses thin scrollbar width on html', () => {
    expect(css).toMatch(/html[\s\S]*?scrollbar-width:\s*thin/)
  })

  it('uses a transparent scrollbar track color on html and scroll-themed', () => {
    expect(css).toMatch(/scrollbar-color:\s*var\(--scroll-thumb\)\s*transparent/)
  })
})

// ---------------------------------------------------------------------------
// 2. No visible gutter — scrollbar track is transparent, not opaque
// ---------------------------------------------------------------------------
describe('no visible gutter on the right side', () => {
  const css = src('index.css')

  it('sets the WebKit scrollbar track to transparent', () => {
    expect(css).toMatch(/::-webkit-scrollbar-track[\s\S]*?background:\s*transparent/)
  })

  it('sets the WebKit scrollbar corner to transparent', () => {
    expect(css).toMatch(/::-webkit-scrollbar-corner[\s\S]*?background:\s*transparent/)
  })

  it('hides WebKit scrollbar stepper buttons', () => {
    expect(css).toMatch(/::-webkit-scrollbar-button[\s\S]*?display:\s*none/)
  })

  it('uses a translucent foreground-based thumb color, not an opaque one', () => {
    expect(css).toContain('--scroll-thumb: oklch(from var(--foreground)')
  })

  it('provides a hover state for the scrollbar thumb', () => {
    expect(css).toContain('--scroll-thumb-hover:')
    expect(css).toMatch(/::-webkit-scrollbar-thumb:hover/)
  })
})

// ---------------------------------------------------------------------------
// 3. Background image covers full page width (no gap at the gutter)
// ---------------------------------------------------------------------------
describe('background image covers full page width', () => {
  const app = src('App.tsx')

  it('positions the background wrapper as absolute inset-0', () => {
    expect(app).toContain('absolute inset-0 -z-10 overflow-hidden')
  })

  it('uses bg-cover and bg-center on the image layer', () => {
    expect(app).toContain('bg-cover')
    expect(app).toContain('bg-center')
  })

  it('clips the scaled background layer with overflow-hidden on its wrapper', () => {
    expect(app).toMatch(/overflow-hidden[\s\S]*?scale-y-\[1\.12\]/)
  })

  it('does not use background-attachment: fixed on the image layer', () => {
    // The className strings and style objects — not comments — must not
    // contain `bg-fixed` or an explicit `background-attachment`.
    expect(app).not.toContain("'bg-fixed'")
    expect(app).not.toMatch(/className="[^"]*bg-fixed/)
    expect(app).not.toMatch(/backgroundAttachment/)
  })

  it('does not use a 100vw width class on the background layer', () => {
    // Check actual className strings, not comments that discuss reverted
    // approaches.
    expect(app).not.toMatch(/className="[^"]*w-\[100vw\]/)
  })
})

// ---------------------------------------------------------------------------
// 4. No layout shift *inside the bookmarks panel* when folders expand
// ---------------------------------------------------------------------------
// The panel's own scrollbar (not the page's) is what must not flicker the
// gutter as folders toggle — that's `.scroll-themed`'s `scrollbar-gutter:
// stable`, asserted in the first describe block above. `html` deliberately
// does not get it (same block), so the page's own scrollbar, on the rare
// layout where it appears at all, *can* shift content — that's the traded-off
// cost of not leaving a bare strip on every other layout. See index.css.
describe('no layout shift inside the bookmarks panel from folder expansion', () => {
  const app = src('App.tsx')

  it('caps the layout column with max-h-dvh so bookmarks scroll in place', () => {
    expect(app).toContain('max-h-dvh')
    expect(app).toContain('min-h-dvh')
  })

  // The tree below the "Bookmarks" header is the scroll container, so the
  // header stays put and the scrollbar doesn't run alongside it.
  const tree = src('FolderTree.tsx')

  it('makes the tree (not the whole panel) a scroll-themed overflow-y-auto container', () => {
    expect(tree).toMatch(/className="scroll-themed[^"]*overflow-y-auto/)
    expect(app).not.toMatch(/className="[^"]*overflow-y-auto/)
  })

  it('clips horizontal overflow so no x scrollbar flashes during animations', () => {
    expect(tree).toMatch(/className="scroll-themed[^"]*overflow-x-hidden/)
  })

  it('scales only the Y axis on the parallax layer, not both axes', () => {
    // The className string uses `scale-y-[1.12]` (Y-only), not `scale-[1.12]`
    // (isotropic). The latter appears in a comment explaining why it was
    // rejected, so only check the actual className attribute.
    expect(app).toMatch(/className="[^"]*scale-y-\[1\.12\]/)
    expect(app).not.toMatch(/className="[^"]*\bscale-\[1\.12\]/)
  })
})

// ---------------------------------------------------------------------------
// 5. Dark mode scrollbar tokens
// ---------------------------------------------------------------------------
describe('dark mode scrollbar theming', () => {
  const css = src('index.css')

  it('overrides --scroll-thumb in .dark with higher opacity', () => {
    // There are multiple `.dark` blocks — the scroll tokens are in the
    // second one, so use a regex that finds them anywhere in any `.dark` block.
    expect(css).toMatch(/\.dark\s*\{[^}]*--scroll-thumb:\s*oklch/)
  })

  it('overrides --scroll-thumb-hover in .dark', () => {
    expect(css).toMatch(/\.dark\s*\{[^}]*--scroll-thumb-hover:\s*oklch/)
  })
})

// ---------------------------------------------------------------------------
// 6. Integration: rendered App has correct background and page structure
// ---------------------------------------------------------------------------
describe('App background layer integration', () => {
  it('wraps the page in a relative min-h-dvh container', () => {
    const { container } = render(<App />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('relative')
    expect(wrapper.className).toContain('min-h-dvh')
  })

  it('positions both background variants (image and color) with absolute inset-0', () => {
    // The source has two conditional branches for the background: one for an
    // image (with overflow-hidden wrapper) and one for a solid color. Both
    // use `absolute inset-0 -z-10` to cover the page, so neither leaves a
    // gap at the scrollbar gutter. Verify both branches are in the source.
    const app = src('App.tsx')
    // Image branch: wrapper div
    expect(app).toContain('absolute inset-0 -z-10 overflow-hidden')
    // Solid-color branch
    expect(app).toMatch(/absolute inset-0 -z-10.*backgroundColor/)
  })
})

// ---------------------------------------------------------------------------
// 7. WebKit scrollbar dimensions
// ---------------------------------------------------------------------------
describe('WebKit scrollbar sizing', () => {
  const css = src('index.css')

  it('sets a fixed width and height for WebKit scrollbars', () => {
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[\s\S]*?width:\s*10px/)
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[\s\S]*?height:\s*10px/)
  })

  it('uses content-box clipping to inset the thumb from the track edge', () => {
    expect(css).toContain('background-clip: content-box')
    expect(css).toMatch(/::-webkit-scrollbar-thumb[\s\S]*?border:\s*2px solid transparent/)
  })
})

// ---------------------------------------------------------------------------
// 8. The scrollbar rules live in @layer components
// ---------------------------------------------------------------------------
describe('scrollbar-gutter placement', () => {
  const css = src('index.css')

  it('places scrollbar rules in @layer components, not @layer base', () => {
    const baseBlock = css.match(/@layer base\s*\{([\s\S]*?)\n\}/m)
    expect(baseBlock).not.toBeNull()
    expect(baseBlock![1]).not.toContain('scrollbar-gutter')
  })

  it('places scrollbar-gutter inside @layer components', () => {
    const inComponents = css.match(/@layer components[\s\S]*?\.scroll-themed[\s\S]*?scrollbar-gutter:\s*stable/)
    expect(inComponents).not.toBeNull()
  })
})

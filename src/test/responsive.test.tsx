import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithI18n, sampleTree } from './helpers'
import FolderTree from '../FolderTree'
import { LinkCard } from '../Cards'

/**
 * Device, viewport and motion.
 *
 * jsdom has no layout engine, so these assert on the source rather than on
 * computed geometry: the point is to catch a `vh` creeping back in or a
 * reduced-motion block being deleted, which is exactly how these regress.
 */

const src = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8')

describe('viewport units', () => {
  it('sizes the page with dvh rather than vh', () => {
    const app = src('App.tsx')
    // `100vh` is measured against the viewport with the mobile URL bar
    // retracted, so a vh-sized layout runs under the browser chrome.
    expect(app).toContain('min-h-dvh')
    expect(app).not.toContain('min-h-screen')
  })

  it('sizes the modal with dvh too', () => {
    expect(src('Modal.tsx')).toContain('max-h-[88dvh]')
    expect(src('Modal.tsx')).not.toContain('max-h-[88vh]')
  })
})

describe('safe areas', () => {
  it('insets the page for notches and the home indicator', () => {
    const app = src('App.tsx')
    // Without these, content sits under the notch in landscape and under the
    // home indicator at the bottom.
    expect(app).toContain('env(safe-area-inset-left)')
    expect(app).toContain('env(safe-area-inset-right)')
    expect(app).toContain('env(safe-area-inset-bottom)')
  })

  it('never lets an inset shrink the designed gutter', () => {
    // `max()` of the two — on a device with no inset the gutter is unchanged.
    expect(src('App.tsx')).toContain('max(var(--page-gutter), env(safe-area-inset-left))')
  })

  it('opts into viewport-fit=cover so the insets report real values', () => {
    // Without this the browser letterboxes around the notch and every
    // `env(safe-area-inset-*)` above silently resolves to 0.
    const html = readFileSync(resolve(__dirname, '..', '..', 'index.html'), 'utf8')
    expect(html).toContain('viewport-fit=cover')
  })
})

describe('reduced motion', () => {
  const css = src('index.css')

  it('neutralizes animation and transition globally', () => {
    // SplitFlapText handles itself, but every Tailwind `transition-*` in the
    // app is unconditional and has to be covered in one place.
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
  })

  it('lets animations finish rather than freezing them mid-way', () => {
    // `animation: none` on a spinner reads as a hung page; a near-zero
    // duration jumps to the end state, which is the intent of the setting.
    expect(css).not.toMatch(/prefers-reduced-motion[\s\S]{0,400}animation:\s*none\s*!important/)
  })

  it('drops the shortcut card hover lift', () => {
    expect(css).toContain('.hover\\:-translate-y-0\\.5:hover')
  })
})

describe('forced colors', () => {
  it('drops the glass treatment in high-contrast mode', () => {
    const css = src('index.css')
    // Translucent washes and backdrop-filter stop separating surfaces once the
    // OS replaces the palette.
    expect(css).toContain('forced-colors: active')
    expect(css).toMatch(/backdrop-filter:\s*none\s*!important/)
  })

  it('keeps focus visible when the author ring color is discarded', () => {
    expect(src('index.css')).toMatch(/forced-colors[\s\S]{0,600}outline:\s*2px solid Highlight/)
  })
})

describe('touch targets', () => {
  // WCAG 2.2 (2.5.8) asks for at least 24x24 CSS px of hit area; the row and
  // root controls go further and pad out to a real touch target. The padding
  // that does this lives on the *outer* button only — an inner span carries
  // the 24px visible box and its hover background, so what highlights on
  // hover is exactly the icon's square rather than the padded hit area (a
  // background on the padded element paints the padding too, which looked
  // like a stray gap next to the icon and didn't line up with anything else
  // on the row).
  it('pads the tree row button past its 24px visible box without painting the padding', () => {
    renderWithI18n(
      <FolderTree
        tree={sampleTree()}
        selectedId={null}
        newTab={false}
        editing
        onEdit={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
        onMoveRequest={() => {}}
        onSelect={() => {}}
        rootLabel="Bookmarks"
        onAddRoot={() => {}}
      />
    )
    // `p-1 -my-1` (see `rowBtnCls` in FolderTree.tsx) grows the outer
    // element's own border-box — its hit area — to 32px without widening the
    // row, which a folder row showing up to five of these at once cannot
    // spare the full 40px for. It carries no background/hover class itself.
    const del = screen.getByRole('button', { name: 'Delete Work' })
    expect(del.className).toContain('p-1')
    expect(del.className).toContain('-my-1')
    expect(del.className).not.toMatch(/hover:bg-/)

    // The inner span is what's actually 24px and actually paints on hover.
    const inner = del.firstElementChild as HTMLElement
    expect(inner.className).toContain('size-6')
    expect(inner.className).toMatch(/group-hover\/btn:bg-/)
  })

  it('gives the Bookmarks root row a full 40px hit area with the same unpainted-padding split', () => {
    renderWithI18n(
      <FolderTree
        tree={sampleTree()}
        selectedId={null}
        newTab={false}
        editing
        onEdit={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
        onMoveRequest={() => {}}
        onSelect={() => {}}
        rootLabel="Bookmarks"
        onAddRoot={() => {}}
        onToggleEditing={() => {}}
      />
    )
    // The root row is reached most often, so unlike a tree row it gets the
    // full touch-target padding rather than the row's reduced version.
    const toggle = screen.getByRole('button', { name: 'Done editing' })
    expect(toggle.className).toContain('p-2')
    expect(toggle.className).toContain('-my-2')
    expect(toggle.className).not.toMatch(/hover:bg-/)

    const inner = toggle.firstElementChild as HTMLElement
    expect(inner.className).toContain('size-6')
    expect(inner.className).toMatch(/group-hover\/btn:bg-/)
  })

  it('gives the visible shortcut card buttons a 24px painted box at desktop width', () => {
    renderWithI18n(
      <LinkCard
        node={{ id: 's1', type: 'link', name: 'GitHub', url: 'https://github.com' }}
        editable
        editing
        onEdit={() => {}}
        onRemove={() => {}}
      />
    )
    // Below 520px this pair is replaced by a single overflow trigger (see the
    // next describe block) — jsdom does not evaluate the `max-[520px]:hidden`
    // media query, so both variants exist in the DOM here; `getAllByRole`
    // rather than `getByRole` acknowledges that instead of accidentally
    // depending on it.
    const edits = screen.getAllByRole('button', { name: 'Edit GitHub' })
    expect(edits.length).toBeGreaterThan(0)
    for (const btn of edits) expect(btn.className).toContain('size-6')
  })
})

describe('card actions overflow', () => {
  it('replaces edit/delete with a single labelled menu trigger below 520px', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <LinkCard
        node={{ id: 's1', type: 'link', name: 'GitHub', url: 'https://github.com' }}
        editable
        editing
        onEdit={() => {}}
        onRemove={() => {}}
      />
    )

    const trigger = screen.getByRole('button', { name: 'Actions for GitHub' })
    // The narrow-width variant's container carries the class that reveals it
    // only under max-[520px]; the wide variant's sibling carries the inverse,
    // so at any single width exactly one is meant to be visible.
    expect(trigger.closest('.hidden')?.className).toContain('max-[520px]:flex')

    await user.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('routes the overflow menu items to the same onEdit/onRemove as the wide buttons', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    const node = { id: 's1', type: 'link' as const, name: 'GitHub', url: 'https://github.com' }
    renderWithI18n(
      <LinkCard node={node} editable editing onEdit={onEdit} onRemove={onRemove} />
    )

    await user.click(screen.getByRole('button', { name: 'Actions for GitHub' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(onRemove).toHaveBeenCalledWith('s1')
    expect(onEdit).not.toHaveBeenCalled()
  })
})

describe('logical properties', () => {
  it('uses direction-relative padding and positioning, not physical', () => {
    // `left`/`right`/`pl`/`pr` would not mirror under `dir="rtl"`. The
    // vendored tree is included: its expander margin was physical, which put
    // the chevron's gap on the wrong side in Arabic and Hebrew.
    const files = [
      'App.tsx', 'Cards.tsx', 'SearchBar.tsx', 'Clock.tsx', 'FolderTree.tsx',
      'Modal.tsx', 'components/kibo-ui/tree/index.tsx',
    ]
    for (const file of files) {
      const contents = src(file)
      // Match Tailwind's physical utilities as whole class tokens only, and
      // only inside a string, so prose in a comment can't trip it.
      const physical = contents.match(/["'\s](?:pl|pr|ml|mr)-\d[^\w-]/g)
      expect(physical, `${file} uses physical spacing utilities`).toBeNull()
    }
  })
})

describe('bookmarks empty state', () => {
  it('fills the remaining panel height instead of sitting pinned at the top', () => {
    const { container } = renderWithI18n(
      <FolderTree
        tree={[]}
        selectedId={null}
        newTab={false}
        onEdit={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
        onMoveRequest={() => {}}
        onSelect={() => {}}
        rootLabel="Bookmarks"
        onAddRoot={() => {}}
      />
    )
    // A dashed box pinned to the top of an otherwise-empty glass panel reads
    // as broken rather than "nothing here yet" — `flex-1` on the empty state
    // is necessary but not sufficient: it only has something to grow into if
    // every ancestor up to the scroll panel also participates in the flex
    // chain. `min-h-full` on FolderTree's own wrapper looked right but wasn't
    // — a percentage height needs a *definite*-height ancestor to resolve
    // against, and kibo-ui's TreeProvider wrapper (a plain `w-full` block,
    // outside this file) broke that chain silently: every class assertion on
    // this component alone still passed while the empty state rendered at
    // its content height. So this checks the whole chain — FolderTree's scroll
    // area, its root div AND the TreeProvider wrapper it renders inside — rather than one
    // link of it.
    const empty = screen.getByText('Nothing here yet — add a bookmark.')
    expect(empty.className).toContain('flex-1')

    const scrollArea = empty.closest('.scroll-themed')
    expect(scrollArea?.className).toContain('flex-1')
    expect(scrollArea?.className).toContain('min-h-0')

    const folderTreeRoot = scrollArea?.parentElement
    expect(folderTreeRoot?.className).toContain('flex-1')
    expect(folderTreeRoot?.className).toContain('min-h-0')

    const providerWrapper = folderTreeRoot?.parentElement
    expect(providerWrapper?.className).toContain('flex-1')
    expect(providerWrapper?.className).toContain('min-h-0')
    expect(container.contains(providerWrapper as Node)).toBe(true)
  })

  it('also fills the panel for a search with no matches', () => {
    renderWithI18n(
      <FolderTree
        tree={sampleTree()}
        query="nonexistent-xyz"
        selectedId={null}
        newTab={false}
        onEdit={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
        onMoveRequest={() => {}}
        onSelect={() => {}}
        rootLabel="Bookmarks"
        onAddRoot={() => {}}
      />
    )
    const empty = screen.getByText('No folders or bookmarks match "nonexistent-xyz".')
    expect(empty.className).toContain('flex-1')
  })
})

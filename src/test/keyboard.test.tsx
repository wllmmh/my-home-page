import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithI18n, sampleTree } from './helpers'
import FolderTree from '../FolderTree'
import HeaderMenu from '../HeaderMenu'
import SearchBar from '../SearchBar'
import { LinkCard } from '../Cards'
import { I18nProvider } from '../i18n'

/**
 * Everything reachable with a mouse must be reachable with a keyboard.
 *
 * The audit found two operations that were pointer-only: expanding a folder
 * (the row was a click-handling <div> with no role, tabindex, or key handler)
 * and moving a bookmark between folders (drag-and-drop with no alternative).
 */

const noop = () => {}

const renderTree = (props: Partial<Parameters<typeof FolderTree>[0]> = {}) =>
  renderWithI18n(
    <FolderTree
      tree={sampleTree()}
      selectedId={null}
      newTab={false}
      editing
      onEdit={noop}
      onRemove={noop}
      onMove={noop}
      onMoveRequest={noop}
      onSelect={noop}
      rootLabel="Bookmarks"
      onAddRoot={noop}
      {...props}
    />
  )

describe('tree rows', () => {
  it('exposes folder rows as focusable treeitems', () => {
    renderTree()
    const work = screen.getByRole('treeitem', { name: /Work/ })
    // A click-handling div is invisible to keyboard and assistive tech.
    expect(work).toHaveAttribute('tabindex', '0')
  })

  it('reports expanded state on rows that can expand', () => {
    renderTree()
    const work = screen.getByRole('treeitem', { name: /Work/ })
    expect(work).toHaveAttribute('aria-expanded')
  })

  it('omits aria-expanded on a row with nothing to expand', () => {
    renderTree({ tree: [{ id: 'l9', type: 'link', name: 'Solo', url: 'https://a.example' }] })
    const leaf = screen.getByRole('treeitem', { name: /Solo/ })
    // Claiming a control that isn't there is worse than saying nothing.
    expect(leaf).not.toHaveAttribute('aria-expanded')
  })

  it('activates a folder row with Enter', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderTree({ onSelect })

    const work = screen.getByRole('treeitem', { name: /Work/ })
    work.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalled()
  })

  it('activates a folder row with Space', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderTree({ onSelect })

    const work = screen.getByRole('treeitem', { name: /Work/ })
    work.focus()
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenCalled()
  })

  it('names the tree itself', () => {
    renderTree()
    expect(screen.getByRole('tree', { name: 'Bookmarks' })).toBeInTheDocument()
  })
})

describe('moving without a pointer', () => {
  it('offers a Move control for every row while editing', () => {
    renderTree()
    // Drag-and-drop has no keyboard equivalent, so this button is the only
    // way to reorder without a mouse.
    expect(screen.getByRole('button', { name: 'Move Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move News' })).toBeInTheDocument()
  })

  it('requests the move dialog when activated by keyboard', async () => {
    const user = userEvent.setup()
    const onMoveRequest = vi.fn()
    renderTree({ onMoveRequest })

    const move = screen.getByRole('button', { name: 'Move News' })
    move.focus()
    await user.keyboard('{Enter}')

    expect(onMoveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'l3', name: 'News' })
    )
  })
})

describe('search shortcut', () => {
  it('focuses search when "/" is pressed', async () => {
    const user = userEvent.setup()
    renderWithI18n(<SearchBar value="" onChange={noop} />)

    await user.keyboard('/')
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })

  it('does not steal "/" while the user is typing in another field', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <>
        <input aria-label="Other field" />
        <SearchBar value="" onChange={noop} />
      </>
    )

    const other = screen.getByRole('textbox', { name: 'Other field' })
    other.focus()
    await user.keyboard('/')

    // "/" is a literal character in a text field; hijacking it there means a
    // URL can't be typed into the link modal.
    expect(document.activeElement).toBe(other)
  })
})

describe('hover-only controls', () => {
  it('reveals card actions on keyboard focus, not only on hover', () => {
    const { container } = renderWithI18n(
      <LinkCard
        node={{ id: 's1', type: 'link', name: 'GitHub', url: 'https://github.com' }}
        editable
        onEdit={noop}
        onRemove={noop}
      />
    )
    // `opacity-0` until hover would leave a focused button invisible.
    const actions = container.querySelector('.group-hover\\:opacity-100')
    expect(actions?.className).toContain('group-focus-within:opacity-100')
  })
})

/**
 * The app-level actions (Settings, Import, Export) and the edit-mode toggle
 * were spread across three places: a bare gear in the header, a pencil on the
 * shortcuts hairline, and a toolbar pinned inside the bookmarks panel. They now
 * sit in two clusters — a header menu for whole-app actions, and the tree's own
 * "Bookmarks" row for the controls that act on bookmarks.
 */
describe('control placement', () => {
  it('runs each header menu item through its own handler', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    const onImport = vi.fn()
    const onExport = vi.fn()
    renderWithI18n(
      <HeaderMenu onOpenSettings={onOpenSettings} onImport={onImport} onExport={onExport} />
    )

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Export bookmarks' }))
    expect(onExport).toHaveBeenCalledOnce()
    expect(onImport).not.toHaveBeenCalled()
    expect(onOpenSettings).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Import bookmarks…' }))
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('opens and closes the header menu from the keyboard alone', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    renderWithI18n(
      <HeaderMenu onOpenSettings={onOpenSettings} onImport={noop} onExport={noop} />
    )

    const trigger = screen.getByRole('button', { name: 'Menu' })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('menuitem', { name: 'Settings…' })).toBeInTheDocument()

    // Escape must both close the menu and hand focus back to the trigger,
    // otherwise a keyboard user is dropped at the top of the document.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menuitem', { name: 'Settings…' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('toggles edit mode from the Bookmarks row, naming both states', async () => {
    const user = userEvent.setup()
    const onToggleEditing = vi.fn()
    const { rerender } = renderTree({ editing: false, onToggleEditing })

    const toggle = screen.getByRole('button', { name: 'Edit shortcuts and bookmarks' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(onToggleEditing).toHaveBeenCalledOnce()

    // The label has to change with the state — a pressed control still named
    // "Edit" tells a screen reader user nothing about how to get back out.
    rerender(
      <I18nProvider locale="en" timeZone="America/New_York">
        <FolderTree
          tree={sampleTree()}
          selectedId={null}
          newTab={false}
          editing
          onEdit={noop}
          onRemove={noop}
          onMove={noop}
          onMoveRequest={noop}
          onSelect={noop}
          rootLabel="Bookmarks"
          onAddRoot={noop}
          onToggleEditing={onToggleEditing}
        />
      </I18nProvider>
    )
    expect(screen.getByRole('button', { name: 'Done editing' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

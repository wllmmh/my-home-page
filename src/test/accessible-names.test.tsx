import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithI18n, testSettings, sampleTree } from './helpers'
import { LinkCard } from '../Cards'
import SearchBar from '../SearchBar'
import Clock from '../Clock'
import HeaderMenu from '../HeaderMenu'
import FolderTree from '../FolderTree'
import { FolderModal, LinkModal, SettingsModal, MoveModal } from '../Modal'

/**
 * Every interactive control must have an accessible name.
 *
 * This is the regression net for the largest class of bug found in the audit:
 * icon-only buttons that carried only a `title`, which is not a reliable
 * accessible name. `getByRole(name)` resolves the name the same way a screen
 * reader does, so these fail if the label is dropped or reverts to `title`.
 */

const noop = () => {}

/** Fails if any button/link in the container has an empty accessible name. */
function expectEveryControlNamed(container: HTMLElement) {
  const controls = [
    ...container.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea'),
  ]
  expect(controls.length).toBeGreaterThan(0)

  const unnamed = controls.filter((el) => {
    // The accessible name comes from aria-label, aria-labelledby, an
    // associated <label>, or the element's own text — but never from `title`
    // alone, which is what the audit found being relied on.
    const ariaLabel = el.getAttribute('aria-label')?.trim()
    const labelledBy = el.getAttribute('aria-labelledby')
    const labelled =
      labelledBy &&
      labelledBy
        .split(/\s+/)
        .some((id) => container.ownerDocument.getElementById(id)?.textContent?.trim())
    const id = el.getAttribute('id')
    const explicitLabel =
      id && container.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)
    const wrappingLabel = el.closest('label')
    const text = el.textContent?.trim()
    return !(ariaLabel || labelled || explicitLabel || wrappingLabel || text)
  })

  expect(
    unnamed.map((el) => `${el.tagName.toLowerCase()}[title=${el.getAttribute('title')}]`)
  ).toEqual([])
}

describe('shortcut cards', () => {
  it('names the edit and delete buttons after the shortcut they act on', () => {
    renderWithI18n(
      <LinkCard
        node={{ id: 's1', type: 'link', name: 'GitHub', url: 'https://github.com' }}
        editable
        editing
        onEdit={noop}
        onRemove={noop}
      />
    )

    // Not just "Edit" — a grid of these must be distinguishable by name alone.
    expect(screen.getByRole('button', { name: 'Edit GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete GitHub' })).toBeInTheDocument()
  })

  it('leaves the favicon out of the accessible name', () => {
    renderWithI18n(
      <LinkCard
        node={{ id: 's1', type: 'link', name: 'GitHub', url: 'https://github.com' }}
        onEdit={noop}
        onRemove={noop}
      />
    )
    // A decorative image must have empty alt, or the link is announced twice.
    const img = document.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
  })
})

describe('search bar', () => {
  it('labels the input without relying on the placeholder', () => {
    renderWithI18n(<SearchBar value="" onChange={noop} />)
    // Resolves through the <label for>, not the placeholder.
    const input = screen.getByRole('searchbox', { name: 'Search bookmarks' })
    expect(input).toBeInTheDocument()
  })

  it('names the clear button', () => {
    renderWithI18n(<SearchBar value="abc" onChange={noop} />)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })
})

describe('clock', () => {
  it('renders the greeting for a plain settings object', () => {
    renderWithI18n(<Clock settings={testSettings()} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('header menu', () => {
  it('names the header menu trigger and marks it as opening a menu', () => {
    renderWithI18n(
      <HeaderMenu onOpenSettings={noop} onImport={noop} onExport={noop} />
    )
    const trigger = screen.getByRole('button', { name: 'Menu' })
    expect(trigger).toHaveAttribute('aria-haspopup')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the menu with settings and the data actions', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <HeaderMenu onOpenSettings={noop} onImport={noop} onExport={noop} />
    )

    await user.click(screen.getByRole('button', { name: 'Menu' }))

    expect(await screen.findByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Import bookmarks' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Export bookmarks' })).toBeInTheDocument()
  })
})

describe('folder tree', () => {
  const renderTree = (editing = true) =>
    renderWithI18n(
      <FolderTree
        tree={sampleTree()}
        selectedId={null}
        newTab={false}
        editing={editing}
        onEdit={noop}
        onRemove={noop}
        onMove={noop}
        onMoveRequest={noop}
        onSelect={noop}
        rootLabel="Bookmarks"
        onAddRoot={noop}
      />
    )

  it('names every row action after its row', () => {
    renderTree()
    expect(screen.getByRole('button', { name: 'Rename Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Work' })).toBeInTheDocument()
    // A link row renames as "Edit", a folder as "Rename".
    expect(screen.getByRole('button', { name: 'Edit News' })).toBeInTheDocument()
  })

  it('has no per-folder add buttons, and the root add buttons name the active folder', () => {
    const { rerender } = renderTree()
    expect(screen.queryByRole('button', { name: /^Add (folder|bookmark) in/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument()

    rerender(
      <FolderTree
        tree={sampleTree()}
        selectedId="f1"
        newTab={false}
        editing
        onEdit={noop}
        onRemove={noop}
        onMove={noop}
        onMoveRequest={noop}
        onSelect={noop}
        rootLabel="Bookmarks"
        onAddRoot={noop}
      />
    )
    expect(screen.getByRole('button', { name: 'Add folder in Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add bookmark in Work' })).toBeInTheDocument()
  })

  it('leaves no control unnamed', () => {
    const { container } = renderTree()
    expectEveryControlNamed(container)
  })
})

describe('modals', () => {
  it('associates every settings field with its label', () => {
    renderWithI18n(
      <SettingsModal initial={testSettings()} onSave={noop} onClose={noop} />
    )

    // Each resolves only if <label for> / id are wired up.
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Date format' })).toBeInTheDocument()
  })

  it('groups the segmented controls under a shared legend', () => {
    renderWithI18n(
      <SettingsModal initial={testSettings()} onSave={noop} onClose={noop} />
    )
    // <fieldset><legend> gives the set of buttons one name.
    const group = screen.getByRole('group', { name: 'Glass effect' })
    expect(within(group).getByRole('button', { name: 'On' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Off' })).toBeInTheDocument()
  })

  it('exposes segmented selection as aria-pressed, not colour alone', () => {
    renderWithI18n(
      <SettingsModal initial={testSettings({ glass: true })} onSave={noop} onClose={noop} />
    )
    const group = screen.getByRole('group', { name: 'Glass effect' })
    expect(within(group).getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('names and marks the icon swatches in the folder modal', () => {
    renderWithI18n(<FolderModal onSave={noop} onClose={noop} />)
    const group = screen.getByRole('group', { name: 'Icon' })
    const swatches = within(group).getAllByRole('button')
    expect(swatches.length).toBeGreaterThan(1)
    // Selection is conveyed programmatically, and exactly one is selected.
    expect(swatches.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    for (const b of swatches) {
      expect(b.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('labels the link modal fields', () => {
    renderWithI18n(<LinkModal onSave={noop} onClose={noop} />)
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeInTheDocument()
  })

  it('labels the move dialog destination picker', () => {
    renderWithI18n(
      <MoveModal
        node={{ id: 'l3', type: 'link', name: 'News', url: 'https://news.example.com' }}
        tree={sampleTree()}
        onMove={noop}
        onClose={noop}
      />
    )
    expect(screen.getByRole('combobox', { name: 'Destination folder' })).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { axe } from 'vitest-axe'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithI18n, testSettings, sampleTree } from './helpers'
import { LinkCard } from '../Cards'
import SearchBar from '../SearchBar'
import Clock from '../Clock'
import HeaderMenu from '../HeaderMenu'
import FolderTree from '../FolderTree'
import { FolderModal, LinkModal, SettingsModal, MoveModal } from '../Modal'

/**
 * Automated WCAG scans.
 *
 * axe catches the mechanical violations — an unlabelled control, a broken
 * aria reference, a role missing a required property — across every screen,
 * including in a right-to-left locale where the markup is the same but the
 * direction is not. It is a floor, not a ceiling: the behavioural properties
 * (focus trapping, keyboard reachability) are covered by the other suites.
 */

const noop = () => {}

const screens = {
  'shortcut card': (
    <LinkCard
      node={{ id: 's1', type: 'link', name: 'GitHub', url: 'https://github.com' }}
      editable
      editing
      onEdit={noop}
      onRemove={noop}
    />
  ),
  'search bar': <SearchBar value="" onChange={noop} />,
  clock: <Clock settings={testSettings()} />,
  'folder tree': (
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
    />
  ),
  'folder modal': <FolderModal onSave={noop} onClose={noop} />,
  'link modal': <LinkModal onSave={noop} onClose={noop} />,
  'settings modal': <SettingsModal initial={testSettings()} onSave={noop} onClose={noop} />,
  'move modal': (
    <MoveModal
      node={{ id: 'l3', type: 'link', name: 'News', url: 'https://news.example.com' }}
      tree={sampleTree()}
      onMove={noop}
      onClose={noop}
    />
  ),
}

describe('axe: left-to-right', () => {
  for (const [name, ui] of Object.entries(screens)) {
    it(`${name} has no violations`, async () => {
      const { container } = renderWithI18n(ui)
      expect(await axe(container)).toHaveNoViolations()
    })
  }
})

describe('axe: right-to-left', () => {
  // Same markup, `dir="rtl"` — this is where a hardcoded physical property or
  // a direction-dependent label mistake shows up.
  for (const [name, ui] of Object.entries(screens)) {
    it(`${name} has no violations in Arabic`, async () => {
      const { container } = renderWithI18n(ui, { locale: 'ar' })
      expect(await axe(container)).toHaveNoViolations()
    })
  }
})

/**
 * The header menu's popup renders through a portal, so it is not inside the
 * `container` the scans above walk — and it does not exist at all until the
 * trigger is used. Opened and scanned separately, in both directions.
 */
describe('axe: header menu popup', () => {
  for (const locale of ['en', 'ar']) {
    it(`has no violations when open (${locale})`, async () => {
      const user = userEvent.setup()
      renderWithI18n(
        <HeaderMenu onOpenSettings={noop} onImport={noop} onExport={noop} />,
        { locale }
      )
      await user.click(screen.getByRole('button'))
      const popup = (await screen.findAllByRole('menuitem'))[0].closest('[role="menu"]')
      // Guards the scan against silently passing on a node that was never
      // found — an empty element has no violations either.
      expect(popup!.querySelectorAll('[role="menuitem"]')).toHaveLength(3)
      expect(await axe(popup as HTMLElement)).toHaveNoViolations()
    })
  }
})

/**
 * Same reasoning as the header menu above: the card's narrow-width overflow
 * trigger opens a portaled popup that the `screens` scan at the top of this
 * file never sees, because it only exists once a viewer opens it.
 */
describe('axe: card actions menu popup', () => {
  for (const locale of ['en', 'ar']) {
    it(`has no violations when open (${locale})`, async () => {
      const user = userEvent.setup()
      renderWithI18n(
        <LinkCard
          node={{ id: 's1', type: 'link', name: 'GitHub', url: 'https://github.com' }}
          editable
          editing
          onEdit={noop}
          onRemove={noop}
        />,
        { locale }
      )
      // Locale-independent: `name` would need Arabic text here, unlike the
      // header menu's fixed "Menu" trigger. `aria-haspopup` is unique to the
      // menu trigger among this card's buttons (Edit/Delete are plain).
      const trigger = document.querySelector('button[aria-haspopup]') as HTMLElement
      await user.click(trigger)
      const popup = (await screen.findAllByRole('menuitem'))[0].closest('[role="menu"]')
      expect(popup!.querySelectorAll('[role="menuitem"]')).toHaveLength(2)
      expect(await axe(popup as HTMLElement)).toHaveNoViolations()
    })
  }
})

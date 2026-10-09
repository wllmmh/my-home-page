import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FolderTree from '../FolderTree'
import { renderWithI18n } from './helpers'
import type { TreeNode } from '../types'

const tree: TreeNode[] = [
  {
    id: 'f1', type: 'folder', name: 'Work', icon: 'folder',
    children: [
      { id: 'l1', type: 'link', name: 'A', url: 'https://a.com' },
      { id: 'f2', type: 'folder', name: 'Deep', icon: 'folder', children: [{ id: 'l2', type: 'link', name: 'B', url: 'https://b.com' }] },
      { id: 'l3', type: 'link', name: 'C', url: 'https://c.com' },
    ],
  },
  { id: 'f3', type: 'folder', name: 'Empty', icon: 'folder', children: [] },
]

function setup() {
  const onEdit = vi.fn()
  const onRemove = vi.fn()
  renderWithI18n(
    <FolderTree
      tree={tree} selectedId={null} newTab={false}
      onEdit={onEdit} onRemove={onRemove} onMove={vi.fn()} onMoveRequest={vi.fn()}
      onSelect={vi.fn()} rootLabel="Bookmarks" onAddRoot={vi.fn()}
    />
  )
  return { onEdit, onRemove }
}

const rowOf = (name: string) => screen.getByText(name).closest('[data-folder-row]')!

describe('folder context menu', () => {
  it('opens all of a folder’s own bookmarks in new tabs, not subfolders’', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    setup()
    fireEvent.contextMenu(rowOf('Work'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open all in new tabs' }))
    expect(open.mock.calls.map((c) => c[0])).toEqual(['https://a.com', 'https://c.com'])
    open.mockRestore()
  })

  it('edits and deletes the right-clicked folder', async () => {
    const { onEdit, onRemove } = setup()
    fireEvent.contextMenu(rowOf('Work'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename / change icon' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }))

    fireEvent.contextMenu(rowOf('Work'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(onRemove).toHaveBeenCalledWith('f1')
  })

  it('disables opening tabs for a folder with no bookmarks', async () => {
    setup()
    fireEvent.contextMenu(rowOf('Empty'))
    expect(await screen.findByRole('menuitem', { name: 'Open all in new tabs' })).toHaveAttribute('aria-disabled', 'true')
  })
})

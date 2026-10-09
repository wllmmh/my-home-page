import { describe, it, expect } from 'vitest'
import { mergeNodes } from '../store'
import type { TreeNode } from '../types'

const link = (url: string, id = url): TreeNode => ({ id, type: 'link', name: url, url })
const folder = (name: string, children: TreeNode[], id = name): TreeNode => ({
  id, type: 'folder', name, icon: 'folder', children,
})

describe('mergeNodes', () => {
  it('skips links whose URL is already in the same directory', () => {
    const merged = mergeNodes([link('https://a.com')], [link('https://a.com', 'new'), link('https://b.com')])
    expect(merged.map((n) => n.id)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('drops duplicates within the incoming set', () => {
    expect(mergeNodes([], [link('https://a.com', '1'), link('https://a.com', '2')])).toHaveLength(1)
  })

  it('allows the same URL in different directories', () => {
    const merged = mergeNodes([link('https://a.com')], [folder('F', [link('https://a.com', 'x')])])
    expect(merged).toHaveLength(2)
  })

  it('merges same-named folders and dedupes inside them', () => {
    const merged = mergeNodes(
      [folder('F', [link('https://a.com')])],
      [folder('F', [link('https://a.com', 'x'), link('https://b.com')], 'new')],
    )
    expect(merged).toHaveLength(1)
    const f = merged[0]
    expect(f.type === 'folder' && f.id).toBe('F')
    expect(f.type === 'folder' && f.children.map((c) => c.type === 'link' && c.url)).toEqual(['https://a.com', 'https://b.com'])
  })
})

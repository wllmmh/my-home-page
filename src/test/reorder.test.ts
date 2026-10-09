import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTree } from '../store'

beforeEach(() => localStorage.clear())

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id)

function setup() {
  const hook = renderHook(() => useTree())
  const link = (id: string) => ({ id, type: 'link' as const, name: id, url: `https://${id}.com` })
  act(() => {
    hook.result.current.addNode(null, link('a'))
    hook.result.current.addNode(null, link('b'))
    hook.result.current.addNode(null, link('c'))
  })
  return hook
}

describe('moveNode with an anchor', () => {
  it('reorders before and after a sibling', () => {
    const { result } = setup()
    const base = ids(result.current.tree) // default bookmark first
    act(() => result.current.moveNode('c', null, { id: 'a', after: false }))
    expect(ids(result.current.tree)).toEqual([...base.slice(0, -3), 'c', 'a', 'b'])
    act(() => result.current.moveNode('c', null, { id: 'b', after: true }))
    expect(ids(result.current.tree)).toEqual([...base.slice(0, -3), 'a', 'b', 'c'])
  })

  it('ignores a move anchored to itself', () => {
    const { result } = setup()
    const before = ids(result.current.tree)
    act(() => result.current.moveNode('b', null, { id: 'b', after: true }))
    expect(ids(result.current.tree)).toEqual(before)
  })
})

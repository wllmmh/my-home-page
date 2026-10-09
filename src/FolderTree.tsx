import { useEffect, useRef, useState, type DragEvent, type ReactElement, type RefObject } from 'react'
import { getIcon } from './icons'
import { FolderPlusIcon, PencilIcon, PencilSquareIcon, CheckIcon, TrashIcon, ArrowsUpDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { BookmarkSimpleIcon } from '@phosphor-icons/react'
import { Highlighted } from './highlight'
import { useI18n } from './i18n'
import {
  TreeProvider, TreeView, TreeNode, TreeNodeTrigger, TreeNodeContent,
  TreeExpander, TreeIcon, TreeLabel, TreeLines,
} from '@/components/kibo-ui/tree'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
} from '@/components/ui/context-menu'
import type { TreeNode as BookmarkNode } from './types'
import { findPath, type Anchor } from './store'

const DND_MIME = 'application/x-myhomepage-node-id'

/**
 * Where a drag is hovering on a row: `before`/`after` reorder next to it,
 * `into` (folders only) files the dragged node inside it.
 */
type DropZone = 'before' | 'into' | 'after'
interface DragOver {
  id: string
  zone: DropZone
}

function zoneAt(e: DragEvent, isFolder: boolean): DropZone {
  const { top, height } = e.currentTarget.getBoundingClientRect()
  const y = (e.clientY - top) / height
  // A folder keeps its middle for "drop inside"; a link has nothing to drop
  // into, so it splits evenly between above and below.
  if (!isFolder) return y < 0.5 ? 'before' : 'after'
  return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'
}


const ZONE_CLS: Record<DropZone, string> = {
  into: 'bg-primary/10 ring-1 ring-inset ring-primary',
  before: 'shadow-[inset_0_2px_0_0_var(--color-primary)]',
  after: 'shadow-[inset_0_-2px_0_0_var(--color-primary)]',
}

interface DragHandlerProps {
  draggable: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

/** Must match the `indent` given to TreeProvider below. */
const INDENT = 20

/**
 * Row action button. A folder row in edit mode can show up to five of these
 * at once (add folder, add link, move, rename, delete) on a row that is also
 * pushed over by its nesting level — `rootBtnCls`'s full 16px-per-side
 * padding would need close to 200px just for buttons, which a nested or
 * narrow row does not have.
 *
 * `size-6` (24px) stays the visual box, same as before. `p-1 -my-1` grows the
 * *tap* target to 32px without widening the row's own footprint: the row's
 * `py-2` (8px) already exists to clear the 24px button, so 4px of that is
 * reclaimed as hit area on each side rather than left as dead space — safe
 * for the same reason `rootBtnCls`'s larger version is (see below): the
 * padding eats into the row's own whitespace, not into a sibling row's box.
 * Horizontally, `gap-0.5` is replaced by the buttons' own padding doing that
 * job — 8px between adjacent 32px targets, still clearing the 8px touch
 * spacing minimum, in under half the width the full 40px treatment needs.
 *
 * The padding lives on the *outer* element only — `hover:bg-border` is not
 * here, because a background on a padded box paints the padding too. That
 * made the hover state itself look wrong: a highlighted square bigger than
 * the icon, with visible empty space between the icon and the highlight's
 * own edge, and that edge landing wherever the padding happened to end
 * rather than at any intentional inset. `rowInnerCls` below carries the
 * visible 24px box and its hover treatment instead, so what lights up on
 * hover is exactly the icon's own square — the padding stays purely for hit
 * area and is never itself painted.
 *
 * `group/btn` — a *named* group — rather than a plain `group`: the row itself
 * is also a `group` (see the folder row and root row below, used to reveal
 * this whole button cluster on row hover), and Tailwind's `group-hover:`
 * matches *any* ancestor `.group` being hovered, not just the nearest one.
 * With a plain `group` here, hovering anywhere on the row lit up every
 * button's inner box at once instead of just the one under the pointer.
 * Naming this group scopes `group-hover/btn:` to this button alone.
 */
const rowBtnCls = 'group/btn flex size-6 -my-1 box-content items-center justify-center p-1'
const rowInnerCls =
  'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover/btn:bg-border group-hover/btn:text-foreground [&_svg]:size-3.5'

/**
 * Root-row action button — the controls reached most often, so the hit area
 * clears the 40px touch target rather than only WCAG's 24px floor.
 *
 * Same split as `rowBtnCls` above, at the larger size: this outer element is
 * unpainted hit area only (`size-6` + `p-2` box-content padding = 40px),
 * `rootInnerCls` is the visible 24px box that actually takes the hover tint.
 * Only the *vertical* padding is cancelled by a negative margin: `-my-2`
 * keeps the row's height exactly as it was, but the horizontal padding is left
 * to stand, because that is what separates one button's target from the next.
 * Cancelling it too (`-m-2`) would overlap adjacent 40px targets by 14px and
 * make taps near a boundary land on the wrong control.
 *
 * `group/btn`, not a plain `group`: same reasoning as `rowBtnCls` above — the
 * root row is itself a `group`, and an unnamed `group-hover:` here would
 * match that ancestor too, lighting up all three root buttons together on
 * any row hover instead of individually.
 */
const rootBtnCls = 'group/btn flex size-6 -my-2 box-content items-center justify-center p-2'
const rootInnerCls =
  'flex size-6 items-center justify-center rounded-md text-foreground transition-colors group-hover/btn:bg-border [&_svg]:size-3.5'

/** ids of every node that matches `query` by name, plus all of their ancestors. */
function matchIds(nodes: BookmarkNode[], query: string, ancestors: string[] = []): Set<string> {
  const ids = new Set<string>()
  for (const node of nodes) {
    const isMatch = node.name.toLowerCase().includes(query.toLowerCase())
    if (isMatch) {
      ids.add(node.id)
      ancestors.forEach((a) => ids.add(a))
    }
    if (node.type === 'folder' && node.children.length > 0) {
      const childIds = matchIds(node.children, query, [...ancestors, node.id])
      if (childIds.size > 0) {
        ids.add(node.id)
        ancestors.forEach((a) => ids.add(a))
      }
      childIds.forEach((id) => ids.add(id))
    }
  }
  return ids
}

/**
 * Keeps only the innermost pinned folder header stuck.
 *
 * A sticky row's range spans its whole subtree, so nesting alone leaves every
 * ancestor pinned at the top, stacked on each other. CSS can't express "yield
 * to a deeper row" — the parent has no way to know where the child starts —
 * so measure on scroll: whichever folder rows are currently pinned, keep the
 * deepest and release the rest by dropping them back to `position: static`,
 * which lets them scroll away normally.
 */
function useInnermostSticky(scrollRef: RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useEffect(() => {
    const panel = scrollRef.current
    if (!panel) return

    const sync = () => {
      const top = panel.getBoundingClientRect().top
      const rows = [...panel.querySelectorAll<HTMLElement>('[data-folder-row]')]
      if (rows.length === 0) return

      // A pinned sticky row reports the panel top as its position, which makes
      // every pinned ancestor look identical. Drop them all to static first to
      // read each row's *natural* flow position, which is what says whether it
      // has scrolled past the top and which one is deepest.
      for (const el of rows) el.style.position = 'static'
      const natural = rows.map((el) => el.getBoundingClientRect().top - top)

      // Rows are in document order, so among those scrolled to/past the top,
      // the last one is the innermost folder currently being scrolled through.
      let winner = -1
      for (let i = 0; i < rows.length; i++) if (natural[i] <= 0) winner = i

      // Only that row sticks. Losers need an explicit `static`: clearing the
      // inline style would fall back to the `sticky` class and re-pin them.
      // `data-stuck` drives the row's backdrop (see index.css) — only the row
      // actually pinned at top needs to hide content scrolling under it, so
      // folder rows in normal flow stay transparent like bookmark rows.
      for (let i = 0; i < rows.length; i++) {
        rows[i].style.position = i === winner ? 'sticky' : 'static'
        rows[i].toggleAttribute('data-stuck', i === winner)
      }
    }

    sync()
    panel.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(panel)
    return () => {
      panel.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, deps)
}

/**
 * Right-click (or the keyboard's context-menu key / long-press) menu for a
 * folder or bookmark row. `trigger` is the row itself, rendered as the menu's
 * trigger rather than wrapped in another element, so the row stays a direct
 * child of its tree node — wrapping it would end its sticky range at the
 * wrapper.
 */
function NodeMenu({
  node,
  trigger,
  onEdit,
  onRemove,
  onAddIn,
}: {
  node: BookmarkNode
  trigger: ReactElement
  onEdit: (node: BookmarkNode) => void
  onRemove: (id: string) => void
  /** Add a folder/link inside this folder. Folders only. */
  onAddIn?: (kind: 'folder' | 'link', folderId: string) => void
}) {
  const { t } = useI18n()
  // For a folder, shallow on purpose: only its own bookmarks, not its
  // subfolders'.
  const urls = node.type === 'link'
    ? [node.url]
    : node.children.flatMap((c) => (c.type === 'link' ? [c.url] : []))

  return (
    <ContextMenu>
      <ContextMenuTrigger render={trigger} />
      <ContextMenuContent>
        <ContextMenuItem
          disabled={urls.length === 0}
          onClick={() => urls.forEach((url) => window.open(url, '_blank', 'noopener,noreferrer'))}
        >
          <ArrowTopRightOnSquareIcon />
          {node.type === 'link' ? t.openInNewTab : t.openAllInNewTabs}
        </ContextMenuItem>
        {node.type === 'folder' && onAddIn && (
          <>
            <ContextMenuItem onClick={() => onAddIn('link', node.id)}>
              <BookmarkSimpleIcon />
              {t.newBookmark}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAddIn('folder', node.id)}>
              <FolderPlusIcon />
              {t.newFolder}
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem onClick={() => onEdit(node)}>
          <PencilIcon />
          {node.type === 'link' ? t.edit : t.renameOrChangeIcon}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onRemove(node.id)}>
          <TrashIcon />
          {t.delete}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function Row({
  node,
  query,
  editing,
  onEdit,
  onRemove,
  onMoveRequest,
}: {
  node: BookmarkNode
  query: string
  editing: boolean
  onEdit: (node: BookmarkNode) => void
  onRemove: (id: string) => void
  onMoveRequest: (node: BookmarkNode) => void
}) {
  const { t } = useI18n()
  const folderNode = node.type === 'folder' ? node : null
  const isFolder = folderNode !== null
  const hasChildren = isFolder && folderNode.children.length > 0
  const Icon = isFolder ? getIcon(folderNode.icon) : BookmarkSimpleIcon

  return (
    <>
      <TreeExpander hasChildren={hasChildren} />
      <TreeIcon icon={<Icon className="size-4" />} hasChildren={hasChildren} />
      <TreeLabel><Highlighted text={node.name} query={query} /></TreeLabel>
      {editing && (
        <span className="ms-2 flex shrink-0 items-center">
          {/* The keyboard path to what dragging does with a mouse. It lives in
              the edit affordance rather than always-on so the row stays quiet,
              and it is the only way to reorder without a pointer. */}
          <button
            type="button"
            title={t.moveNamed(node.name)}
            aria-label={t.moveNamed(node.name)}
            className={rowBtnCls}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveRequest(node) }}
          ><span className={rowInnerCls}><ArrowsUpDownIcon /></span></button>
          <button
            type="button"
            title={isFolder ? t.rename : t.edit}
            aria-label={isFolder ? t.renameNamed(node.name) : t.editNamed(node.name)}
            className={rowBtnCls}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(node) }}
          ><span className={rowInnerCls}><PencilIcon /></span></button>
          <button
            type="button"
            title={t.delete}
            aria-label={t.deleteNamed(node.name)}
            className={rowBtnCls}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(node.id) }}
          ><span className={rowInnerCls}><TrashIcon /></span></button>
        </span>
      )}
    </>
  )
}

interface NodesProps {
  nodes: BookmarkNode[]
  parentId?: string | null
  level: number
  query: string
  visible: Set<string> | null
  newTab: boolean
  selectedId: string | null
  editing: boolean
  onEdit: (node: BookmarkNode) => void
  onRemove: (id: string) => void
  onMove: (id: string, targetId: string | null, anchor?: Anchor) => void
  onMoveRequest: (node: BookmarkNode) => void
  onAddIn?: (kind: 'folder' | 'link', folderId: string) => void
  draggingId: string | null
  dragOver: DragOver | null
  setDragOver: (v: DragOver | null | ((cur: DragOver | null) => DragOver | null)) => void
  onDragging: (id: string | null) => void
}

function Nodes({ nodes, parentId = null, level, query, visible, newTab, selectedId, editing, onEdit, onRemove, onMove, onMoveRequest, onAddIn, draggingId, dragOver, setDragOver, onDragging }: NodesProps) {
  const shown = query ? nodes.filter((n) => visible?.has(n.id)) : nodes

  return shown.map((node, i) => {
    const folderNode = node.type === 'folder' ? node : null
    const isFolder = folderNode !== null
    const hasChildren = isFolder && folderNode.children.length > 0
    const isLast = i === shown.length - 1
    // No highlight when dragging a node over itself.
    const isSelf = draggingId === node.id
    const zone = dragOver?.id === node.id && !isSelf ? dragOver.zone : null
    const zoneCls = zone ? ZONE_CLS[zone] : ''

    const dragProps = {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(DND_MIME, node.id)
        onDragging(node.id)
      },
      onDragEnd: () => onDragging(null),
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DND_MIME)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        const next = zoneAt(e, isFolder)
        setDragOver((cur) => (cur?.id === node.id && cur.zone === next ? cur : { id: node.id, zone: next }))
      },
      onDragLeave: (e: DragEvent) => {
        e.stopPropagation()
        setDragOver((cur) => (cur?.id === node.id ? null : cur))
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(null)
        const draggedId = e.dataTransfer.getData(DND_MIME)
        if (!draggedId || draggedId === node.id) return
        const dropZone = zoneAt(e, isFolder)
        if (dropZone === 'into') onMove(draggedId, node.id)
        else onMove(draggedId, parentId, { id: node.id, after: dropZone === 'after' })
      },
    }

    return (
      <TreeNode key={node.id} nodeId={node.id} level={level} isLast={isLast}>
        {folderNode ? (
          <NodeMenu
            node={folderNode}
            onEdit={onEdit}
            onRemove={onRemove}
            onAddIn={onAddIn}
            trigger={
          <TreeNodeTrigger
            // Sticky so the folder you're scrolling through keeps its header
            // in view. A parent's sticky range spans its whole subtree, so at
            // top:0 it would stay pinned under the child rather than handing
            // over. Pinning each level one row higher (-level * ROW_H) scrolls
            // the ancestor up and out of the panel exactly as the child's row
            // arrives at the top, so only the folder being scrolled is
            // visible. Deeper rows sit above ancestors during the handoff.
            hasChildren={hasChildren}
            data-folder-row={node.id}
            // Selection is marked with a data attribute so the stylesheet can
            // give it the same translucent tint as a hovered/bookmark row;
            // TreeNodeTrigger's own `bg-accent/80` is a translucent
            // background-color in Tailwind's `utilities` layer, which beats
            // any specificity in `components`, so it's overridden by CSS in
            // index.css keyed off `data-selected` instead.
            data-selected={selectedId === node.id ? '' : undefined}
            className={`sticky folder-sticky -mx-3 rounded-none ${zoneCls}`}
            // TreeNodeTrigger spreads props after its own style, so passing
            // `style` here replaces its padding — restate the indent.
            // +12 compensates for the -mx-3 (12px) escape of the panel's own
            // px-3 padding, so indentation still lines up despite the row now
            // spanning the full panel width.
            //
            // No backgroundColor here: a folder row is transparent like a
            // bookmark row by default, gets the same translucent tint on
            // hover/selection, and only gains the opaque `--sticky-row-bg`
            // backdrop while actually pinned (`data-stuck`, set by
            // useInnermostSticky above) — see index.css.
            style={{
              top: 0,
              zIndex: 10 + level,
              paddingInlineStart: level * INDENT + 8 + 12,
            }}
            {...(dragProps as DragHandlerProps)}
          >
            <Row node={node} query={query} editing={editing} onEdit={onEdit} onRemove={onRemove} onMoveRequest={onMoveRequest} />
          </TreeNodeTrigger>
            }
          />
        ) : node.type === 'link' && (
          <NodeMenu
            node={node}
            onEdit={onEdit}
            onRemove={onRemove}
            trigger={
          <a
            href={node.url}
            title={node.url}
            // A link row is a leaf of the tree, so it has to be a `treeitem`
            // for the `role="tree"` above to be valid. The <a> keeps its href,
            // so it still opens, is still middle-clickable, and still shows
            // its target in the status bar.
            role="treeitem"
            className={`group relative -mx-3 flex cursor-pointer items-center rounded-none px-3 py-2 no-underline transition-all duration-200 hover:bg-accent/50 ${
              zoneCls
            }`}
            style={{ paddingInlineStart: level * 20 + 8 + 12 }}
            {...(newTab && { target: '_blank', rel: 'noopener noreferrer' })}
            {...dragProps}
          >
            <TreeLines />
            <Row node={node} query={query} editing={editing} onEdit={onEdit} onRemove={onRemove} onMoveRequest={onMoveRequest} />
          </a>
            }
          />
        )}
        {hasChildren && folderNode && (
          <TreeNodeContent hasChildren={hasChildren}>
            <Nodes
              nodes={folderNode.children}
              parentId={node.id}
              draggingId={draggingId}
              level={level + 1}
              query={query}
              visible={visible}
              newTab={newTab}
              selectedId={selectedId}
              editing={editing}
              onEdit={onEdit}
              onRemove={onRemove}
              onMove={onMove}
              onMoveRequest={onMoveRequest}
              onAddIn={onAddIn}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDragging={onDragging}
            />
          </TreeNodeContent>
        )}
      </TreeNode>
    )
  })
}

/**
 * Renders the whole folder/link tree at once (kibo-ui Tree, expand-in-place)
 * instead of drilling into one folder at a time — so Clock/SearchBar/Shortcuts
 * above it never have to be hidden to show folder contents.
 *
 * When `query` is set, only matching nodes (and their ancestor folders) are
 * shown, matching folders are force-expanded, and the matched substring is
 * highlighted. Clearing the query reverts to the user's own expand/collapse
 * state.
 */
export default function FolderTree({
  tree,
  query = '',
  selectedId,
  newTab,
  editing = false,
  onEdit,
  onRemove,
  onMove,
  onMoveRequest,
  onSelect,
  rootLabel,
  onAddRoot,
  onAddIn,
  onToggleEditing,
}: {
  tree: BookmarkNode[]
  query?: string
  selectedId: string | null
  newTab: boolean
  /** While true, every row's edit/delete buttons show without needing a hover. */
  editing?: boolean
  onEdit: (node: BookmarkNode) => void
  onRemove: (id: string) => void
  onMove: (id: string, targetId: string | null, anchor?: Anchor) => void
  /** Open the "Move to…" dialog — the keyboard alternative to dragging. */
  onMoveRequest: (node: BookmarkNode) => void
  onSelect: (id: string | null) => void
  /** Name of the synthetic root row shown above the tree (e.g. "Bookmarks"). */
  rootLabel?: string
  /** Add a folder/link to the active folder (see `selectedId`), from the root row's buttons. */
  onAddRoot?: (kind: 'folder' | 'link') => void
  /** Add a folder/link inside a specific folder, from its context menu. */
  onAddIn?: (kind: 'folder' | 'link', folderId: string) => void
  /** Flip `editing` on and off. The toggle sits on the root row because the
      mode it controls covers this tree as well as the shortcut grid above. */
  onToggleEditing?: () => void
}) {
  const { t } = useI18n()
  const trimmedQuery = query.trim()
  const visible = trimmedQuery ? matchIds(tree, trimmedQuery) : null
  const hasResults = !trimmedQuery || (visible?.size ?? 0) > 0
  const [dragOver, setDragOver] = useState<DragOver | null>(null)
  const [rootDragOver, setRootDragOver] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)  // id of the node being dragged
  const scrollRef = useRef<HTMLDivElement>(null)
  useInnermostSticky(scrollRef, [tree, trimmedQuery])
  // Same resolver the real folder rows use, so the root reads as one of them.
  const RootIcon = getIcon('folder')
  const activeFolder = selectedId ? findPath(tree, selectedId)?.at(-1) : undefined

  const rootDropProps = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_MIME)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setRootDragOver(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setRootDragOver(false)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setRootDragOver(false)
      const draggedId = e.dataTransfer.getData(DND_MIME)
      if (draggedId) onMove(draggedId, null)
    },
  }

  return (
    <TreeProvider
      // Remount on query change so search-driven auto-expand doesn't
      // fight with (and isn't left behind by) the user's manual toggles.
      key={trimmedQuery}
      defaultExpandedIds={trimmedQuery && visible ? [...visible] : []}
      selectedIds={selectedId ? [selectedId] : []}
      // Clicking the active folder again toggles its expansion but keeps it
      // active; the root row is how you go back to the top level.
      onSelectionChange={(ids) => { if (ids[0]) onSelect(ids[0]) }}
      showLines
      indent={INDENT}
      animateExpand={!trimmedQuery}
    >
      <div {...rootDropProps} className="flex min-h-0 flex-1 flex-col">
        {rootLabel && (
          // The synthetic root: named like a folder and sitting above the
          // scroll area, so the tree reads as living *inside* "Bookmarks".
          // It's also the drop target for "move to top level", so the drop
          // strip below only appears as a fallback hint.
          //
          // `pe-1`, not `pe-3`: the trailing buttons carry 16px of their own
          // padding, so 4px more reaches the same 20px inset as other rows.
          <div
            {...rootDropProps}
            title={t.dropToTopLevel}
            className={`group flex shrink-0 items-center py-2.5 pe-1 transition-colors ${
              rootDragOver ? 'bg-primary/10 ring-1 ring-inset ring-primary' : ''
            }`}
            // One INDENT less than a level-0 folder row (INDENT * 0 + 8 + 12),
            // so level-0 children read as nested under it. The spacer below
            // matches TreeExpander's box so the icons still line up.
            style={{ paddingInlineStart: 8 + 12 - INDENT }}
          >
            <span className="me-1 h-4 w-4 shrink-0" />
            {/* Making the top level the active folder again. A real button so
                it is reachable by keyboard; it takes the row's free space so
                the whole label area is clickable. */}
            <button
              type="button"
              aria-pressed={selectedId === null}
              className="flex min-w-0 flex-1 cursor-pointer items-center text-start"
              onClick={() => onSelect(null)}
            >
              <RootIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="ms-1.5 flex-1 truncate text-sm font-medium">{rootLabel}</span>
            </button>
            {/* The root row is now the primary control cluster for bookmarks.
                No `gap` or start margin here: each button carries 16px of its
                own horizontal padding (see `rootBtnCls`), which both separates
                the touch targets and spaces the icons apart. */}
            <span className="flex shrink-0 items-center">
              {onAddRoot && (
                <>
                  <button
                    type="button"
                    title={t.newFolder}
                    aria-label={activeFolder ? t.addFolderIn(activeFolder.name) : t.newFolder}
                    className={rootBtnCls}
                    onClick={() => onAddRoot('folder')}
                  ><span className={rootInnerCls}><FolderPlusIcon /></span></button>
                  <button
                    type="button"
                    title={t.newBookmark}
                    aria-label={activeFolder ? t.addLinkIn(activeFolder.name) : t.newBookmark}
                    className={rootBtnCls}
                    onClick={() => onAddRoot('link')}
                  ><span className={rootInnerCls}><BookmarkSimpleIcon /></span></button>
                </>
              )}
              {onToggleEditing && (
                <button
                  type="button"
                  title={editing ? t.doneEditingShortcuts : t.editShortcuts}
                  aria-label={editing ? t.doneEditingShortcuts : t.editShortcuts}
                  aria-pressed={editing}
                  className={rootBtnCls}
                  onClick={onToggleEditing}
                ><span className={rootInnerCls}>{editing ? <CheckIcon /> : <PencilSquareIcon />}</span></button>
              )}
            </span>
          </div>
        )}

        {/* The only scroll container. `px-3` lets rows escape it with
            `-mx-3` to span the full width; `overflow-x-hidden` stops the
            expand slide / tap scale from flashing a horizontal bar, and
            `scroll-themed` reserves the vertical gutter so it can't flicker. */}
        <div ref={scrollRef} className="scroll-themed flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3">
          {tree.length === 0 ? (
            // `flex-1` so the empty state fills whatever room the panel has —
            // otherwise a tiny dashed box sits pinned to the top of a mostly
            // empty glass panel, which reads as broken rather than as "there is
            // genuinely nothing here yet." Centering both axes then reads as a
            // deliberate placeholder rather than an unstyled fragment.
            <div className="my-3 flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t.treeEmpty}
            </div>
          ) : !hasResults ? (
            <div className="my-3 flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t.treeNoMatches(trimmedQuery)}
            </div>
          ) : (
            <TreeView role="tree" aria-label={rootLabel} className="px-0 pt-2">
              <Nodes
                nodes={tree}
                level={0}
                query={trimmedQuery}
                visible={visible}
                newTab={newTab}
                selectedId={selectedId}
                editing={editing}
                onEdit={onEdit}
                onRemove={onRemove}
                onMove={onMove}
                onMoveRequest={onMoveRequest}
                onAddIn={onAddIn}
                draggingId={dragging}
                dragOver={dragOver}
                setDragOver={setDragOver}
                onDragging={setDragging}
              />
            </TreeView>
          )}

          {dragging !== null && (
            <div
              {...rootDropProps}
              aria-hidden="true"
              title={t.dropToTopLevel}
              className={`mx-1 mt-1 flex h-10 items-center justify-center rounded-md border border-dashed text-xs transition-colors ${
                rootDragOver ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
              }`}
            >
              {t.dropToTopLevel}
            </div>
          )}
        </div>
      </div>
    </TreeProvider>
  )
}

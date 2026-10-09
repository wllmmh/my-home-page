import { Menu } from '@base-ui/react/menu'
import { Cog6ToothIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { useI18n } from './i18n'

const itemCls =
  'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-foreground/10 [&_svg]:size-4 [&_svg]:shrink-0'

/**
 * The app-level control cluster: everything that acts on the whole page rather
 * than on one bookmark. Settings, and the two data operations that used to sit
 * in a toolbar pinned inside the bookmarks panel — they are rare, deliberate
 * and whole-app, so they are behind one disclosure instead of spending panel
 * height permanently.
 *
 * Menu semantics (`aria-haspopup`, `aria-expanded`, roving focus, Escape to
 * close, focus returned to the trigger) come from Base UI rather than being
 * reimplemented here.
 */
export default function HeaderMenu({
  onOpenSettings,
  onImport,
  onExport,
}: {
  onOpenSettings: () => void
  onImport: () => void
  onExport: () => void
}) {
  const { t } = useI18n()

  return (
    <Menu.Root>
      {/* The negative margin pairs with the padding to grow the hit area to
          40px while the glass surface stays a 32px square — the icon must not
          look heavier just because it is easier to hit. */}
      <Menu.Trigger
        title={t.menu}
        aria-label={t.menu}
        className="-m-1 flex p-1"
      >
        <span className="glass glass-hover flex size-8 items-center justify-center rounded-md text-foreground transition-colors duration-150 [&_svg]:size-4">
          <Cog6ToothIcon />
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-[60]">
          <Menu.Popup className="glass min-w-[13rem] rounded-lg p-1 shadow-lg outline-none">
            <Menu.Item className={itemCls} onClick={onOpenSettings}>
              <AdjustmentsHorizontalIcon />
              {t.settingsMenuItem}
            </Menu.Item>
            <Menu.Separator className="mx-1 my-1 h-px bg-current opacity-15" />
            <Menu.Item className={itemCls} onClick={onImport}>
              <ArrowUpTrayIcon />
              {t.importBookmarks}
            </Menu.Item>
            <Menu.Item className={itemCls} onClick={onExport}>
              <ArrowDownTrayIcon />
              {t.exportBookmarks}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

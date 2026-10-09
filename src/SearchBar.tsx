import { useRef, useEffect } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useI18n } from './i18n'
import { isTyping } from '@/lib/utils'

export default function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLInputElement>(null)

  // "/" focuses search, the way it works most everywhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack "/" while the user is typing somewhere else — in a modal's
      // name field, say, or any contenteditable — where it's a literal slash.
      if (e.key === '/' && !isTyping()) {
        e.preventDefault()
        ref.current?.focus()
      }
      if (e.key === 'Escape') ref.current?.blur()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form className="relative mb-11" onSubmit={(e) => e.preventDefault()}>
      {/* Above the input: `.glass`'s backdrop-filter makes the input its own
          stacking context, which would otherwise paint over this icon. */}
      <MagnifyingGlassIcon className="pointer-events-none absolute start-[18px] top-1/2 z-10 size-5 -translate-y-1/2 text-foreground/70" />
      {/* A placeholder is not a label: it disappears on the first keystroke
          and is not a reliable accessible name. The visible design has no
          room for a label, so it is provided to assistive tech only. */}
      <label htmlFor="bookmark-search" className="sr-only">{t.searchPlaceholder}</label>
      <input
        id="bookmark-search"
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.searchPlaceholder}
        spellCheck="false"
        autoComplete="off"
        className="glass glass-focus w-full rounded-lg py-3.5 ps-[50px] pe-11 text-base text-foreground placeholder:text-foreground/70 outline-none transition-[border-color,box-shadow,background-color] duration-150"
      />
      {value && (
        <button
          type="button"
          title={t.clear}
          aria-label={t.clear}
          onClick={() => { onChange(''); ref.current?.focus() }}
          className="absolute end-[14px] top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground [&_svg]:size-4"
        ><XMarkIcon /></button>
      )}
    </form>
  )
}

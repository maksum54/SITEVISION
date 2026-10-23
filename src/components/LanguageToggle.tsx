import { useTranslation } from '../i18n'

export function LanguageToggle() {
  const { lang, setLang } = useTranslation()
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
      {(['id', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`px-2 py-1 ${lang === l ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

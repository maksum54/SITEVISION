import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../store/auth'
import { useTranslation, type TKey } from '../i18n'
import { LanguageToggle } from '../components/LanguageToggle'
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from '../lib/googleSignIn'

export function LoginPage() {
  const { user, initializing, loginWithGoogle, setError, error } = useAuth()
  const { t, lang } = useTranslation()
  const [processing, setProcessing] = useState(false)
  const [banned] = useState(() => {
    const b = sessionStorage.getItem('banned') === '1'
    if (b) sessionStorage.removeItem('banned')
    return b
  })
  const navigate = useNavigate()
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return
    let cancelled = false
    loadGoogleIdentity()
      .then((gid) => {
        if (cancelled || !buttonRef.current) return
        gid.initialize({
          client_id: GOOGLE_CLIENT_ID,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }) => {
            setProcessing(true)
            try {
              await loginWithGoogle(credential)
              navigate('/')
            } catch {
              /* error ditampilkan dari store */
            } finally {
              setProcessing(false)
            }
          },
        })
        buttonRef.current.innerHTML = ''
        gid.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: Math.min(buttonRef.current.offsetWidth || 320, 400),
          locale: lang,
        })
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [lang, loginWithGoogle, navigate, setError])

  if (!initializing && user) return <Navigate to="/" replace />

  const errorKey = `login.err.${error}` as TKey
  const errorText = error ? (t(errorKey) === errorKey ? error : t(errorKey)) : null

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{t('app.name')}</h1>
          <LanguageToggle />
        </div>
        <p className="mb-6 text-sm text-slate-500">{t('login.googleTitle')}</p>
        {banned && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t('login.banned')}</div>}
        {GOOGLE_CLIENT_ID ? (
          <div ref={buttonRef} className="flex min-h-11 w-full justify-center" />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t('login.notConfigured')}
          </div>
        )}
        {processing && <p className="mt-4 text-center text-sm text-slate-500">{t('login.processing')}</p>}
        {errorText && <p className="mt-4 text-center text-sm text-red-600">{errorText}</p>}
        <p className="mt-6 text-center text-xs text-slate-400">{t('login.googleHint')}</p>
      </div>
    </div>
  )
}

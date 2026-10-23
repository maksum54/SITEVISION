import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../store/auth'
import { useTranslation, type TKey } from '../i18n'
import { LanguageToggle } from '../components/LanguageToggle'

interface FormValues {
  email: string
  password: string
}

export function LoginPage() {
  const { user, initializing, login, register: registerUser, error } = useAuth()
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [processing, setProcessing] = useState(false)
  const [banned] = useState(() => {
    const b = sessionStorage.getItem('banned') === '1'
    if (b) sessionStorage.removeItem('banned')
    return b
  })
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>()

  if (!initializing && user) return <Navigate to="/" replace />

  const errorKey = `login.err.${error}` as TKey
  const errorText = error ? (t(errorKey) === errorKey ? error : t(errorKey)) : null

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-slate-900 focus:outline-none'

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{t('app.name')}</h1>
          <LanguageToggle />
        </div>
        <p className="mb-6 text-sm text-slate-500">
          {t(mode === 'login' ? 'login.signInTitle' : 'login.registerTitle')}
        </p>
        {banned && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t('login.banned')}</div>}
        <form
          onSubmit={handleSubmit(async (v) => {
            setProcessing(true)
            try {
              if (mode === 'login') await login(v.email, v.password)
              else await registerUser(v.email, v.password)
              navigate('/')
            } catch {
              /* error ditampilkan dari store */
            } finally {
              setProcessing(false)
            }
          })}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('login.email')}</label>
            <input
              type="email"
              autoComplete="email"
              className={inputClass}
              {...register('email', { required: t('login.emailRequired') })}
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('login.password')}</label>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={inputClass}
              {...register('password', {
                required: t('login.passwordRequired'),
                minLength: { value: 6, message: t('login.passwordMinLength') },
              })}
            />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
          </div>
          {errorText && <p className="text-sm text-red-600">{errorText}</p>}
          <button
            type="submit"
            disabled={processing}
            className="w-full rounded-lg bg-slate-900 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {t(processing ? 'login.processing' : mode === 'login' ? 'login.signIn' : 'login.register')}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-4 w-full text-center text-sm text-slate-500 underline"
        >
          {t(mode === 'login' ? 'login.toRegister' : 'login.toSignIn')}
        </button>
      </div>
    </div>
  )
}

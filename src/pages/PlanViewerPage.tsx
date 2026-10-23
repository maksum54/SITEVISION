import { useRef, useState, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { categoryColor, useCategories, usePins, usePlan } from '../hooks/data'
import { useTranslation } from '../i18n'
import { PinMarker } from '../components/PinMarker'
import { PinForm } from '../components/PinForm'

function relativePosition(clientX: number, clientY: number, rect: DOMRect) {
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}

export function PlanViewerPage() {
  const { projectId, planId } = useParams()
  const { plan, error } = usePlan(projectId, planId)
  const { pins, createPin, updatePin, uploadPhoto } = usePins(projectId, planId)
  const { categories } = useCategories()
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [scale, setScale] = useState(1)
  const contentRef = useRef<HTMLDivElement>(null)

  const onPlanClick = async (e: MouseEvent) => {
    if (!contentRef.current || creating) return
    const { x, y } = relativePosition(e.clientX, e.clientY, contentRef.current.getBoundingClientRect())
    setCreating(true)
    try {
      setSelectedId(await createPin(x, y))
    } finally {
      setCreating(false)
    }
  }

  const selected = pins.find((p) => p.id === selectedId) ?? null

  if (!plan)
    return (
      <div className="p-6 text-sm text-slate-500">
        {error ? t('error.generic', { error: error.message }) : t('planViewer.loading')}
      </div>
    )

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/projects/${projectId}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700"
            aria-label={t('planViewer.backToPlans')}
          >
            ←
          </Link>
          <h1 className="truncate text-base font-semibold text-slate-900">{plan.name}</h1>
        </div>
        <Link
          to={`/projects/${projectId}/plans/${planId}/punchlist`}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          {t('planViewer.punchList', { count: pins.length })}
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto border-b border-slate-200 px-4 py-1.5">
        {categories.map((c) => (
          <span key={c.id} className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </span>
        ))}
      </div>
      <div className="relative flex-1 overflow-hidden bg-slate-100">
        <TransformWrapper
          doubleClick={{ disabled: true }}
          minScale={0.5}
          maxScale={6}
          onTransform={(_, state) => setScale(state.scale)}
        >
          <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%' }}>
            <div ref={contentRef} onClick={onPlanClick} className="relative w-full">
              <img
                src={plan.imageURL}
                referrerPolicy="no-referrer"
                alt={plan.name}
                draggable={false}
                className="block w-full select-none"
              />
              {pins.map((pin) => (
                <PinMarker
                  key={pin.id}
                  pin={pin}
                  categoryColor={categoryColor(categories, pin.category)}
                  zoomScale={scale}
                  onSelect={(p) => setSelectedId(p.id)}
                />
              ))}
            </div>
          </TransformComponent>
        </TransformWrapper>
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">
          {t('planViewer.tapHint')}
        </p>
      </div>
      {selected && (
        <PinForm
          key={selected.id}
          pin={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={updatePin}
          onUploadPhoto={uploadPhoto}
        />
      )}
    </div>
  )
}

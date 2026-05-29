import { useRef, type PointerEventHandler, type ReactNode, type RefObject } from 'react'

type ModalFrameProps = {
  children: ReactNode
  panelRef?: RefObject<HTMLDivElement | null>
  onClose: () => void
  overlayClassName?: string
  panelClassName: string
  onPanelPointerDown?: PointerEventHandler<HTMLDivElement>
  dataNoDragSelect?: boolean
}

export default function ModalFrame({
  children,
  panelRef,
  onClose,
  overlayClassName = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6',
  panelClassName,
  onPanelPointerDown,
  dataNoDragSelect = false,
}: ModalFrameProps) {
  const backdropPointerDownRef = useRef(false)

  return (
    <div
      data-no-drag-select={dataNoDragSelect || undefined}
      className={overlayClassName}
      onPointerDown={(event) => {
        backdropPointerDownRef.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (backdropPointerDownRef.current && event.target === event.currentTarget) onClose()
        backdropPointerDownRef.current = false
      }}
    >
      <div
        ref={panelRef}
        className={panelClassName}
        onPointerDown={onPanelPointerDown}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

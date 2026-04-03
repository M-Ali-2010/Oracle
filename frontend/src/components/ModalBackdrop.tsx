import { FC, ReactNode } from 'react';

export const ModalBackdrop: FC<{
  onClose: () => void;
  children: ReactNode;
  accentColor?: string;
}> = ({ onClose, children, accentColor = '#8b5cf6' }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
    <div
      className="relative w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0d1117 0%, #0a0d14 100%)',
        border: `1px solid ${accentColor}22`,
        boxShadow: `0 0 60px ${accentColor}10, 0 40px 100px rgba(0,0,0,0.8)`,
        maxHeight: '92vh',
        overflowY: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg, ${accentColor}00, ${accentColor}66, ${accentColor}00)` }} />
      {children}
    </div>
  </div>
);

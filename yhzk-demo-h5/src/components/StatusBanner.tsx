type BannerType = 'error' | 'warning' | 'info';

interface Props {
  type: BannerType;
  message: string;
  detail?: string;
  onClose?: () => void;
  onRetry?: () => void;
}

const icons: Record<BannerType, string> = {
  error: '❌', warning: '⚠️', info: 'ℹ️',
};

export default function StatusBanner({ type, message, detail, onClose, onRetry }: Props) {
  if (!message) return null;
  return (
    <div className={`banner banner-${type}`}>
      <span className="banner-icon">{icons[type]}</span>
      <div className="banner-body">
        <span className="banner-msg">{message}</span>
        {detail && <span className="banner-detail">{detail}</span>}
      </div>
      {onRetry && (
        <button className="banner-retry" onClick={onRetry}>重试</button>
      )}
      {onClose && (
        <button className="banner-close" onClick={onClose}>✕</button>
      )}
    </div>
  );
}

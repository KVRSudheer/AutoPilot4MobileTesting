import { useEffect, useState } from "react";
import { bridgeActive, onBridgeChange, openDoc, resolveMediaUrl } from "../lib/bridge";

/** Live view of whether the local-engine bridge extension is connected. */
export function useBridgeActive(): boolean {
  const [active, setActive] = useState(bridgeActive());
  useEffect(() => onBridgeChange(setActive), []);
  return active;
}

/**
 * <img> whose src is fetched through the bridge extension when present
 * (object URL), and used directly otherwise.
 */
export function BridgeImg({
  src,
  alt,
  className,
  loading,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const [url, setUrl] = useState<string | null>(bridgeActive() ? null : src);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    void resolveMediaUrl(src)
      .then((resolved) => {
        if (!alive) return;
        if (resolved !== src) objectUrl = resolved;
        setUrl(resolved);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!url) return <span className={className} aria-hidden />;
  return <img src={url} alt={alt} loading={loading} className={className} />;
}

/**
 * "Open in new tab" link for server documents/screenshots; in bridge mode the
 * bytes are fetched through the extension and opened as an object URL.
 */
export function MediaLink({
  href,
  title,
  className,
  children,
}: {
  href: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={className}
      onClick={(e) => {
        if (bridgeActive()) {
          e.preventDefault();
          void openDoc(href).catch(() => undefined);
        }
      }}
    >
      {children}
    </a>
  );
}

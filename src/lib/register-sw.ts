const APP_SW = "/sw.js";

const isPreviewHost = (hostname: string): boolean =>
  hostname.startsWith("id-preview--") ||
  hostname.startsWith("preview--") ||
  hostname === "lovableproject.com" ||
  hostname.endsWith(".lovableproject.com") ||
  hostname === "lovableproject-dev.com" ||
  hostname.endsWith(".lovableproject-dev.com") ||
  hostname === "beta.lovable.dev" ||
  hostname.endsWith(".beta.lovable.dev");

const unregisterAppWorker = async (): Promise<void> => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => (registration.active?.scriptURL ?? "").endsWith(APP_SW))
      .map((registration) => registration.unregister()),
  );
};

/**
 * Installs the offline app shell in the published app only. Dev, iframe and
 * Lovable preview contexts unregister any stale worker instead, so technicians
 * never see cached HTML while the app is being built.
 */
export const registerAppServiceWorker = (): void => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    isPreviewHost(window.location.hostname) ||
    new URL(window.location.href).searchParams.get("sw") === "off";

  if (refused) {
    void unregisterAppWorker();
    return;
  }

  void navigator.serviceWorker.register(APP_SW, { scope: "/" });
};

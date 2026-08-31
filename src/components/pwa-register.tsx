"use client";

/** Регистрация service worker + инициализация PWA-установки */

import { useEffect } from "react";
import { initPwaInstall } from "@/lib/pwa-install";

export function PwaRegister() {
  useEffect(() => {
    initPwaInstall();

    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* тихо игнорируем: SW не критичен для работы портала */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

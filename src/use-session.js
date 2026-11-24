import { useEffect, useRef } from "react";
import { writeSession } from "./session.js";

export function useSession(key, value, pack = (data) => data) {
  const latest = useRef();
  latest.current = () => writeSession(key, pack(value));
  useEffect(() => {
    const timer = setTimeout(() => latest.current(), 180);
    return () => clearTimeout(timer);
  }, [value]);
  useEffect(() => {
    const flush = () => latest.current();
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [key]);
}

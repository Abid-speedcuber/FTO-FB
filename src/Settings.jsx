import React, { useRef, useState } from "react";

export default function Settings() {
  const dialog = useRef(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "dark");

  function changeTheme(value) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content", value === "light" ? "#ffffff" : "#111418",
    );
    try {
      localStorage.setItem("fto-theme", value);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
  }

  return (
    <>
      <button className="settings-button" type="button" aria-label="Settings"
        aria-haspopup="dialog" onClick={() => dialog.current.showModal()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9.5 3-.6 2.3-1.7 1-2.3-.6L2.4 10l1.7 1.7v2L2.4 15.4l2.5 4.3 2.3-.6 1.7 1 .6 2.3h5l.6-2.3 1.7-1 2.3.6 2.5-4.3-1.7-1.7v-2l1.7-1.7-2.5-4.3-2.3.6-1.7-1L14.5 3Z" transform="translate(0 -1)" />
          <circle cx="12" cy="11.7" r="3.2" />
        </svg>
      </button>
      <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title"
        onClick={(event) => { if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current.close();
        } }}>
        <div className="settings-heading">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="settings-close" aria-label="Close settings"
            onClick={() => dialog.current.close()}>×</button>
        </div>
        <label className="theme-setting">
          Theme
          <select aria-label="Theme" value={theme} onChange={(event) => changeTheme(event.target.value)}>
            <option value="light">Light mode</option>
            <option value="dark">Dark mode</option>
          </select>
        </label>
      </dialog>
    </>
  );
}

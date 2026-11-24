import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatHold, parseHold } from "./view-notation.js";
const contents = (frame) => formatHold(frame).slice(1, -1);

export default forwardRef(function HoldInput({ frame, onCommit }, ref) {
  const [text, setText] = useState(() => contents(frame)),
    [error, setError] = useState(false),
    input = useRef(), editing = useRef(false);
  useEffect(() => {
    if (!editing.current) { setText(contents(frame)); setError(false); }
  }, [frame]);
  useImperativeHandle(ref, () => ({
    follow(next) {
      // Orbiting wins over a selected or partially edited hold, even when the
      // camera stays within the same logical CIF/EIF frame.
      editing.current = false;
      const element = input.current;
      if (element) {
        element.setSelectionRange(element.value.length, element.value.length);
        if (document.activeElement === element) element.blur();
      }
      setText(contents(next)); setError(false);
    },
  }), []);
  function change(value) {
    const nextText = value.replace(/[{}]/g, "");
    setText(nextText); setError(false);
    const next = parseHold(nextText);
    if (next) onCommit(next);
  }
  return <div className="hold-control">
    <label>
      Hold
      <span className="hold-field">
        <span className="hold-brace" aria-hidden="true">{"{"}</span>
        <input ref={input} className="hold-input" aria-label="Current orientation" value={text}
          style={{ width: `${Math.max(1, Math.min(7, text.length))}ch` }}
          aria-invalid={error} aria-describedby={error ? "hold-error" : undefined}
          autoComplete="off" spellCheck={false}
          title="Original CIF faces at U and F. Valid holds snap the view immediately."
          onFocus={() => { editing.current = true; }}
          onChange={(event) => change(event.target.value)}
          onBlur={() => {
            if (editing.current) { editing.current = false; setError(!parseHold(text)); }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const next = parseHold(text);
              if (next) onCommit(next);
            }
            if (event.key === "Escape") {
              editing.current = false; setText(contents(frame)); setError(false); event.currentTarget.blur();
            }
          }} />
        <span className="hold-brace" aria-hidden="true">{"}"}</span>
      </span>
    </label>
    {error && <span id="hold-error" role="alert">Use different, non-opposite faces, e.g. {"{U,BR}"}.</span>}
  </div>;
});

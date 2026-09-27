"use client";

import { useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * A password box with an eye button. The password shows only while the eye
 * is held down (finger, mouse, or Space/Enter) and hides as soon as it's let go.
 */
export default function PasswordInput({ className = "", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const show = () => setVisible(true);
  const hide = () => setVisible(false);
  const isHoldKey = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";

  return (
    <div className="relative">
      <input {...rest} type={visible ? "text" : "password"} className={`${className} pr-16`} />
      <button
        type="button"
        aria-label="Hold to show password"
        onPointerDown={(e) => {
          e.preventDefault(); // keep the cursor in the password box
          show();
        }}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onKeyDown={(e) => {
          if (!isHoldKey(e)) return;
          e.preventDefault();
          show();
        }}
        onKeyUp={(e) => isHoldKey(e) && hide()}
        onBlur={hide}
        onContextMenu={(e) => e.preventDefault()} // a long press on phones opens a menu otherwise
        className="absolute inset-y-0 right-0 flex w-14 touch-none select-none items-center justify-center rounded-r-control text-ink-soft hover:text-ink"
      >
        {visible ? <EyeOff aria-hidden="true" size={24} /> : <Eye aria-hidden="true" size={24} />}
      </button>
    </div>
  );
}

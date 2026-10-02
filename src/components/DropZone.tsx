import { useRef } from "react";
import { ACCEPT } from "../data/load";
import { useStore } from "../state/store";
import { ArrowIcon } from "../ui/marks";

/** A hidden file input wired to requestFile, and a function that opens it. */
export function useFilePicker() {
  const requestFile = useStore((state) => state.requestFile);
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(event) => {
        const files = event.target.files;
        if (files?.length) requestFile([...files]);
        event.target.value = "";
      }}
    />
  );
  return { open: () => ref.current?.click(), input };
}

/**
 * Where a CSV can be dropped. The whole page accepts a drop (App); this makes
 * the affordance visible and answers while a file is over the page.
 */
export function DropZone({ size = "rail" }: { size?: "rail" | "canvas" }) {
  const dragActive = useStore((state) => state.dragActive);
  const parsing = useStore((state) => state.parsing);
  const picker = useFilePicker();

  return (
    <div className={`pf-drop pf-drop--${size}${dragActive ? " is-active" : ""}`} data-tour="upload">
      {picker.input}
      <ArrowIcon size={24} className="pf-icon--up" />
      <p className={size === "canvas" ? "body-lg" : "label"} aria-live="polite">
        {dragActive ? "Drop to read the file" : "Drag a CSV file here"}
      </p>
      {!dragActive && (
        <>
          <p className="small pf-note">or</p>
          <button
            type="button"
            className="ml-btn ml-btn--primary"
            data-tour="upload-button"
            onClick={picker.open}
            disabled={parsing.status === "parsing"}
          >
            Choose CSV file
          </button>
        </>
      )}
      <p className="small pf-note pf-drop__hint">
        Comma, tab or semicolon separated, up to 50 MB. Analysed in this browser and saved with this analysis in
        your account.
      </p>
    </div>
  );
}

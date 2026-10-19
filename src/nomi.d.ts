// Bridge from electron/preload.ts. Undefined when the renderer runs outside Electron.
interface Window {
  nomi?: {
    movePet: (dx: number, dy: number) => void;
    setPetView: (view: "pet" | "panel" | "nudge" | "suggest") => void;
    setPetHit: (hit: boolean) => void;
    openBots: (item?: import("@/lib/types").ActionItem) => void;
    onPetCommand: (fn: (cmd: "open-daily" | "demo-nudge" | "demo-suggest") => void) => () => void;
    onHandoff: (fn: (item: import("@/lib/types").ActionItem) => void) => () => void;
  };
}

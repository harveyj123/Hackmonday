// Bridge from electron/preload.ts. Undefined when the renderer runs outside Electron.
interface Window {
  nomi?: {
    openDaily: () => void;
    movePet: (dx: number, dy: number) => void;
    onShowDaily: (fn: () => void) => () => void;
  };
}

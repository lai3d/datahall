// Two download paths:
// - Inside a claude.ai artifact: the downloads capability of window.claude; file extensions are allowlisted, so we pack a zip
// - Standalone deployment: Blob + <a download> saves the file directly
import {zipStore} from './zip.ts';
import {USD_README} from './usd-export.ts';
import {tr} from './i18n.ts';

// window.claude injected by the claude.ai artifact; absent in standalone deployments
interface ClaudeDownloads {save(file: {filename: string; data: Blob}): Promise<unknown>}
declare global {
  interface Window {claude?: {use(capability: 'downloads'): Promise<ClaudeDownloads>}}
}
export interface Saver {hint(): string; save(filename: string, text: string): Promise<unknown>; saveBlob(filename: string, data: Blob): Promise<unknown>}

export async function createSaver(): Promise<Saver>{
  let downloads: ClaudeDownloads | null | undefined = null;
  try { downloads = window.claude && await window.claude.use('downloads'); } catch (e) {}
  const d = downloads;
  if (d) return {
    hint: () => tr('saverZip'),
    save: (filename, text) => {
      const usd = filename.endsWith('.usda');
      return d.save({filename: usd ? 'datahall-openusd.zip' : filename.replace(/\.\w+$/, '.zip'),
        data: zipStore([{name: filename, text}, ...(usd ? [{name: 'README.md', text: USD_README}] : [])])});
    },
    // Images are a standard type, so they are saved as they are
    saveBlob: (filename, data) => d.save({filename, data}),
  };
  return {
    hint: () => tr('saverFile'),
    save: async (filename, text) => downloadText(filename, text),
    saveBlob: async (filename, data) => downloadBlob(filename, data),
  };
}

export function downloadText(filename: string, text: string): void{
  // octet-stream stops browsers from treating it as text/plain and appending .txt to the file name
  downloadBlob(filename, new Blob([text], {type: 'application/octet-stream'}));
}

export function downloadBlob(filename: string, data: Blob): void{
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 两条下载通道：
// - 在 claude.ai artifact 里：window.claude 的 downloads 能力，扩展名有白名单，所以打成 zip
// - 独立部署：Blob + <a download> 直接下载文件
import {zipStore} from './zip.ts';
import {USD_README} from './usd-export.ts';
import {tr} from './i18n.ts';

// claude.ai artifact 注入的 window.claude，独立部署时没有
interface ClaudeDownloads {save(file: {filename: string; data: Blob}): Promise<unknown>}
declare global {
  interface Window {claude?: {use(capability: 'downloads'): Promise<ClaudeDownloads>}}
}
export interface Saver {hint(): string; save(filename: string, text: string): Promise<unknown>}

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
  };
  return {
    hint: () => tr('saverFile'),
    save: async (filename, text) => downloadText(filename, text),
  };
}

export function downloadText(filename: string, text: string): void{
  // octet-stream 避免浏览器按 text/plain 给文件名追加 .txt
  const url = URL.createObjectURL(new Blob([text], {type: 'application/octet-stream'}));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

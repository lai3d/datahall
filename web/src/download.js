// 两条下载通道：
// - 在 claude.ai artifact 里：window.claude 的 downloads 能力，扩展名有白名单，所以打成 zip
// - 独立部署：Blob + <a download> 直接下载文件
import {zipStore} from './zip.js';
import {USD_README} from './usd-export.js';
import {tr} from './i18n.js';

export async function createSaver(){
  let downloads = null;
  try { downloads = window.claude && await window.claude.use('downloads'); } catch (e) {}
  if (downloads) return {
    hint: () => tr('saverZip'),
    save: (filename, text) => {
      const usd = filename.endsWith('.usda');
      return downloads.save({filename: usd ? 'datahall-openusd.zip' : filename.replace(/\.\w+$/, '.zip'),
        data: zipStore([{name: filename, text}, ...(usd ? [{name: 'README.md', text: USD_README}] : [])])});
    },
  };
  return {
    hint: () => tr('saverFile'),
    save: async (filename, text) => downloadText(filename, text),
  };
}

export function downloadText(filename, text){
  // octet-stream 避免浏览器按 text/plain 给文件名追加 .txt
  const url = URL.createObjectURL(new Blob([text], {type: 'application/octet-stream'}));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

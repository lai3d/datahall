// 两条下载通道：
// - 在 claude.ai artifact 里：window.claude 的 downloads 能力，扩展名有白名单，所以打成 zip
// - 独立部署：Blob + <a download> 直接下载 .usda
import {zipStore} from './zip.js';
import {USD_README} from './usd-export.js';

export async function createSaver(){
  let downloads = null;
  try { downloads = window.claude && await window.claude.use('downloads'); } catch (e) {}
  if (downloads) return {
    hint: '打包为 zip，内含 datahall.usda 和字段说明。',
    save: usda => downloads.save({filename: 'datahall-openusd.zip',
      data: zipStore([{name: 'datahall.usda', text: usda}, {name: 'README.md', text: USD_README}])}),
  };
  return {
    hint: '下载 datahall.usda 文本层。',
    save: async usda => downloadText('datahall.usda', usda),
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

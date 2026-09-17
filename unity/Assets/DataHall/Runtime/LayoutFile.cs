using System;
using System.IO;

namespace DataHall
{
    // 读取并解析 layout.json。失败时返回面板上直接显示的中文原因，不抛异常
    public static class LayoutFile
    {
        // layout.json 通常只有几 KB；限制大小，避免误选大文件时卡住
        public const long MaxBytes = 16 * 1024 * 1024;

        public static bool TryRead(string path, out LayoutData layout, out string error)
        {
            layout = null;
            error = null;
            var name = Path.GetFileName(path);
            try
            {
                var info = new FileInfo(path);
                if (!info.Exists) { error = $"找不到文件 {name}。"; return false; }
                if (info.Length > MaxBytes) { error = $"{name} 太大（{info.Length / 1048576} MB），不是机房布局文件。"; return false; }
                layout = LayoutData.Parse(File.ReadAllText(path));
                return true;
            }
            catch (LayoutFormatException e) { error = $"{name} 无法打开：{e.Message}"; }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException) { error = $"读取 {name} 失败：{e.Message}"; }
            return false;
        }
    }
}

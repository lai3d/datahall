using System;
using System.IO;

namespace DataHall
{
    // Reads and parses layout.json. On failure returns a Chinese reason shown directly in the panel instead of throwing
    public static class LayoutFile
    {
        // layout.json is usually a few KB; cap the size so picking a large file by mistake does not hang
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

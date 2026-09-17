using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace DataHall
{
    // macOS 原生功能：文件对话框、把文件拖进窗口。实现在 unity/Native/DataHallNative.m，
    // 插件只在打包后的 macOS 程序里加载；编辑器里文件对话框用 EditorUtility，拖放不可用。
    public static class NativeMac
    {
        const string Lib = "DataHallNative";

#if UNITY_STANDALONE_OSX && !UNITY_EDITOR
        [DllImport(Lib)] static extern int DataHallNative_Version();
        [DllImport(Lib)] static extern void DataHallNative_Free(IntPtr p);
        [DllImport(Lib)] static extern IntPtr DataHallNative_OpenFile([MarshalAs(UnmanagedType.LPUTF8Str)] string message, [MarshalAs(UnmanagedType.LPUTF8Str)] string extension, double autoCancelSeconds);
        [DllImport(Lib)] static extern int DataHallNative_EnableFileDrop();
        [DllImport(Lib)] static extern IntPtr DataHallNative_PollDroppedFile();
        [DllImport(Lib)] static extern int DataHallNative_TestDrop([MarshalAs(UnmanagedType.LPUTF8Str)] string path);
        [DllImport(Lib)] static extern IntPtr DataHallNative_DescribeContentView();

        static string TakeString(IntPtr p)
        {
            if (p == IntPtr.Zero) return null;
            try { return Marshal.PtrToStringUTF8(p); }
            finally { DataHallNative_Free(p); }
        }

        // 插件版本；加载失败返回 -1
        public static int Version
        {
            get
            {
                try { return DataHallNative_Version(); }
                catch (Exception e) when (e is DllNotFoundException || e is EntryPointNotFoundException)
                {
                    Debug.LogWarning("DataHallNative plugin not available: " + e.Message);
                    return -1;
                }
            }
        }

        public static string OpenFile(string message, string extension, double autoCancelSeconds = 0) =>
            Version > 0 ? TakeString(DataHallNative_OpenFile(message, extension, autoCancelSeconds)) : null;

        // 1 已启用，0 窗口还没创建，-1 无法接管
        public static int EnableFileDrop() => Version > 0 ? DataHallNative_EnableFileDrop() : -1;

        public static string PollDroppedFile() => Version > 0 ? TakeString(DataHallNative_PollDroppedFile()) : null;

        public static bool TestDrop(string path) => Version > 0 && DataHallNative_TestDrop(path) == 1;

        public static string DescribeContentView() => Version > 0 ? TakeString(DataHallNative_DescribeContentView()) : null;
#else
        public static int Version => -1;

        public static string OpenFile(string message, string extension, double autoCancelSeconds = 0)
        {
#if UNITY_EDITOR
            if (autoCancelSeconds > 0) return null;
            var path = UnityEditor.EditorUtility.OpenFilePanel(message, "", extension);
            return string.IsNullOrEmpty(path) ? null : path;
#else
            return null;
#endif
        }

        public static int EnableFileDrop() => -1;
        public static string PollDroppedFile() => null;
        public static bool TestDrop(string path) => false;
        public static string DescribeContentView() => null;
#endif

        public static bool CanOpenFiles => Application.isEditor || Version > 0;
    }
}

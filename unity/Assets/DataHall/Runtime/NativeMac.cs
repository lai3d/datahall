using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace DataHall
{
    // Native macOS features: file dialog and dropping files onto the window. Implemented in unity/Native/DataHallNative.m;
    // the plugin loads only in the built macOS app. In the editor the file dialog uses EditorUtility and drop is unavailable.
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

        // Plugin version; -1 if loading failed
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

        // 1 enabled, 0 window not created yet, -1 cannot take over
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

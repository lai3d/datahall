using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace DataHall.Editor
{
    // Builds the macOS app. Command line: Unity -batchmode -projectPath unity -executeMethod DataHall.Editor.BuildMac.Build -buildPath Build/DataHall.app -quit
    public static class BuildMac
    {
        [MenuItem("DataHall/Build macOS App")]
        public static void Build()
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "-buildPath");
            var path = i >= 0 && i + 1 < args.Length ? args[i + 1] : "Build/DataHall.app";
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ProjectSetup.ScenePath },
                locationPathName = path,
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.None,
            });
            Debug.Log($"DataHall: build {report.summary.result}, {report.summary.totalSize / 1048576} MB, {report.summary.totalErrors} errors -> {path}");
            if (Application.isBatchMode) EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}

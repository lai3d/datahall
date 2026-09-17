using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace DataHall.Editor
{
    // Imports a layout bundle produced by tools/usd_to_unity.py (layout.json + assets/<id>.glb):
    //   glb files are copied to Generated/Models and imported by glTFast; the first import of each type creates Prefabs/<id>.prefab (a model variant),
    //   later reimports only update the model and keep interaction added on the variant; EquipmentLibrary records id → prefab;
    //   layout.json is copied to StreamingAssets as the hall the app opens by default.
    // Command line: Unity -batchmode -projectPath unity -executeMethod DataHall.Editor.BundleImporter.ImportFromCommandLine -bundle <dir> [-noLayout] -quit
    public static class BundleImporter
    {
        public const string ModelsDir = "Assets/DataHall/Generated/Models";
        public const string PrefabsDir = "Assets/DataHall/Prefabs";
        public const string LibraryPath = "Assets/DataHall/Generated/EquipmentLibrary.asset";
        public const string StreamingLayout = "Assets/StreamingAssets/layout.json";

        [MenuItem("DataHall/Import Layout Bundle…")]
        static void ImportFromMenu()
        {
            var dir = EditorUtility.OpenFolderPanel("Choose a layout bundle produced by usd_to_unity.py", "", "");
            if (string.IsNullOrEmpty(dir)) return;
            var library = ImportBundle(dir);
            EditorUtility.DisplayDialog("DataHall", $"Imported {library.entries.Count} equipment types.", "OK");
        }

        public static void ImportFromCommandLine()
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "-bundle");
            if (i < 0 || i + 1 >= args.Length) throw new ArgumentException("missing -bundle <dir>");
            var library = ImportBundle(args[i + 1], copyLayout: Array.IndexOf(args, "-noLayout") < 0);
            Debug.Log($"DataHall: imported {library.entries.Count} equipment types");
        }

        public static EquipmentLibrary ImportBundle(string bundleDir, bool copyLayout = true)
        {
            var layoutPath = Path.Combine(bundleDir, "layout.json");
            var layout = LayoutData.Parse(File.ReadAllText(layoutPath));
            Directory.CreateDirectory(ModelsDir);
            Directory.CreateDirectory(PrefabsDir);
            foreach (var entry in layout.catalog)
            {
                var glb = Path.Combine(bundleDir, "assets", entry.id + ".glb");
                if (File.Exists(glb)) File.Copy(glb, $"{ModelsDir}/{entry.id}.glb", true);
                else Debug.LogWarning($"DataHall: {entry.id}.glb not found in bundle; the app will use a placeholder");
            }
            if (copyLayout)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(StreamingLayout));
                File.Copy(layoutPath, StreamingLayout, true);
            }
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

            var library = AssetDatabase.LoadAssetAtPath<EquipmentLibrary>(LibraryPath);
            if (!library)
            {
                library = ScriptableObject.CreateInstance<EquipmentLibrary>();
                AssetDatabase.CreateAsset(library, LibraryPath);
            }
            foreach (var entry in layout.catalog)
            {
                var model = AssetDatabase.LoadAssetAtPath<GameObject>($"{ModelsDir}/{entry.id}.glb");
                if (!model) continue;
                var prefabPath = $"{PrefabsDir}/{entry.id}.prefab";
                if (!AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath))
                {
                    // Saving an instance of a model asset as a prefab makes a variant; fall back to a regular prefab if variants are unsupported
                    var instance = PrefabUtility.InstantiatePrefab(model) as GameObject ?? UnityEngine.Object.Instantiate(model);
                    instance.name = entry.id;
                    PrefabUtility.SaveAsPrefabAsset(instance, prefabPath);
                    UnityEngine.Object.DestroyImmediate(instance);
                }
                library.Set(entry.id, AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath));
            }
            EditorUtility.SetDirty(library);
            AssetDatabase.SaveAssets();

            // HallApp in the scene references the equipment library. Opening a scene in Single mode unloads unreferenced assets, so reload the library afterwards
            if (File.Exists(ProjectSetup.ScenePath))
            {
                var scene = EditorSceneManager.OpenScene(ProjectSetup.ScenePath, OpenSceneMode.Single);
                library = AssetDatabase.LoadAssetAtPath<EquipmentLibrary>(LibraryPath);
                var app = UnityEngine.Object.FindFirstObjectByType<HallApp>();
                if (app && app.library != library)
                {
                    app.library = library;
                    EditorSceneManager.MarkSceneDirty(scene);
                    EditorSceneManager.SaveScene(scene);
                }
            }
            return library;
        }
    }
}

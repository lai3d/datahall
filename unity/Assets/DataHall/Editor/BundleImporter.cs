using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace DataHall.Editor
{
    // 导入 tools/usd_to_unity.py 生成的布局包（layout.json + assets/<id>.glb）：
    //   glb 复制到 Generated/Models，由 glTFast 导入；每种设备第一次导入时生成 Prefabs/<id>.prefab（模型的变体），
    //   以后重新导入只更新模型，变体上加的交互保留；EquipmentLibrary 记录 id → prefab；
    //   layout.json 复制到 StreamingAssets，作为程序默认打开的机房。
    // 命令行：Unity -batchmode -projectPath unity -executeMethod DataHall.Editor.BundleImporter.ImportFromCommandLine -bundle <dir> -quit
    public static class BundleImporter
    {
        public const string ModelsDir = "Assets/DataHall/Generated/Models";
        public const string PrefabsDir = "Assets/DataHall/Prefabs";
        public const string LibraryPath = "Assets/DataHall/Generated/EquipmentLibrary.asset";
        public const string StreamingLayout = "Assets/StreamingAssets/layout.json";

        [MenuItem("DataHall/导入布局包…")]
        static void ImportFromMenu()
        {
            var dir = EditorUtility.OpenFolderPanel("选择 usd_to_unity.py 生成的布局包", "", "");
            if (string.IsNullOrEmpty(dir)) return;
            var library = ImportBundle(dir);
            EditorUtility.DisplayDialog("DataHall", $"已导入 {library.entries.Count} 种设备。", "好");
        }

        public static void ImportFromCommandLine()
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "-bundle");
            if (i < 0 || i + 1 >= args.Length) throw new ArgumentException("missing -bundle <dir>");
            var library = ImportBundle(args[i + 1]);
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
                    // 模型资产的实例存成 prefab 即为变体；不支持变体时退回普通 prefab
                    var instance = PrefabUtility.InstantiatePrefab(model) as GameObject ?? UnityEngine.Object.Instantiate(model);
                    instance.name = entry.id;
                    PrefabUtility.SaveAsPrefabAsset(instance, prefabPath);
                    UnityEngine.Object.DestroyImmediate(instance);
                }
                library.Set(entry.id, AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath));
            }
            EditorUtility.SetDirty(library);
            AssetDatabase.SaveAssets();

            // 场景里的 HallApp 引用设备库。单场景方式打开会卸载未被引用的资产，所以打开后重新加载库
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

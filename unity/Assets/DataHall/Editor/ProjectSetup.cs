using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace DataHall.Editor
{
    // One-time project setup: URP pipeline asset, base material, Hall scene and the build scene list.
    // Command line: Unity -batchmode -projectPath unity -executeMethod DataHall.Editor.ProjectSetup.Run -quit
    public static class ProjectSetup
    {
        public const string SettingsDir = "Assets/DataHall/Settings";
        public const string ScenePath = "Assets/DataHall/Scenes/Hall.unity";
        public const string BaseMaterialPath = SettingsDir + "/Base.mat";

        [MenuItem("DataHall/Regenerate Project Setup")]
        public static void Run()
        {
            Directory.CreateDirectory(SettingsDir);
            // Keep the desktop simulator running in the background; when launched from a terminal for screenshots or smoke tests the app is not frontmost, and turning this off stalls the main loop
            PlayerSettings.runInBackground = true;
            // URP works in linear color space; glTF color factors are linear values too
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.productName = "GPU 机房";
            PlayerSettings.companyName = "DataHall";
            PlayerSettings.defaultScreenWidth = 1600;
            PlayerSettings.defaultScreenHeight = 1000;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            ConfigureUrp();
            ConfigureNativePlugin();
            var material = BaseMaterial();
            CreateScene(material);
            AssetDatabase.SaveAssets();
            Debug.Log("DataHall: project setup done");
        }

        static void ConfigureUrp()
        {
            var assetPath = SettingsDir + "/URP.asset";
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(assetPath);
            if (!pipeline)
            {
                var renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, SettingsDir + "/URP_Renderer.asset");
                pipeline = UniversalRenderPipelineAsset.Create(renderer);
                AssetDatabase.CreateAsset(pipeline, assetPath);
            }
            GraphicsSettings.defaultRenderPipeline = pipeline;
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }
        }

        // DataHallNative.bundle is only for the built macOS app; the editor does not load it, so the file is not locked when rebuilding the plugin
        public const string NativePluginPath = "Assets/Plugins/macOS/DataHallNative.bundle";

        static void ConfigureNativePlugin()
        {
            if (!(AssetImporter.GetAtPath(NativePluginPath) is PluginImporter importer))
            {
                Debug.LogWarning("DataHall: native plugin not found, run tools/build_native_mac.sh");
                return;
            }
            importer.SetCompatibleWithAnyPlatform(false);
            importer.SetCompatibleWithEditor(false);
            importer.SetCompatibleWithPlatform(BuildTarget.StandaloneOSX, true);
            importer.SetPlatformData(BuildTarget.StandaloneOSX, "CPU", "AnyCPU");
            importer.SaveAndReimport();
        }

        static Material BaseMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(BaseMaterialPath);
            if (!material)
            {
                material = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(material, BaseMaterialPath);
            }
            // The floor and placeholder boxes are matte; the default smoothness of 0.5 gives obvious highlights across the large floor
            material.SetFloat("_Smoothness", 0.15f);
            EditorUtility.SetDirty(material);
            return material;
        }

        static void CreateScene(Material baseMaterial)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var cameraGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var camera = cameraGo.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.063f, 0.09f, 0.118f);
            camera.fieldOfView = 45;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 200;
            cameraGo.AddComponent<UniversalAdditionalCameraData>();
            var orbit = cameraGo.AddComponent<OrbitCamera>();
            orbit.Apply();

            var lightGo = new GameObject("Sun");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.3f;
            lightGo.transform.rotation = Quaternion.Euler(50, -30, 0);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.7f, 0.73f, 0.78f);
            RenderSettings.ambientEquatorColor = new Color(0.42f, 0.44f, 0.47f);
            RenderSettings.ambientGroundColor = new Color(0.16f, 0.16f, 0.18f);

            var app = new GameObject("HallApp").AddComponent<HallApp>();
            app.orbit = orbit;
            app.baseMaterial = baseMaterial;
            app.library = AssetDatabase.LoadAssetAtPath<EquipmentLibrary>(BundleImporter.LibraryPath);

            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }
    }
}

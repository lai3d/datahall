using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace DataHall.Editor
{
    // 一次性工程配置：URP 管线资产、基础材质、Hall 场景和打包场景列表。
    // 命令行：Unity -batchmode -projectPath unity -executeMethod DataHall.Editor.ProjectSetup.Run -quit
    public static class ProjectSetup
    {
        public const string SettingsDir = "Assets/DataHall/Settings";
        public const string ScenePath = "Assets/DataHall/Scenes/Hall.unity";
        public const string BaseMaterialPath = SettingsDir + "/Base.mat";

        [MenuItem("DataHall/重新生成工程配置")]
        public static void Run()
        {
            Directory.CreateDirectory(SettingsDir);
            // 桌面模拟程序切到后台时继续运行；从终端启动做截图、冒烟测试时程序不在前台，关掉会停住主循环
            PlayerSettings.runInBackground = true;
            // URP 按线性色彩空间工作；glTF 的颜色因子本身也是线性值
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.productName = "GPU 机房";
            PlayerSettings.companyName = "DataHall";
            PlayerSettings.defaultScreenWidth = 1600;
            PlayerSettings.defaultScreenHeight = 1000;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            ConfigureUrp();
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

        static Material BaseMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(BaseMaterialPath);
            if (material) return material;
            material = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            AssetDatabase.CreateAsset(material, BaseMaterialPath);
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
            light.intensity = 1.2f;
            lightGo.transform.rotation = Quaternion.Euler(50, -30, 0);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.75f, 0.78f, 0.82f);
            RenderSettings.ambientEquatorColor = new Color(0.45f, 0.47f, 0.5f);
            RenderSettings.ambientGroundColor = new Color(0.2f, 0.2f, 0.22f);

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

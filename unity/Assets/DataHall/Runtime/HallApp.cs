using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace DataHall
{
    // 程序入口：读 layout.json，搭建机房，显示容量检查和选中设备的参数。
    // 命令行参数：
    //   -layout <path>          打开指定的 layout.json（默认 StreamingAssets/layout.json）
    //   -smokeTestOut <path>    搭建完成后把统计结果写成 JSON 并退出，用于自动化冒烟测试
    //   -screenshot <path>      渲染几帧后截图并退出
    public class HallApp : MonoBehaviour
    {
        public EquipmentLibrary library;
        public Material baseMaterial;
        public OrbitCamera orbit;

        LayoutData layout;
        CapacityResult capacity;
        GameObject hall;
        EquipmentInfo selected;
        string source;
        string error;
        readonly List<string> warnings = new List<string>();
        GUIStyle panel, title, body, bad, warn, ok;

        void Start()
        {
            source = Argument("-layout") ?? Path.Combine(Application.streamingAssetsPath, "layout.json");
            try { Load(File.ReadAllText(source)); }
            catch (Exception e) when (e is IOException || e is LayoutFormatException || e is UnauthorizedAccessException)
            {
                error = $"没有打开 {Path.GetFileName(source)}：{e.Message}";
                Debug.LogError(error);
            }

            var smoke = Argument("-smokeTestOut");
            if (smoke != null) { File.WriteAllText(smoke, SmokeReport()); Quit(); }
            var shot = Argument("-screenshot");
            if (shot != null) StartCoroutine(Screenshot(shot));
        }

        public void Load(string json)
        {
            if (hall) Destroy(hall);
            warnings.Clear();
            selected = null;
            layout = LayoutData.Parse(json);
            capacity = CapacityModel.Compute(layout);
            hall = HallBuilder.Build(layout, library, baseMaterial, warnings);
            foreach (var w in warnings.Distinct()) Debug.LogWarning(w);
        }

        string SmokeReport()
        {
            var sb = new StringBuilder("{");
            void Field(string name, string value, bool last = false) => sb.Append($"\"{name}\":{value}{(last ? "" : ",")}");
            Field("error", error == null ? "null" : "\"" + error.Replace("\"", "'") + "\"");
            if (layout != null)
            {
                var infos = hall.GetComponentsInChildren<EquipmentInfo>();
                Field("equipment", infos.Length.ToString());
                Field("placeholders", infos.Count(i => i.placeholder).ToString());
                Field("renderers", hall.GetComponentsInChildren<Renderer>().Length.ToString());
                Field("gpus", capacity.gpus.ToString());
                Field("itKw", capacity.itKw.ToString(System.Globalization.CultureInfo.InvariantCulture));
                Field("pue", capacity.pue.ToString("F4", System.Globalization.CultureInfo.InvariantCulture));
                Field("issues", capacity.issues.Count.ToString());
                var first = infos.FirstOrDefault();
                if (first)
                {
                    var p = first.transform.position;
                    var ci = System.Globalization.CultureInfo.InvariantCulture;
                    Field("first", "{\"name\":\"" + first.name + "\",\"x\":" + p.x.ToString("F3", ci) + ",\"z\":" + p.z.ToString("F3", ci) + "}");
                }
            }
            Field("renderPipeline", "\"" + (UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline ? UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline.GetType().Name : "builtin") + "\"", true);
            return sb.Append("}").ToString();
        }

        System.Collections.IEnumerator Screenshot(string path)
        {
            for (int i = 0; i < 5; i++) yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(path, texture.EncodeToPNG());
            Quit();
        }

        void Update()
        {
            if (hall == null || !Input.GetMouseButtonUp(0) || (orbit && orbit.Dragged)) return;
            if (Input.mousePosition.x > Screen.width - 380) return;        // 点在右侧面板上
            var cam = Camera.main;
            if (cam && Physics.Raycast(cam.ScreenPointToRay(Input.mousePosition), out var hit, 200f))
                selected = hit.collider.GetComponentInParent<EquipmentInfo>();
            else
                selected = null;
        }

        void OnGUI()
        {
            EnsureStyles();
            GUILayout.BeginArea(new Rect(Screen.width - 370, 10, 360, Screen.height - 20), panel);
            GUILayout.Label("GPU 机房", title);
            if (error != null) { GUILayout.Label(error, bad); GUILayout.EndArea(); return; }
            if (layout == null) { GUILayout.EndArea(); return; }
            GUILayout.Label($"{Path.GetFileName(source)}，{layout.equipment.Count} 台设备，市电 {layout.utilityMw} MW", body);
            GUILayout.Label($"GPU {capacity.gpus}　IT 负载 {CapacityModel.Format(capacity.itKw)}　PUE 估算 {(capacity.itKw > 0 ? capacity.pue.ToString("F2") : "–")}", body);
            GUILayout.Label($"硬件投入估算 约 ${capacity.capexMusd:F1}M", body);
            GUILayout.Space(8);
            GUILayout.Label("容量检查", title);
            if (layout.equipment.Count == 0) GUILayout.Label("机房是空的。", warn);
            foreach (var issue in capacity.issues) GUILayout.Label(issue.text, issue.level == "bad" ? bad : warn);
            if (layout.equipment.Count > 0 && !capacity.blocking) GUILayout.Label("检查通过，可以通电。", ok);
            GUILayout.Space(8);
            GUILayout.Label("详情", title);
            if (selected)
            {
                var c = selected.catalog;
                var p = selected.placement;
                GUILayout.Label($"{c.name}，第 {p.column + 1} 列第 {p.row + 1} 排（{p.name}）", body);
                if (c.powerKw > 0) GUILayout.Label($"功耗 {c.powerKw} kW　液冷 {Math.Round(c.liquidFraction * 100)}%", body);
                if (c.gpuCount > 0) GUILayout.Label($"GPU {c.gpuCount}", body);
                if (c.liquidCoolingKw > 0) GUILayout.Label($"液冷能力 {c.liquidCoolingKw} kW", body);
                if (c.airCoolingKw > 0) GUILayout.Label($"风冷能力 {c.airCoolingKw} kW", body);
                if (c.distributionKw > 0) GUILayout.Label($"配电能力 {c.distributionKw} kW", body);
                if (c.fabricPorts > 0) GUILayout.Label($"GPU 端口 {c.fabricPorts}", body);
                if (!string.IsNullOrEmpty(p.powerFeed)) GUILayout.Label($"配电来自 {p.powerFeed}", body);
                if (!string.IsNullOrEmpty(p.coolantSource)) GUILayout.Label($"冷却液来自 {p.coolantSource}", body);
            }
            else GUILayout.Label("点一台设备查看参数。拖动旋转视角，滚轮缩放。", body);
            GUILayout.EndArea();
        }

        void EnsureStyles()
        {
            if (panel != null) return;
            // 线性色彩空间下 IMGUI 把贴图数值当线性值显示，所以写入面板色（sRGB #16202A）的线性值
            var background = new Texture2D(1, 1);
            background.SetPixel(0, 0, new Color(0.086f, 0.125f, 0.165f, 0.92f).linear);
            background.Apply();
            panel = new GUIStyle(GUI.skin.box) { padding = new RectOffset(12, 12, 10, 10), normal = { background = background } };
            body = new GUIStyle(GUI.skin.label) { fontSize = 14, wordWrap = true, normal = { textColor = new Color(0.89f, 0.92f, 0.94f) } };
            title = new GUIStyle(body) { fontSize = 16, fontStyle = FontStyle.Bold };
            bad = new GUIStyle(body) { normal = { textColor = new Color(0.95f, 0.46f, 0.42f) } };
            warn = new GUIStyle(body) { normal = { textColor = new Color(0.91f, 0.77f, 0.28f) } };
            ok = new GUIStyle(body) { normal = { textColor = new Color(0.55f, 0.76f, 0.29f) } };
        }

        static string Argument(string name)
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        static void Quit()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit(0);
#endif
        }
    }
}

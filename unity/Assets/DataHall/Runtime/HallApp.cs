using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace DataHall
{
    // App entry point: reads layout.json, builds the hall, shows the capacity check and the selected equipment's parameters.
    // Command line arguments:
    //   -layout <path>          open the given layout.json (default StreamingAssets/layout.json)
    //   -smokeTestOut <path>    after building, write stats as JSON and exit, for automated smoke tests
    //   -screenshot <path>      render a few frames, take a screenshot and exit
    //   -nativeSmokeOut <path>  (needs a window, not batchmode) check the native plugin: drop the file given by -nativeSmokeLayout, an auto-cancelled file dialog, keeping the current hall when opening fails
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
        string error;                 // error when there is no hall to show at all
        string notice;                // notice when opening a new file fails; the current hall is kept
        bool openRequested;
        bool dropReady;
        int dropAttempts;
        int dropResult;
        float dropRefreshAt;
        readonly List<string> warnings = new List<string>();
        GUIStyle panel, title, body, bad, warn, ok, button;

        void Start()
        {
            source = Argument("-layout") ?? Path.Combine(Application.streamingAssetsPath, "layout.json");
            Open(source);

            var smoke = Argument("-smokeTestOut");
            if (smoke != null) { File.WriteAllText(smoke, SmokeReport()); Quit(); }
            var shot = Argument("-screenshot");
            if (shot != null) StartCoroutine(Screenshot(shot));
            var nativeSmoke = Argument("-nativeSmokeOut");
            if (nativeSmoke != null) StartCoroutine(NativeSmoke(nativeSmoke));
        }

        // Open layout.json. On failure, if a hall is already showing, keep it and show the reason
        public bool Open(string path)
        {
            if (!LayoutFile.TryRead(path, out var next, out var reason))
            {
                Debug.LogWarning(reason);
                if (layout == null) error = reason;
                else notice = reason;
                return false;
            }
            if (hall) Destroy(hall);
            warnings.Clear();
            selected = null;
            error = notice = null;
            source = path;
            layout = next;
            capacity = CapacityModel.Compute(layout);
            hall = HallBuilder.Build(layout, library, baseMaterial, warnings);
            foreach (var w in warnings.Distinct()) Debug.LogWarning(w);
            return true;
        }

        System.Collections.IEnumerator NativeSmoke(string outPath)
        {
            for (int i = 0; i < 10; i++) yield return null;             // wait for the window to be created and drop registration
            var dropLayout = Argument("-nativeSmokeLayout");
            Debug.Log("DataHall: content view " + NativeMac.DescribeContentView());
            var accepted = dropLayout != null && NativeMac.TestDrop(dropLayout);
            for (int i = 0; i < 3; i++) yield return null;              // Update picks up the dropped file and opens it
            var afterDrop = (source: Path.GetFileName(source), equipment: layout?.equipment.Count ?? -1);
            var dialog = NativeMac.OpenFile("冒烟测试", "json", 0.5);
            var missingKept = !Open("/nonexistent/layout.json") && layout != null && layout.equipment.Count == afterDrop.equipment && notice != null;
            string B(bool b) => b ? "true" : "false";
            File.WriteAllText(outPath, "{" +
                $"\"version\":{NativeMac.Version},\"dropReady\":{B(dropReady)},\"dropResult\":{dropResult},\"dropAttempts\":{dropAttempts},\"testDropAccepted\":{B(accepted)}," +
                $"\"sourceAfterDrop\":\"{afterDrop.source}\",\"equipmentAfterDrop\":{afterDrop.equipment}," +
                $"\"dialogCancelledToNull\":{B(dialog == null)},\"failedOpenKeepsHall\":{B(missingKept)}}}");
            Quit();
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
            // Drop can only be registered once the window exists, so the first frames may return 0; retry for a while. Once enabled,
            // re-register every 2 seconds so drop keeps working when toggling fullscreen recreates the window
            if (!dropReady && dropAttempts < 300)
            {
                dropResult = NativeMac.EnableFileDrop();
                dropAttempts++;
                dropReady = dropResult == 1;
                if (dropResult != 0)
                {
                    Debug.Log($"DataHall: file drop {(dropReady ? "enabled" : "unavailable")} ({dropResult}) after {dropAttempts} frames");
                    if (!dropReady) dropAttempts = 300;
                }
            }
            else if (dropReady && Time.unscaledTime > dropRefreshAt)
            {
                dropRefreshAt = Time.unscaledTime + 2f;
                NativeMac.EnableFileDrop();
            }
            var dropped = dropReady ? NativeMac.PollDroppedFile() : null;
            if (dropped != null) Open(dropped);
            // Show the modal dialog outside OnGUI so it does not break IMGUI layout events
            if (openRequested)
            {
                openRequested = false;
                var path = NativeMac.OpenFile("选择网页“导出给 Unity”得到的 layout.json", "json");
                if (path != null) Open(path);
            }

            if (hall == null || !Input.GetMouseButtonUp(0) || (orbit && orbit.Dragged)) return;
            if (Input.mousePosition.x > Screen.width - 380) return;        // click is on the right-hand panel
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
            if (NativeMac.CanOpenFiles && GUILayout.Button("打开 layout.json…", button, GUILayout.Height(30))) openRequested = true;
            if (dropReady) GUILayout.Label("也可以把 layout.json 拖进窗口。", body);
            if (notice != null) GUILayout.Label(notice, bad);
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
            // In linear color space IMGUI displays texture values as linear, so write the linear value of the panel color (sRGB #16202A)
            Texture2D Solid(Color srgb)
            {
                var t = new Texture2D(1, 1);
                t.SetPixel(0, 0, srgb.linear);
                t.Apply();
                return t;
            }
            var background = Solid(new Color(0.086f, 0.125f, 0.165f, 0.92f));
            panel = new GUIStyle(GUI.skin.box) { padding = new RectOffset(12, 12, 10, 10), normal = { background = background } };
            body = new GUIStyle(GUI.skin.label) { fontSize = 14, wordWrap = true, normal = { textColor = new Color(0.89f, 0.92f, 0.94f) } };
            title = new GUIStyle(body) { fontSize = 16, fontStyle = FontStyle.Bold };
            bad = new GUIStyle(body) { normal = { textColor = new Color(0.95f, 0.46f, 0.42f) } };
            warn = new GUIStyle(body) { normal = { textColor = new Color(0.91f, 0.77f, 0.28f) } };
            ok = new GUIStyle(body) { normal = { textColor = new Color(0.55f, 0.76f, 0.29f) } };
            // Buttons: dark fill with a coolant-cyan outline feel, light text matching the web version's buttons
            button = new GUIStyle(GUI.skin.button)
            {
                fontSize = 14,
                normal = { background = Solid(new Color(0.16f, 0.22f, 0.28f)), textColor = new Color(0.89f, 0.92f, 0.94f) },
                hover = { background = Solid(new Color(0.2f, 0.29f, 0.36f)), textColor = Color.white },
                active = { background = Solid(new Color(0.09f, 0.45f, 0.5f)), textColor = Color.white },
            };
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

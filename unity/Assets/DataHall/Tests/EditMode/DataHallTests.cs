using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace DataHall.Tests
{
    static class Repo
    {
        // The parent of the unity/ project is the repo root
        public static string Path(string relative) => System.IO.Path.GetFullPath(System.IO.Path.Combine(Application.dataPath, "..", "..", relative));
        public static string SampleLayout => File.ReadAllText(System.IO.Path.Combine(Application.dataPath, "StreamingAssets", "layout.json"));
    }

    public class LayoutDataTests
    {
        [Test]
        public void ParsesSampleLayout()
        {
            var layout = LayoutData.Parse(Repo.SampleLayout);
            Assert.AreEqual(17, layout.equipment.Count);
            Assert.AreEqual(5, layout.utilityMw);
            Assert.AreEqual((16, 10), (layout.grid.columns, layout.grid.rows));
            var r = layout.equipment.Find(e => e.name == "R04_C04");
            Assert.AreEqual(("vr200", 3, 3, "R06_C07", "R06_C04"), (r.type, r.column, r.row, r.powerFeed, r.coolantSource));
            Assert.AreEqual(190, layout.Find("vr200").powerKw);
        }

        static string Mutate(string from, string to)
        {
            var json = Repo.SampleLayout;
            Assert.That(json, Does.Contain(from));
            return json.Replace(from, to);
        }

        [TestCase("\"format\": \"dchall.layout\"", "\"format\": \"other\"", "不是机房布局文件")]
        [TestCase("\"version\": 1", "\"version\": 2", "不支持的布局版本 2")]
        [TestCase("\"utilityMw\": 5", "\"utilityMw\": 0", "utilityMw 必须大于 0")]
        [TestCase("\"type\": \"stor\"", "\"type\": \"nope\"", "设备类型 nope 不在目录里")]
        [TestCase("\"column\": 14", "\"column\": 40", "超出 16 列 × 10 排")]
        [TestCase("\"coolantSource\": \"R06_C04\"", "\"coolantSource\": \"R99_C99\"", "指向不存在的设备 R99_C99")]
        public void RejectsInvalidLayouts(string from, string to, string message)
        {
            var e = Assert.Throws<LayoutFormatException>(() => LayoutData.Parse(Mutate(from, to)));
            Assert.That(e.Message, Does.Contain(message));
        }

        [Test]
        public void RejectsNonJsonAndOverlaps()
        {
            Assert.Throws<LayoutFormatException>(() => LayoutData.Parse("#usda 1.0"));
            var layout = LayoutData.Parse(Repo.SampleLayout);
            layout.equipment[1].column = layout.equipment[0].column;
            layout.equipment[1].row = layout.equipment[0].row;
            var e = Assert.Throws<LayoutFormatException>(() => LayoutData.Parse(JsonUtility.ToJson(layout)));
            Assert.That(e.Message, Does.Contain("占用同一格"));
        }
    }

    public class LayoutFileTests
    {
        string dir;

        [SetUp]
        public void CreateDir() { dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "datahall-" + System.Guid.NewGuid()); Directory.CreateDirectory(dir); }

        [TearDown]
        public void RemoveDir() => Directory.Delete(dir, true);

        string Write(string name, string text) { var p = System.IO.Path.Combine(dir, name); File.WriteAllText(p, text); return p; }

        [Test]
        public void ReadsValidLayout()
        {
            Assert.IsTrue(LayoutFile.TryRead(Write("layout.json", Repo.SampleLayout), out var layout, out var error), error);
            Assert.AreEqual(17, layout.equipment.Count);
            Assert.IsNull(error);
        }

        [Test]
        public void ExplainsFailuresWithoutThrowing()
        {
            Assert.IsFalse(LayoutFile.TryRead(System.IO.Path.Combine(dir, "missing.json"), out var layout, out var error));
            Assert.IsNull(layout);
            Assert.AreEqual("找不到文件 missing.json。", error);

            Assert.IsFalse(LayoutFile.TryRead(Write("datahall.usda", "#usda 1.0\n"), out _, out error));
            Assert.That(error, Does.StartWith("datahall.usda 无法打开：不是有效的 JSON"));

            Assert.IsFalse(LayoutFile.TryRead(Write("other.json", "{\"format\": \"other\"}"), out _, out error));
            Assert.That(error, Does.Contain("不是机房布局文件"));
        }
    }

    public class CapacityModelTests
    {
        [System.Serializable]
        class Expected
        {
            public double itKw, liquidHeatKw, airHeatKw, liquidCapacityKw, airCapacityKw, distributionKw, overheadKw, capexMusd, facilityKw, pue;
            public int gpus, fabricPorts;
            public bool blocking;
            public List<CapacityIssue> issues;
        }

        [System.Serializable]
        class Case
        {
            public string name;
            public LayoutData layout;
            public Expected expected;
        }

        [System.Serializable]
        class CasesFile
        {
            public List<Case> cases;
        }

        [Test]
        public void MatchesWebSimForEveryCase()
        {
            var file = JsonUtility.FromJson<CasesFile>(File.ReadAllText(Repo.Path("spec/capacity-cases.json")));
            Assert.AreEqual(7, file.cases.Count);
            foreach (var c in file.cases)
            {
                var s = CapacityModel.Compute(LayoutData.Parse(JsonUtility.ToJson(c.layout)));
                var x = c.expected;
                void Near(double want, double got, string field) => Assert.AreEqual(want, got, 1e-9, $"{c.name}: {field}");
                Near(x.itKw, s.itKw, "itKw"); Near(x.liquidHeatKw, s.liquidHeatKw, "liquidHeatKw"); Near(x.airHeatKw, s.airHeatKw, "airHeatKw");
                Near(x.liquidCapacityKw, s.liquidCapacityKw, "liquidCapacityKw"); Near(x.airCapacityKw, s.airCapacityKw, "airCapacityKw");
                Near(x.distributionKw, s.distributionKw, "distributionKw"); Near(x.overheadKw, s.overheadKw, "overheadKw");
                Near(x.capexMusd, s.capexMusd, "capexMusd"); Near(x.facilityKw, s.facilityKw, "facilityKw"); Near(x.pue, s.pue, "pue");
                Assert.AreEqual((x.gpus, x.fabricPorts, x.blocking), (s.gpus, s.fabricPorts, s.blocking), c.name);
                CollectionAssert.AreEqual(x.issues.Select(i => i.level + " " + i.text), s.issues.Select(i => i.level + " " + i.text), c.name);
            }
        }

        [Test]
        public void FormatsLikeJavaScript()
        {
            Assert.AreEqual("1000 kW", CapacityModel.Format(999.6));
            Assert.AreEqual("0 kW", CapacityModel.Format(0.4));
            Assert.AreEqual("3 kW", CapacityModel.Format(2.5));
            Assert.AreEqual("1.27 MW", CapacityModel.Format(1269.8));
        }
    }

    public class AxisProbeTests
    {
        const string Fixture = "Assets/DataHall/Tests/EditMode/Fixtures/axis_probe.glb";

        [TestCase("marker_x", 1f, 0f, 0.5f)]
        [TestCase("marker_front", 0f, -1f, 0.5f)]
        [TestCase("marker_up", 0f, 0f, 2f)]
        public void GlbMarkersLandWhereHallCoordinatesSays(string marker, float x, float y, float z)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(Fixture);
            Assert.IsNotNull(model, "axis_probe.glb was not imported by glTFast");
            var instance = Object.Instantiate(model);
            try
            {
                var renderer = instance.GetComponentsInChildren<Renderer>().Single(r => r.name == marker);
                var want = HallCoordinates.UsdToUnity(new Vector3(x, y, z));
                Assert.That(Vector3.Distance(want, renderer.bounds.center), Is.LessThan(1e-3f), $"{marker}: want {want}, got {renderer.bounds.center}");
            }
            finally { Object.DestroyImmediate(instance); }
        }

        [Test]
        public void CellCenterMatchesUsdExportTranslate()
        {
            // In samples/datahall.usda, R04_C04 has xformOp:translate = (-2.7, 1.8, 0)
            var grid = new LayoutGrid { columns = 16, rows = 10, cellWidthM = 0.6f, cellDepthM = 1.2f };
            Assert.That(Vector3.Distance(HallCoordinates.UsdToUnity(new Vector3(-2.7f, 1.8f, 0)), HallCoordinates.CellCenter(grid, 3, 3)), Is.LessThan(1e-4f));
        }
    }

    public class HallBuilderTests
    {
        GameObject hall;

        [TearDown]
        public void Cleanup() { if (hall) Object.DestroyImmediate(hall); }

        [Test]
        public void BuildsSampleWithImportedModels()
        {
            var layout = LayoutData.Parse(Repo.SampleLayout);
            var library = AssetDatabase.LoadAssetAtPath<EquipmentLibrary>(Editor.BundleImporter.LibraryPath);
            Assert.IsNotNull(library, "run tools/unity_sync.sh first");
            var warnings = new List<string>();
            hall = HallBuilder.Build(layout, library, null, warnings);
            var infos = hall.GetComponentsInChildren<EquipmentInfo>();
            Assert.AreEqual(17, infos.Length);
            Assert.IsEmpty(warnings);
            foreach (var info in infos)
            {
                Assert.IsFalse(info.placeholder, info.name);
                Assert.That(Vector3.Distance(HallCoordinates.CellCenter(layout.grid, info.placement.column, info.placement.row), info.transform.position), Is.LessThan(1e-4f));
                Assert.IsNotNull(info.GetComponent<BoxCollider>(), info.name);
            }
            var vr = infos.First(i => i.name == "R04_C04");
            var body = vr.GetComponentsInChildren<Renderer>().Single(r => r.name == "Body").bounds;
            var front = vr.GetComponentsInChildren<Renderer>().Single(r => r.name == "Front").bounds;
            Assert.AreEqual(0f, body.min.y, 1e-3f);
            Assert.AreEqual(2.3f, body.max.y, 1e-3f);
            Assert.AreEqual(1.128f, body.size.z, 1e-3f);                       // depth 1.2 × 0.94 along Z
            Assert.Greater(front.center.z - vr.transform.position.z, 0.5f);      // front faces +Z
        }

        [Test]
        public void UsesPlaceholdersWithoutLibrary()
        {
            var layout = LayoutData.Parse(Repo.SampleLayout);
            var warnings = new List<string>();
            hall = HallBuilder.Build(layout, null, null, warnings);
            Assert.IsTrue(hall.GetComponentsInChildren<EquipmentInfo>().All(i => i.placeholder));
            Assert.That(warnings, Has.Some.Contains("vr200 没有模型"));
        }
    }

    public class BundleImportTests
    {
        [Test]
        public void HallSceneReferencesLibraryAndBaseMaterial()
        {
            // A built app can only reach the equipment library through the scene reference; if it is lost, everything becomes placeholder boxes
            var scene = UnityEditor.SceneManagement.EditorSceneManager.OpenScene(Editor.ProjectSetup.ScenePath, UnityEditor.SceneManagement.OpenSceneMode.Single);
            var app = Object.FindFirstObjectByType<HallApp>();
            Assert.IsNotNull(app);
            Assert.AreEqual(Editor.BundleImporter.LibraryPath, AssetDatabase.GetAssetPath(app.library));
            Assert.AreEqual(Editor.ProjectSetup.BaseMaterialPath, AssetDatabase.GetAssetPath(app.baseMaterial));
            Assert.IsNotNull(app.orbit);
            CollectionAssert.AreEqual(new[] { Editor.ProjectSetup.ScenePath }, EditorBuildSettings.scenes.Select(x => x.path));
        }

        [System.Serializable]
        class CatalogItem { public string id; }

        [System.Serializable]
        class CatalogFile { public List<CatalogItem> items; }

        [Test]
        public void EveryCatalogTypeHasPrefabVariantOfItsModel()
        {
            // spec/catalog.json is authoritative: every type placeable on the web needs a model in Unity, otherwise it falls back to a placeholder box
            var catalog = JsonUtility.FromJson<CatalogFile>(File.ReadAllText(Repo.Path("spec/catalog.json")));
            var library = AssetDatabase.LoadAssetAtPath<EquipmentLibrary>(Editor.BundleImporter.LibraryPath);
            Assert.AreEqual(10, catalog.items.Count);
            CollectionAssert.AreEquivalent(catalog.items.Select(i => i.id), library.entries.Select(e => e.id));
            foreach (var entry in catalog.items)
            {
                var prefab = library.Find(entry.id);
                Assert.IsNotNull(prefab, entry.id);
                Assert.AreEqual(PrefabAssetType.Variant, PrefabUtility.GetPrefabAssetType(prefab), entry.id);
                var source = PrefabUtility.GetCorrespondingObjectFromSource(prefab);
                Assert.AreEqual($"{Editor.BundleImporter.ModelsDir}/{entry.id}.glb", AssetDatabase.GetAssetPath(source), entry.id);
            }
        }
    }
}

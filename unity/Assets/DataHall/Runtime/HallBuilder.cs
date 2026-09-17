using System.Collections.Generic;
using UnityEngine;

namespace DataHall
{
    // Builds the hall from layout.json: floor and equipment instances. Types without a prefab get a box sized by height and colored by category
    public static class HallBuilder
    {
        public const string RootName = "DataHall";

        // baseMaterial: material template for the floor and placeholder boxes. In a built app Shader.Find cannot find unreferenced shaders, so the scene passes it in
        public static GameObject Build(LayoutData layout, EquipmentLibrary library, Material baseMaterial = null, List<string> warnings = null)
        {
            var root = new GameObject(RootName);
            var floorSize = HallCoordinates.FloorSize(layout.grid);
            var floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
            floor.name = "Floor";
            floor.transform.SetParent(root.transform, false);
            floor.transform.localPosition = new Vector3(0, -0.01f, 0);
            floor.transform.localScale = new Vector3(floorSize.x, 0.02f, floorSize.y);
            Paint(floor, new Color(0.1647f, 0.2078f, 0.251f), baseMaterial);

            var equipmentRoot = new GameObject("Equipment").transform;
            equipmentRoot.SetParent(root.transform, false);
            foreach (var e in layout.equipment)
            {
                var entry = layout.Find(e.type);
                var prefab = library ? library.Find(e.type) : null;
                GameObject go;
                if (prefab)
                {
                    go = Object.Instantiate(prefab, equipmentRoot, false);
                }
                else
                {
                    warnings?.Add($"{e.type} 没有模型，用方块代替。");
                    go = Placeholder(entry, layout.grid, baseMaterial);
                    go.transform.SetParent(equipmentRoot, false);
                }
                go.name = e.name;
                go.transform.localPosition = HallCoordinates.CellCenter(layout.grid, e.column, e.row);
                go.transform.localRotation = Quaternion.identity;
                var info = go.AddComponent<EquipmentInfo>();
                info.placement = e;
                info.catalog = entry;
                info.placeholder = !prefab;
                EnsureCollider(go);
            }
            return root;
        }

        static GameObject Placeholder(CatalogEntry entry, LayoutGrid grid, Material baseMaterial)
        {
            var go = new GameObject();
            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = "Body";
            body.transform.SetParent(go.transform, false);
            body.transform.localScale = new Vector3(grid.cellWidthM * .92f, entry.heightM, grid.cellDepthM * .94f);
            body.transform.localPosition = new Vector3(0, entry.heightM / 2, 0);
            Paint(body, entry.category == "gpu" ? new Color(0.46f, 0.73f, 0f) : entry.category == "net" ? new Color(0.6f, 0.55f, 0.88f) : new Color(0.25f, 0.71f, 0.79f), baseMaterial);
            Object.DestroyImmediate(body.GetComponent<Collider>());
            return go;
        }

        // For selection: add a box collider to the equipment root, sized to the renderer bounds
        static void EnsureCollider(GameObject go)
        {
            if (go.GetComponent<Collider>()) return;
            var renderers = go.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0) return;
            var bounds = renderers[0].bounds;
            foreach (var r in renderers) bounds.Encapsulate(r.bounds);
            var box = go.AddComponent<BoxCollider>();
            box.center = go.transform.InverseTransformPoint(bounds.center);
            box.size = bounds.size;
        }

        static void Paint(GameObject go, Color color, Material baseMaterial)
        {
            var material = baseMaterial ? new Material(baseMaterial) : new Material(Shader.Find("Universal Render Pipeline/Lit"));
            material.color = color;
            go.GetComponent<Renderer>().sharedMaterial = material;
        }
    }
}

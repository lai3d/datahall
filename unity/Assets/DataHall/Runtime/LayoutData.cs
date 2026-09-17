using System;
using System.Collections.Generic;
using UnityEngine;

namespace DataHall
{
    // Data structures for layout.json, defined in spec/layout.schema.json. Field names match the JSON for JsonUtility deserialization.
    [Serializable]
    public class LayoutGrid
    {
        public int columns;
        public int rows;
        public float cellWidthM;
        public float cellDepthM;
    }

    [Serializable]
    public class CatalogEntry
    {
        public string id;
        public string name;
        public string category;
        public double powerKw;
        public int gpuCount;
        public double liquidFraction;
        public double liquidCoolingKw;
        public double airCoolingKw;
        public double overheadKw;
        public double distributionKw;
        public int fabricPorts;
        public double capexMusd;
        public bool roadmap;
        public float heightM;
    }

    [Serializable]
    public class PlacedEquipment
    {
        public string name;
        public string type;
        public int column;
        public int row;
        public string powerFeed;
        public string coolantSource;
    }

    public class LayoutFormatException : Exception
    {
        public LayoutFormatException(string message) : base(message) { }
    }

    [Serializable]
    public class LayoutData
    {
        public const string Format = "dchall.layout";
        public const int Version = 1;

        public string format;
        public int version;
        public string generator;
        public string generated;
        public LayoutGrid grid;
        public double utilityMw;
        public List<CatalogEntry> catalog = new List<CatalogEntry>();
        public List<PlacedEquipment> equipment = new List<PlacedEquipment>();

        public CatalogEntry Find(string id) => catalog.Find(c => c.id == id);

        // Parse and validate. Structural errors fail outright with no partial import: layout.json is tool-generated, so an error means the file itself is broken
        public static LayoutData Parse(string json)
        {
            LayoutData data;
            try { data = JsonUtility.FromJson<LayoutData>(json); }
            catch (ArgumentException e) { throw new LayoutFormatException("不是有效的 JSON：" + e.Message); }
            if (data == null) throw new LayoutFormatException("文件是空的。");
            if (data.format != Format) throw new LayoutFormatException($"不是机房布局文件（format 应为 {Format}）。");
            if (data.version != Version) throw new LayoutFormatException($"不支持的布局版本 {data.version}，当前只支持 {Version}。");
            if (data.grid == null || data.grid.columns <= 0 || data.grid.rows <= 0 || data.grid.cellWidthM <= 0 || data.grid.cellDepthM <= 0)
                throw new LayoutFormatException("网格尺寸缺失或无效。");
            if (!(data.utilityMw > 0)) throw new LayoutFormatException("市电容量 utilityMw 必须大于 0。");

            var ids = new HashSet<string>();
            foreach (var c in data.catalog)
                if (string.IsNullOrEmpty(c.id) || !ids.Add(c.id)) throw new LayoutFormatException($"设备目录里的 id “{c.id}” 为空或重复。");
            var names = new HashSet<string>();
            var cells = new HashSet<(int, int)>();
            foreach (var e in data.equipment)
            {
                if (!ids.Contains(e.type)) throw new LayoutFormatException($"{e.name} 的设备类型 {e.type} 不在目录里。");
                if (e.column < 0 || e.column >= data.grid.columns || e.row < 0 || e.row >= data.grid.rows)
                    throw new LayoutFormatException($"{e.name} 的位置超出 {data.grid.columns} 列 × {data.grid.rows} 排的网格。");
                if (!names.Add(e.name)) throw new LayoutFormatException($"设备名 {e.name} 重复。");
                if (!cells.Add((e.column, e.row))) throw new LayoutFormatException($"{e.name} 和其他设备占用同一格。");
            }
            foreach (var e in data.equipment)
            {
                if (!string.IsNullOrEmpty(e.powerFeed) && !names.Contains(e.powerFeed)) throw new LayoutFormatException($"{e.name} 的 powerFeed 指向不存在的设备 {e.powerFeed}。");
                if (!string.IsNullOrEmpty(e.coolantSource) && !names.Contains(e.coolantSource)) throw new LayoutFormatException($"{e.name} 的 coolantSource 指向不存在的设备 {e.coolantSource}。");
            }
            return data;
        }
    }
}

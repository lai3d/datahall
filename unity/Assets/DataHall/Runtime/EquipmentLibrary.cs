using System;
using System.Collections.Generic;
using UnityEngine;

namespace DataHall
{
    // 设备类型 id → prefab。由编辑器菜单 DataHall/导入布局包 生成和更新；
    // prefab 是 glb 模型的变体，交互（托盘、碰撞体、高亮）加在变体上，重新导入几何时不会丢
    [CreateAssetMenu(menuName = "DataHall/Equipment Library")]
    public class EquipmentLibrary : ScriptableObject
    {
        [Serializable]
        public class Entry
        {
            public string id;
            public GameObject prefab;
        }

        public List<Entry> entries = new List<Entry>();

        public GameObject Find(string id) => entries.Find(e => e.id == id)?.prefab;

        public void Set(string id, GameObject prefab)
        {
            var entry = entries.Find(e => e.id == id);
            if (entry == null) entries.Add(new Entry { id = id, prefab = prefab });
            else entry.prefab = prefab;
            entries.Sort((a, b) => string.CompareOrdinal(a.id, b.id));
        }
    }
}

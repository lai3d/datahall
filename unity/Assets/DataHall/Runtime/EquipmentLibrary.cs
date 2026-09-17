using System;
using System.Collections.Generic;
using UnityEngine;

namespace DataHall
{
    // Equipment type id → prefab. Created and updated by the editor menu DataHall/Import Layout Bundle;
    // prefabs are variants of the glb models, and interaction (trays, colliders, highlight) is added on the variants so it survives geometry reimports
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

using UnityEngine;

namespace DataHall
{
    // Attached to each placed piece of equipment; holds its layout.json data for inspection when selected
    public class EquipmentInfo : MonoBehaviour
    {
        public PlacedEquipment placement;
        public CatalogEntry catalog;
        public bool placeholder;
    }
}

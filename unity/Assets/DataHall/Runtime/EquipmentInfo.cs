using UnityEngine;

namespace DataHall
{
    // 挂在每台摆放好的设备上，保存 layout.json 里的信息，供选中查看
    public class EquipmentInfo : MonoBehaviour
    {
        public PlacedEquipment placement;
        public CatalogEntry catalog;
        public bool placeholder;
    }
}

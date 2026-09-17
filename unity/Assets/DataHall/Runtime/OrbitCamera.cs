using UnityEngine;

namespace DataHall
{
    // 轨道相机：右键或左键拖动旋转，滚轮缩放，与网页版的操作一致
    public class OrbitCamera : MonoBehaviour
    {
        public Vector3 target = new Vector3(0, 0.8f, 0);
        public float distance = 17f;
        public float yaw = 137f;           // 从设备正面（+Z）一侧斜看，和网页版初始视角一致
        public float pitch = 35f;
        public float minDistance = 5f, maxDistance = 34f;

        Vector3 lastMouse;
        bool dragging;
        public bool Dragged { get; private set; }

        void Start() => Apply();

        void LateUpdate()
        {
            if (Input.GetMouseButtonDown(0) || Input.GetMouseButtonDown(1)) { lastMouse = Input.mousePosition; dragging = true; Dragged = false; }
            if (Input.GetMouseButtonUp(0) || Input.GetMouseButtonUp(1)) dragging = false;
            if (dragging && (Input.GetMouseButton(0) || Input.GetMouseButton(1)))
            {
                var delta = Input.mousePosition - lastMouse;
                lastMouse = Input.mousePosition;
                if (delta.sqrMagnitude > 0.5f) Dragged = true;
                yaw += delta.x * 0.3f;
                pitch = Mathf.Clamp(pitch - delta.y * 0.3f, 5f, 85f);
            }
            var scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0) distance = Mathf.Clamp(distance * (1 - scroll * 0.08f), minDistance, maxDistance);
            Apply();
        }

        public void Apply()
        {
            var rotation = Quaternion.Euler(pitch, yaw, 0);
            transform.position = target + rotation * new Vector3(0, 0, -distance);
            transform.rotation = rotation;
        }
    }
}

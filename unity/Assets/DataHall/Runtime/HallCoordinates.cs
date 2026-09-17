using UnityEngine;

namespace DataHall
{
    // 网格位置到 Unity 世界坐标。三套坐标的对应关系：
    //   USD（Z 向上，右手）：x = (column - (columns-1)/2) * cellWidth，y = -((row - (rows-1)/2) * cellDepth)
    //   glTF（Y 向上，右手）：tools/usd_to_unity.py 做 (x, y, z) → (x, z, -y)
    //   Unity（Y 向上，左手）：glTFast 导入时翻转 X，(x, y, z) → (-x, y, z)
    // 合起来 USD (x, y, z) → Unity (-x, z, -y)。设备正面在 USD 是 -Y，在 Unity 是 +Z。
    // AxisProbeTests 用一个三个方向各有标记的 glb 核对这条链路。
    public static class HallCoordinates
    {
        public static Vector3 UsdToUnity(Vector3 usd) => new Vector3(-usd.x, usd.z, -usd.y);

        public static Vector3 CellCenterUsd(LayoutGrid grid, int column, int row) => new Vector3(
            (column - (grid.columns - 1) / 2f) * grid.cellWidthM,
            -((row - (grid.rows - 1) / 2f) * grid.cellDepthM),
            0f);

        public static Vector3 CellCenter(LayoutGrid grid, int column, int row) => UsdToUnity(CellCenterUsd(grid, column, row));

        // 地板尺寸，和 USD 导出的 Floor 一致：网格外各留 0.3 m
        public static Vector2 FloorSize(LayoutGrid grid) => new Vector2(grid.columns * grid.cellWidthM + 0.6f, grid.rows * grid.cellDepthM + 0.6f);
    }
}

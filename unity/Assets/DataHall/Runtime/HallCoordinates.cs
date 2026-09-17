using UnityEngine;

namespace DataHall
{
    // Grid position to Unity world coordinates. How the three coordinate systems relate:
    //   USD (Z up, right-handed): x = (column - (columns-1)/2) * cellWidth, y = -((row - (rows-1)/2) * cellDepth)
    //   glTF (Y up, right-handed): tools/usd_to_unity.py maps (x, y, z) → (x, z, -y)
    //   Unity (Y up, left-handed): glTFast flips X on import, (x, y, z) → (-x, y, z)
    // Combined: USD (x, y, z) → Unity (-x, z, -y). The equipment front is -Y in USD and +Z in Unity.
    // AxisProbeTests checks this chain with a glb that has a marker along each of the three axes.
    public static class HallCoordinates
    {
        public static Vector3 UsdToUnity(Vector3 usd) => new Vector3(-usd.x, usd.z, -usd.y);

        public static Vector3 CellCenterUsd(LayoutGrid grid, int column, int row) => new Vector3(
            (column - (grid.columns - 1) / 2f) * grid.cellWidthM,
            -((row - (grid.rows - 1) / 2f) * grid.cellDepthM),
            0f);

        public static Vector3 CellCenter(LayoutGrid grid, int column, int row) => UsdToUnity(CellCenterUsd(grid, column, row));

        // Floor size, same as the Floor in the USD export: 0.3 m margin around the grid
        public static Vector2 FloorSize(LayoutGrid grid) => new Vector2(grid.columns * grid.cellWidthM + 0.6f, grid.rows * grid.cellDepthM + 0.6f);
    }
}

// Everyday scale references for the IT load in the HUD. Rough figures for a feel of size, not engineering data:
// - DGX Spark: 240 W, the rating of its power adapter (NVIDIA DGX Spark specifications)
// - US home: about 10,500 kWh a year on average (US EIA residential energy data), about 1.2 kW around the clock
export const SPARK_KW = 0.24;
export const HOME_KW = 1.2;

// Two significant figures, so the numbers read as the approximations they are
const rough = (n: number): number => n >= 100 ? Number(n.toPrecision(2)) : Math.round(n);

export function scaleRefs(itKw: number): {sparks: number; homes: number}{
  return {sparks: rough(itKw / SPARK_KW), homes: rough(itKw / HOME_KW)};
}

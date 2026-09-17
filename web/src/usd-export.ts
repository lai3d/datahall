// OpenUSD export: pure functions, no DOM or three dependency, testable directly in node
// Coordinate conversion: (x, y, z)_three → (x, -z, y)_usd, Z up, meters
// Attributes are defined by DataHallAPI, DataHallEquipmentAPI and LiquidCooledAPI in schema/schema.usda;
// when changing attributes, change the schema first; web tests check that both sides agree
import {equipmentName, supplyLinks} from './grid.ts';
import type {Catalog, Grid, Item} from './types.ts';

export interface ExportMeta {date: string}
type Vec3 = [number, number, number];

// meta.date: generation date YYYY-MM-DD, passed in by the caller to keep the function pure (usd_date_generated for SimReady SR.001)
export function buildUsda(list: Item[], CAT: Catalog, utility: number, g: Grid, meta: ExportMeta): string{
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta?.date || '')) throw new Error('buildUsda: meta.date must be YYYY-MM-DD');
  const PALETTE: Record<string, string> = {gpu:'#76B900', amd:'#E0609A', huawei:'#4C8DFF', net:'#9A8CE0', store:'#7FA2C4', coolant:'#3FB6C9', air:'#9AA8B5', copper:'#D08A45', rack:'#34404B', floor:'#2A3540'};
  const f = (v: number): string => { const s = (Math.round(v * 10000) / 10000).toString(); return s.includes('.') || s.includes('e') ? s : s + '.0'; };
  // USD displayColor and UsdPreviewSurface colors are linear; the palette is sRGB, so convert before writing
  const linear = (c: number): number => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const rgb = (h: string): string => { const n = parseInt(h.slice(1), 16); return `(${[n >> 16 & 255, n >> 8 & 255, n & 255].map(v => f(linear(v / 255))).join(', ')})`; };
  const str = (s: string): string => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const primName = equipmentName;
  const pos = (it: Item): [number, number] => [(it.x - (g.GW - 1) / 2) * g.CX, -((it.z - (g.GD - 1) / 2) * g.CZ)];
  // Unit cube mesh: SimReady VG.MESH.001 requires non-subdivided Meshes. Faces are counter-clockwise seen from outside (rightHanded), normals given per face
  const BOX = [
    'float3[] extent = [(-0.5, -0.5, -0.5), (0.5, 0.5, 0.5)]',
    'int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]',
    'int[] faceVertexIndices = [0, 3, 2, 1, 4, 5, 6, 7, 0, 1, 5, 4, 2, 3, 7, 6, 1, 2, 6, 5, 3, 0, 4, 7]',
    'normal3f[] normals = [' + [[0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0]]
      .flatMap(n => Array(4).fill(`(${n.join(', ')})`)).join(', ') + '] (',
    '    interpolation = "faceVarying"',
    ')',
    'point3f[] points = [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5), (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5)]',
    'uniform token subdivisionScheme = "none"',
  ];
  const cube = (ind: string, name: string, color: string, t: Vec3, s: Vec3, material: string): string => [
    `${ind}def Mesh "${name}" (`, `${ind}    prepend apiSchemas = ["MaterialBindingAPI"]`, `${ind})`, `${ind}{`,
    ...BOX.map(l => `${ind}    ${l}`),
    `${ind}    rel material:binding = <${material}>`,
    `${ind}    color3f[] primvars:displayColor = [${rgb(color)}]`,
    `${ind}    double3 xformOp:translate = (${t.map(f).join(', ')})`,
    `${ind}    float3 xformOp:scale = (${s.map(f).join(', ')})`,
    `${ind}    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]`,
    `${ind}}`].join('\n');
  // UsdPreviewSurface material; parameters correspond to the web three.js MeshStandardMaterial
  const material = (ind: string, path: string, color: string, roughness: number, metallic: number): string => [
    `${ind}def Material "${path.split('/').pop()}"`, `${ind}{`,
    `${ind}    token outputs:surface.connect = <${path}/PreviewSurface.outputs:surface>`, '',
    `${ind}    def Shader "PreviewSurface"`, `${ind}    {`,
    `${ind}        uniform token info:id = "UsdPreviewSurface"`,
    `${ind}        color3f inputs:diffuseColor = ${rgb(color)}`,
    `${ind}        float inputs:metallic = ${f(metallic)}`,
    `${ind}        float inputs:roughness = ${f(roughness)}`,
    `${ind}        token outputs:surface`,
    `${ind}    }`, `${ind}}`].join('\n');

  const used = [...new Set(list.map(i => i.type))].filter(id => CAT[id]);
  const links = supplyLinks(list, CAT);

  const L: string[] = [];
  L.push('#usda 1.0', '(',
    '    defaultPrim = "DataHall"',
    '    metersPerUnit = 1',
    '    upAxis = "Z"',
    '    customLayerData = {',
    '        string asset_name = "datahall"',
    '        string asset_type = "data_hall_layout"',
    '        string "dchall:schemaVersion" = "0.2"',
    '        string generator = "GPU Data Hall Builder"',
    '        dictionary SimReady_Metadata = {',
    '        }',
    '        string source_file = "GPU Data Hall Builder web layout"',
    `        string usd_date_generated = "${meta.date}"`,
    '    }',
    ')', '');
  L.push('def Xform "DataHall" (', '    prepend apiSchemas = ["DataHallAPI"]', '    kind = "assembly"', ')', '{');
  L.push(`    double dchall:utilityMw = ${f(utility)}`,
    `    int dchall:gridColumns = ${g.GW}`, `    int dchall:gridRows = ${g.GD}`,
    `    double dchall:cellWidthM = ${f(g.CX)}`, `    double dchall:cellDepthM = ${f(g.CZ)}`, '');
  L.push(cube('    ', 'Floor', PALETTE.floor, [0, 0, -0.01], [g.GW * g.CX + 0.6, g.GD * g.CZ + 0.6, 0.02], '/DataHall/Looks/floor'), '');
  L.push('    def Scope "Looks"', '    {', material('        ', '/DataHall/Looks/floor', PALETTE.floor, 0.95, 0), '    }', '');

  L.push('    def Scope "Catalog"', '    {');
  used.forEach(id => {
    const t = CAT[id], h = t.h, accent = PALETTE[t.c.slice(2)] || PALETTE.rack;
    const liquid = (t.liq || 0) > 0, looks = `/DataHall/Catalog/${id}/Looks`;
    const apis = ['DataHallEquipmentAPI', ...(liquid ? ['LiquidCooledAPI'] : [])].map(s => `"${s}"`).join(', ');
    L.push(`        class Xform "${id}" (`, `            prepend apiSchemas = [${apis}]`, '        )', '        {',
      `            string dchall:displayName = ${str(t.name)}`,
      `            token dchall:category = "${t.group}"`,
      `            double dchall:powerKw = ${f(t.kw || 0)}`,
      `            int dchall:gpuCount = ${t.gpus || 0}`,
      ...(liquid ? [`            double dchall:liquidFraction = ${f(t.liq || 0)}`] : []),
      `            double dchall:liquidCoolingKw = ${f(t.liqCool || 0)}`,
      `            double dchall:airCoolingKw = ${f(t.airCool || 0)}`,
      `            double dchall:overheadKw = ${f(t.ovh || 0)}`,
      `            double dchall:distributionKw = ${f(t.dist || 0)}`,
      `            int dchall:fabricPorts = ${t.ports || 0}`,
      `            double dchall:capexMusd = ${f(t.cap || 0)}`,
      `            bool dchall:roadmap = ${t.future ? 1 : 0}`,
      `            double dchall:heightM = ${f(h)}`, '',
      cube('            ', 'Body', PALETTE.rack, [0, 0, h / 2], [g.CX * .92, g.CZ * .94, h], `${looks}/body`),
      cube('            ', 'Front', accent, [0, -(g.CZ * .47 + .012), h / 2], [g.CX * .78, .02, h - .3], `${looks}/front`), '',
      // Materials live inside the prototype: when an instance references the prototype, bindings map to the instance's own Looks without crossing the instance boundary
      '            def Scope "Looks"', '            {',
      material('                ', `${looks}/body`, PALETTE.rack, 0.55, 0.35),
      material('                ', `${looks}/front`, accent, 0.5, 0),
      '            }',
      '        }');
  });
  L.push('    }', '');

  // All ancestors of a component must have group-type kinds, otherwise instances are not in the model hierarchy (OAV KindChecker)
  L.push('    def Scope "Equipment" (', '        kind = "group"', '    )', '    {');
  list.forEach(it => {
    const t = CAT[it.type]; if (!t) return;
    const [px, py] = pos(it);
    L.push(`        def Xform "${primName(it)}" (`, '            kind = "component"', '            instanceable = true',
      `            prepend references = </DataHall/Catalog/${it.type}>`, '        )', '        {',
      `            int dchall:gridColumn = ${it.x}`, `            int dchall:gridRow = ${it.z}`);
    if (it.phase && it.phase > 1) L.push(`            int dchall:phase = ${it.phase}`);
    const {coolantSource, powerFeed} = links.get(it)!;
    if (coolantSource) L.push(`            rel dchall:coolantSource = </DataHall/Equipment/${primName(coolantSource)}>`);
    if (powerFeed) L.push(`            rel dchall:powerFeed = </DataHall/Equipment/${primName(powerFeed)}>`);
    L.push(`            double3 xformOp:translate = (${f(px)}, ${f(py)}, 0.0)`,
      '            uniform token[] xformOpOrder = ["xformOp:translate"]', '        }');
  });
  L.push('    }', '}', '');
  return L.join('\n');
}

export const USD_README = `# GPU Data Hall export notes

datahall.usda is an OpenUSD text layer, Z up, in meters.

## Structure
/DataHall                   kind=assembly, hall-level attributes (utility MW, grid size)
/DataHall/Floor             floor, bound to /DataHall/Looks/floor
/DataHall/Catalog/<id>      class prototype with device parameters, simplified geometry (Mesh) and its own Looks materials
/DataHall/Equipment         kind=group
/DataHall/Equipment/Rxx_Cyy placed device, kind=component, instanceable, references a Catalog prototype

Geometry is non-subdivided Mesh, materials are UsdPreviewSurface, and the layer metadata carries the fields
required by SimReady SR.001: asset_name, asset_type, source_file, usd_date_generated, SimReady_Metadata.
Device origin is at the bottom center, front facing -Y.

## Attribute schema (dchall: namespace, schema 0.2)
Attributes are defined by three codeless applied API schemas:
DataHallAPI           on /DataHall: utilityMw, gridColumns, gridRows, cellWidthM, cellDepthM
DataHallEquipmentAPI  on Catalog prototypes: displayName, category, powerKw, gpuCount, liquidCoolingKw,
                      airCoolingKw, overheadKw, distributionKw, fabricPorts, capexMusd, roadmap, heightM;
                      on instances: gridColumn, gridRow, phase (deployment phase, written only when greater than 1), powerFeed
LiquidCooledAPI       on liquid-cooled rack prototypes: liquidFraction; on instances: coolantSource

Without the schema plugin loaded, the file still opens and all attribute values are present; they are just treated as an unregistered API.
To make usdview or Omniverse recognize the schema, add the schema/ directory of the project repository to PXR_PLUGINPATH_NAME.

## Topology
dchall:coolantSource → the CDU supplying coolant to this rack (LiquidCooledAPI)
dchall:powerFeed     → the RPP supplying power to this device (DataHallEquipmentAPI)

## Replacing with high-fidelity models
Write an over on /DataHall/Catalog/<id> in a stronger layer; all placed instances follow automatically, and parameters and topology are unaffected.
NVIDIA AI Factory equipment assets face +X by convention while this file faces -Y, so do not add a reference directly on the prototype.
Instead, deactivate the simplified geometry, create a child Xform under the prototype that references the asset, rotate it -90°, and set kind to subcomponent:

    over "DataHall"
    {
        over "Catalog"
        {
            over "vr200"
            {
                over "Body" (active = false)
                {
                }
                over "Front" (active = false)
                {
                }
                def Xform "simready_model" (
                    prepend references = @./vendor/rack.usd@
                    kind = "subcomponent"
                )
                {
                    float3 xformOp:rotateXYZ = (0, 0, -90)
                    uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
                }
            }
        }
    }

Values are rough figures from public reports and estimates, not a basis for engineering design.
`;

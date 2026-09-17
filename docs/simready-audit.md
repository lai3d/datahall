# SimReady 规范核对

核对日期 2026-09-17，对象是 `samples/datahall.usda`（schema 0.2，17 台设备）。下面“结论”到“建议修复顺序”记录的是修复前的状态，修复后的结果见文末“修复结果”。

## 结论

- **单位：合规。** Z 轴向上、metersPerUnit = 1，UN.001–UN.007 全部通过。设备原型的原点在底面中心，和 SimReady 的 VG.025 以及 AIF 资产指南一致。
- **kind：SimReady 规范没有要求，但 NVIDIA 通用校验器不通过。** `/DataHall/Equipment` 没写 kind，17 个 `component` 实例因此脱离了模型层级。把这个 Scope 设为 `group` 后 0 个问题。
- **材质绑定：不合规。** 导出只写了 `displayColor`，没有任何 Material。在每个 Catalog 原型内部放 UsdPreviewSurface 材质并绑定、地板绑定 `/DataHall/Looks` 后，VM.MAT.001 通过。
- **对照最接近的官方 profile（Prop-Robotics-Neutral 2.1.0）：** 按上面两处修改、再补齐元数据（见“其他失败项”）后，还剩三类失败。
  - 几何用的是 `Cube` 而不是 `Mesh`（VG.MESH.001）。
  - 目录结构按单个资产打包的要求（NP.005）。
  - 物理和抓取 feature（FET003–005），对机房布局文件不适用。
- **CLAUDE.md 里“对 Catalog 原型写 `over` 替换高精度模型”的做法：直接用会出错。** 按 AIF 约定建模的机柜正面朝 +X，引用进来会转错 90°；嵌套的 `component` 还会破坏 kind 层级。要多一层带旋转的子 Xform，并把 kind 降为 `subcomponent`，见下文“替换高精度模型”。

SimReady 目前的 profile 都是面向机器人仿真的单个资产（道具、机器人本体），没有面向数据中心布局或 AI Factory 的 profile。所以本报告的“合规”指：适用的 requirement 逐条通过，外加 Omniverse Asset Validator（OAV）默认规则 0 个问题，而不是某个 profile 整体通过。

## 依据

| 来源 | 版本 | 用途 |
|---|---|---|
| [NVIDIA/simready-foundation](https://github.com/NVIDIA/simready-foundation) | `0ed0dfb`（2026-08-03，规范版本 2026.06.0） | requirement 原文、feature 与 profile 定义、校验规则 |
| `simready-validate` / `usd-validation-nvidia` / `usd-profiles-nvidia` | 2026.6.5 / 1.22.0 / 1.22.0 | 官方校验器，含 OAV 默认规则 |
| `usd-core` | 26.8 | 同导出样例的验证版本 |
| [NVIDIA-Omniverse/aif-pipeline-samples](https://github.com/NVIDIA-Omniverse/aif-pipeline-samples) | `4103896`（2026-03-13） | AI Factory 设备资产指南：单位、朝向、kind、元数据、连接点 |
| [Omniverse asset-requirements 1.1.6](https://docs.omniverse.nvidia.com/kit/docs/asset-requirements/1.1.6/capabilities/hierarchy/capability-hierarchy.html) | 1.1.6 | AIF 指南引用的旧版 hierarchy 规范，用来确认 kind 没有 requirement |

## 复现

```bash
tools/simready_setup.sh                                          # 拉取固定版本规范，建 Python 3.12 venv 到 .simready/
.simready/venv/bin/python tools/simready_audit.py samples/datahall.usda
```

脚本跑三遍：
1. 逐条 requirement 各做成一个 feature 单独跑，避免一条失败挡住其他条目。
2. 原样跑 Prop-Robotics-Neutral 2.1.0。
3. 跑 `usd-validation-nvidia` 注册的全部 49 条 OAV 规则。

`tools/validate_usd.py` 仍然是项目自己的 schema 校验，两者互不替代。

## kind

**规范原文：** SimReady Foundation 2026.06.0 和 asset-requirements 1.1.6 的 hierarchy 能力都没有关于 kind 的 requirement，kind 只出现在示例代码里（根 prim 写 `kind = "component"`）。

**对 kind 有要求的地方有两处：**
- **OAV `KindChecker`（Basic 类别，不属于任何 SimReady profile）：**
  - model 的 kind 必须已注册；
  - model 层级的根只能是 assembly、component 或 group；
  - 非根 model 的所有祖先都必须是 group 类 kind（group 或 assembly）。
- **AIF 资产指南：** 要求“Set Kind on the root prim”，工作流清单里也有“Set kind metadata”一项。

**现状：**

| prim | kind | 结果 |
|---|---|---|
| `/DataHall` | assembly | 通过 |
| `/DataHall/Floor`、`/DataHall/Catalog` | 无 | 不是 model，不检查 |
| `/DataHall/Catalog/<id>` | 无 | `class`，默认遍历不到 |
| `/DataHall/Equipment` | **无** | 中断了模型层级 |
| `/DataHall/Equipment/Rxx_Cyy` | component | **17 个失败**：`Model prims can only be parented under ('assembly', 'group') prims` |

**修改：** `def Scope "Equipment" (kind = "group")`。在样例副本上验证过，OAV 的 49 条规则 0 个问题，`tools/validate_usd.py` 也通过。

## 单位

| requirement | 内容 | 结果 |
|---|---|---|
| UN.001 / UN.006 | 写出 upAxis，且为 Z | 通过 |
| UN.002 / UN.007 | 写出 metersPerUnit，且为 1.0 | 通过 |
| UN.003 | 有物理时写 kilogramsPerUnit | 通过（没有物理，不适用） |
| UN.004 | 单位不同的引用要有校正变换 | 通过（没有外部引用） |
| UN.005 | 有时间采样时写 timeCodesPerSecond | 通过（没有时间采样） |
| VG.025 / VG.026 | 原点、枢轴在底面中心 | 通过。原型的 Body 平移到 z = h/2，原点落在地面 |

**`dchall:` 属性的单位不属于 SimReady 的检查范围，但和 AIF 元数据约定不一样：**
- AIF 的 `aif:core:*` 和 `aif:spec:*` 标称使用 SI 单位，功率在规格表里用 W 或 kW。
- 设备外形尺寸（`aif:core:height`、`width`、`depth`）用 mm。
- 我们的 `dchall:heightM` 用 m，功率用 kW，价格用百万美元。

以后如果要和 AIF 元数据互通，需要一层显式换算，不能直接复用属性名。

## 材质绑定

**相关 requirement：**
- **VM.MAT.001：** 每个可渲染的 GPrim 必须能算出绑定的材质，默认材质不算。
- **VM.BIND.001：** 绑定目标不能跨出 payload 的作用域。
- **VM.PS.001：** UsdPreviewSurface 的输入必须符合规范。
- **VM.BIND.002：** shader 输入类型必须正确。

**feature 的归属不太对称：**
- Prop-Robotics-Neutral 用的是 `FET006_BASE_MDL`：VM.BIND.001/002、VM.MAT.001、VM.MDL.*、VM.TEX.*。
- `FET006_BASE_USDPREVIEW` 只有 VM.BIND.001 和 VM.PS.001，**不含 VM.MAT.001**。

**现状：** 35 个 GPrim 都没有材质（1 个地板，加 17 台设备 × Body/Front），VM.MAT.001 失败。VM.BIND.* 和 VM.PS.001 显示通过，只是因为文件里根本没有材质，属于空通过。

**验证过的修改：**

```usda
class Xform "vr200" ( prepend apiSchemas = ["DataHallEquipmentAPI", "LiquidCooledAPI"] )
{
    def Cube "Body" ( prepend apiSchemas = ["MaterialBindingAPI"] )
    {
        rel material:binding = </DataHall/Catalog/vr200/Looks/body>
    }
    def Scope "Looks"
    {
        def Material "body"
        {
            token outputs:surface.connect = </DataHall/Catalog/vr200/Looks/body/PreviewSurface.outputs:surface>
            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (0.0343, 0.0513, 0.0704)
                float inputs:roughness = 0.5
                token outputs:surface
            }
        }
    }
}
```

- **材质放在原型内部：** 实例是 instanceable 的，原型里的绑定关系会随 reference 映射到每个实例自己的 `Looks` 下，符合 VM.BIND.001 的封装要求。
- **地板：** 绑定 `/DataHall/Looks/floor`。
- **`Looks` 必须定义成 `Scope`：** 不带类型的 `def "Looks"` 会触发 OAV 的 `TypeChecker`。
- **结果：** VM.MAT.001、VM.PS.001、VM.BIND.001/002 全部通过，`FET006_BASE_MDL` 整体通过。
- **MDL 的问题：** 当前校验器下 UsdPreviewSurface 也能让 MDL 版 feature 通过，但 Prop-Robotics-Neutral 编写指南原文要求 MDL 材质，AIF 指南提到的也是 OmniPBR。给 Omniverse RTX 用时，应该在更强的层把材质替换成 MDL，网页导出保留 UsdPreviewSurface 以保证通用性。

## 替换高精度模型

**AIF 资产指南对设备资产的约定：**
- 单位米、+Z 向上；
- **正面朝 +X**；
- 原点在底面安装点；
- 根 prim 设置 kind。

**本项目导出的朝向约定不同：** 机柜宽 0.6 m 沿 X，深 1.2 m 沿 Y，**正面朝 -Y**（Front 面板在 y = -0.576）。

**实验方法：** 构造一个按 AIF 约定建模的机柜资产（`kind = "component"`，深 1.2 m 沿 X，正面标记在 +X），用两种写法替换 `vr200`：

| 写法 | R04_C04 世界包围盒 X × Y | 正面标记相对原点 | OAV |
|---|---|---|---|
| A：对原型直接 `over "vr200" (prepend references = @rack.usd@)` | **1.22 × 0.60**，占两个格子 | **(+0.61, 0)**，朝 +X | 0 个问题 |
| B：原型下新建子 Xform，引用资产并 `rotateXYZ = (0, 0, -90)`，`kind = "subcomponent"` | 0.60 × 1.22 | (0, -0.61)，朝 -Y | 0 个问题 |
| C：同 B，但不改 kind | 0.60 × 1.22 | (0, -0.61) | **10 个 KindChecker 失败**（component 嵌套在 component 下） |

**写法 A 的另一个问题：** 旋转不能写在资产根 prim 上。实例自己写了 `xformOpOrder = ["xformOp:translate"]`，是更强的意见，会整体覆盖掉引用资产根上的变换。

**推荐写法 B：**

```usda
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
                prepend references = @./vendor/gb300_rack/gb300_rack.usd@
                kind = "subcomponent"
            )
            {
                float3 xformOp:rotateXYZ = (0, 0, -90)
                uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
            }
        }
    }
}
```

usda 要求每个 prim 的 `{` 另起一行，不能把多层 `over` 压缩写在同一行，否则 USD 报 `Expected }`。`tools/test_usd_to_unity.py` 用这段做回归测试。

上面这段就是在实验里验证过的写法（只写 rotateXYZ，结果和写法 B 相同）。

## 其他失败项

| requirement | 所属 feature | 失败原因 | 建议 |
|---|---|---|---|
| VG.MESH.001 | FET001 Minimal | 几何用 `Cube`，要求非细分 `Mesh` | 导出 8 顶点盒子 Mesh，带 normals 和 extent。改动在 `buildUsda` 的 `cube()` 一处 |
| NP.006 | FET000 Core | `customLayerData` 里没有 `simready_metadata` | 和 SR.001 一起补 |
| SR.001 | FET000 Core | **校验器误报通过。** 规则函数把错误放进返回列表，但没调用 `_AddFailedCheck`，永远不会失败。按原文，我们缺 `asset_name`、`asset_type`、`source_file`、`usd_date_generated`、`SimReady_Metadata` | 在 `customLayerData` 里补齐。已验证补齐后 NP.006 通过 |
| NP.005 | FET000 Core | 要求 `<asset>/<中间目录>/<含 asset 名的文件>.usd` 的目录结构 | 针对单个资产打包。浏览器下载的单文件做不到，发布资产包时再处理 |
| HI.002 | 不在任何 profile | Cube 的父 Xform 没有 rotate，地板的父节点 `/DataHall` 没有 translate；而且一个 Xform 下只能有一个 GPrim | 可选。给 Body、Front、Floor 各包一层带 translate 和 rotateXYZ 的 Xform（未验证） |
| NP.001 | 不在任何 profile | 校验器只认 camelCase 和 snake_case，`DataHall`、`Body`、`Rxx_Cyy`，连 Omniverse 常用的 `Looks`、`PreviewSurface` 都判失败 | 不改。改名会破坏 defaultPrim 和已发布的路径约定 |
| SL.001 | FET011 语义标签，不在 Prop 系列 profile | 几何没有 `SemanticsLabelsAPI` 和 wikidata qcode | 可选。要做合成数据或感知训练时再加 |
| FET003–FET005 | Prop-Robotics-Neutral | 没有刚体、碰撞体和抓取向量 | 不适用于机房布局文件 |

## 顺带发现

aif-pipeline-samples 的 GB300 NVL72 元数据模板带有参考值：
- 铭牌功率 136 kW；
- MaxP AC（EDPP1）142 kW，MaxP DC（TDP）136 kW；
- 液冷热捕获比 87%（液冷 116 kW、风冷 19.3 kW）。

`spec/catalog.json` 目前是 `kw: 140`、`liq: 0.85`。这份模板是 NVIDIA 仓库里的样例数据，不是正式规格书。要采用的话，按 CLAUDE.md 的数据可信度规则，在 note 里写明来源。

## 建议修复顺序

1. `Equipment` 加 `kind = "group"`（一行，OAV 清零）。
2. 原型内 `Looks` + UsdPreviewSurface，地板绑定 `/DataHall/Looks/floor`；颜色沿用现有 PALETTE。
3. `customLayerData` 补 SR.001 字段和 `SimReady_Metadata`。
4. `Cube` 改为 `Mesh`。
5. 把“替换高精度模型”的写法 B 写进 CLAUDE.md 和导出 README；HI.002 视需要再做。

第 1–3 步不影响 `dchall:` schema，`tools/validate_usd.py` 不用改。第 4–5 步会改变 golden 样例的几何结构。每一步之后都应该运行 `npm run sample`、`tools/validate_usd.py` 和 `tools/simready_audit.py`。

## 修复结果

2026-09-17 按上面的顺序修复了第 1–5 步，每一步单独提交，每一步之后都重新生成样例并运行全部检查。HI.002 没有处理。

| 项目 | 修复前 | 修复后 |
|---|---|---|
| 逐条 requirement | 31/38 通过 | 39/43 通过（新增 VG.008、VG.014、VG.027–029，有了 Mesh 之后才有实际检查意义） |
| OAV 49 条规则 | 17 个问题（KindChecker） | 0 个问题 |
| Prop-Robotics-Neutral 2.1.0：FET000 Core | 失败（NP.005、NP.006） | 失败（仅 NP.005） |
| FET001 Minimal | 失败（VG.MESH.001） | **通过** |
| FET006 Materials（MDL 版） | 失败（VM.MAT.001） | **通过** |
| FET003–005 物理与抓取 | 失败 | 失败（不适用） |

**剩余失败，都是报告里预期不修的：**
- **HI.002：** 不在任何 profile。
- **NP.001：** 命名规则连 `Looks`、`PreviewSurface` 都判失败。
- **NP.005：** 按单个资产打包的目录结构，浏览器导出的单文件做不到。
- **SL.001：** 语义标签，需要时再做。

**实现要点：**
- **Mesh：** 所有几何共用一个 8 顶点、6 个四边面的单位立方体，法线 faceVarying，`subdivisionScheme = "none"`，仍用 translate/scale 定位，世界包围盒与 Cube 版一致。
- **材质：** 每个原型的 `Looks` 下有 `body`、`front` 两个 UsdPreviewSurface 材质，参数对应网页 three.js（机柜粗糙度 0.55、金属度 0.35），`displayColor` 保留为备用颜色。
- **元数据：** `buildUsda` 新增必填参数 `meta.date`；网页导出传当天日期，`npm run sample` 沿用样例原日期。

**测试补充：**

web 测试按规范原文检查以下几项，不依赖 `.simready` 环境：
- 模型层级连续；
- 每个 Mesh 都绑定了同一原型或 `/DataHall/Looks` 内的材质；
- SR.001 字段齐全；
- 立方体每个面朝外，且与法线一致。

**关于网格检查：** 故意把一个面的绕序反过来，SimReady 的 VG.007/008/014/027–029 都没有报错，只有 OAV 的 `ManifoldChecker` 给出 35 条警告。所以绕序靠 web 测试兜底。

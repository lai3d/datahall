# GPU Data Hall Builder

用于体验搭建 AI 数据中心的模拟器，重点是 NVIDIA 新一代 GPU 机柜（GB200/GB300 NVL72、Vera Rubin NVL72、Kyber）。
目标形态：网页版（传播和容量规划逻辑）+ Unity 版（沉浸体验、VR、托盘拆解、故障演练）。
数据格式兼容 OpenUSD，为以后接入 NVIDIA SimReady 资产和 Omniverse DSX 生态留路。

## 目录

- `web/`：网页版，Vite + three.js 0.128（npm 锁版本），入口 `web/index.html` → `web/src/main.js`
  - `src/catalog.js`：import `spec/catalog.json`，构建时打进包里
  - `src/sim.js`：容量模型与 PUE，纯函数
  - `src/usd-export.js`：`buildUsda`，纯函数，不依赖 DOM 和 three，node 可直接 import
  - `src/download.js`：有 `window.claude` 走 downloads（zip），否则 Blob 直接下载 `.usda`
  - `src/scene.js` / `src/controls.js`：three 场景、拾取、轨道相机与指针输入
  - `src/ui.js`：右侧面板；`src/state.js`：共享状态；`src/layout.js`：预设与 localStorage；`src/grid.js`：网格常量
  - `tests/`：vitest；`usd-export.test.js` 从样例反解设备清单再生成，要求与 `samples/datahall.usda` 逐字节一致，
    并解析 `schema/generatedSchema.usda` 检查导出的每个 `dchall:` 属性都由应用的 schema 定义、类型一致（不需要 pxr）
  - `scripts/update-sample.js`：`npm run sample`，导出格式有意变更后按样例原布局重新生成 `samples/datahall.usda`
- `spec/catalog.json`：设备目录，**唯一数据源**
- `schema/`：codeless applied API schema 插件
  - `schema.usda`：源文件，只改这个
  - `generatedSchema.usda`、`plugInfo.json`：`tools/gen_schema.sh` 生成，和源文件一起提交。
    `plugInfo.json` 里的 `Root`/`ResourcePath`/`LibraryPath` 是手改的相对路径，重新生成会保留
- `samples/datahall.usda`：导出样例，已用 OpenUSD 26.08 和 schema 校验，同时是导出回归测试的 golden 文件
- `tools/validate_usd.py`：基于 schema 的 USD 校验，自动注册 `schema/` 插件；`tools/test_validate_usd.py` 是它的测试
- `tools/simready_setup.sh` + `tools/simready_audit.py`：对照 NVIDIA SimReady Foundation（固定版本）和 OAV 默认规则核对，环境在 `.simready/`
- `docs/simready-audit.md`：SimReady 核对报告

## 运行

```bash
cd web && npm i
npm run dev        # 开发服务器
npm test           # vitest
npm run build      # 产物在 web/dist，base 为相对路径，可部署到任意子路径

python3 -m venv .venv && .venv/bin/pip install usd-core jinja2
.venv/bin/python tools/validate_usd.py samples/datahall.usda
.venv/bin/python -m unittest discover -s tools
tools/gen_schema.sh             # 改了 schema/schema.usda 之后（默认用 .venv 的 python）
tools/gen_schema.sh --validate  # 检查生成文件是否过期
export PXR_PLUGINPATH_NAME=$PWD/schema  # 让 usdview、Omniverse 识别 schema
tools/simready_setup.sh && .simready/venv/bin/python tools/simready_audit.py samples/datahall.usda  # SimReady 核对（需要 uv）
```

## 已定的设计决策

- **容量模型**：配电（RPP）、液冷（CDU）、风冷（列间空调）、后端网络端口、市电五项约束，任一不满足不能通电。
  PUE 估算：`(IT + 设备自耗 + 液冷热量×0.08 + 风冷热量×0.30 + IT×0.05) / IT`，是教学用简化公式。
- **OpenUSD 约定**：Z 轴向上，metersPerUnit = 1，defaultPrim = `/DataHall`。
  - `/DataHall/Catalog/<id>`：`class` 原型，带参数和简化几何
  - `/DataHall/Equipment/Rxx_Cyy`：`instanceable` 实例，引用 Catalog 原型
  - 参数用 `dchall:` 命名空间属性，由 codeless applied API schema 定义（schema 0.2），不写 `custom`：
    - `DataHallAPI`：应用在 `/DataHall` 上，市电和网格尺寸
    - `DataHallEquipmentAPI`：应用在 Catalog 原型上，实例通过 reference 继承；设备参数、网格位置、`dchall:powerFeed`→RPP。
      能力字段（液冷/风冷/配电/端口）都放在这里，不适用的写 0，没有再拆能力 API
    - `LiquidCooledAPI`：只应用在 `liq > 0` 的原型上；`dchall:liquidFraction`、`dchall:coolantSource`→CDU
  - 属性名和类型与 0.1 的自定义属性保持一致；没加载插件时文件照样能打开、属性值照样可读。0.1 的文件没有 `apiSchemas`，校验会要求重新导出
  - schema 的 doc 用英文：usdGenSchema 会把第一句截成 `userDocBrief` 并补英文句点，中文句号会变成"。."
  - 改属性的顺序：`schema/schema.usda` → `tools/gen_schema.sh` → `web/src/usd-export.js` → `npm run sample` → `validate_usd.py`
  - 替换高精度模型的方式：在更强的层对 Catalog 原型写 `over`，但**不能直接对原型加 reference**：AIF 设备资产正面朝 +X，本项目正面朝 -Y；
    要在原型下建子 Xform 引用资产、`rotateXYZ = (0, 0, -90)`、`kind = "subcomponent"`，详见 `docs/simready-audit.md`
- **网格坐标**：网页里 three.js 是 Y-up，导出时 `(x, y, z)_three → (x, -z, y)_usd`。格子 0.6m × 1.2m，16 列 × 10 排。

## 下一步（按优先级）

1. 按 `docs/simready-audit.md` 的“建议修复顺序”修复：Equipment kind=group、原型内 UsdPreviewSurface 材质、SR.001 元数据、Cube 改 Mesh。
   核对结论：单位合规；kind 和材质绑定不合规；没有面向数据中心的 SimReady profile，不要声称某个 profile 整体通过。
2. 网页版支持导入自己导出的 `.usda` 子集（不追求通用 USD 解析）。
3. Unity 版：USD → JSON + glTF 的离线转换管线（Python pxr），或基于 USD C++ 的 native plugin，先做方案对比再动手。

## 数据可信度

功耗和价格来自公开报道与供应链估算，**不是 NVIDIA 官方规格**，改数值时在 catalog.json 的 note 里写来源：
- GB300 NVL72 约 132–142 kW
- Vera Rubin NVL72：Max-Q 约 190 kW、Max-P 约 230 kW（Ming-Chi Kuo，2026-01），2026 下半年出货
- Rubin Ultra Kyber：约 600 kW，144 GPU，2027 路线图
- Vera Rubin NVL72 售价约 $5–7M/柜（Tom's Hardware，2026-03）
- IB 交换柜"288 端口"是简化模型，不是真实拓扑

## 风格

- UI 文案中文，简体，句子式，不用全大写标签
- 配色语义固定：GPU 绿、冷却液青、配电铜色、网络紫
- 回答直接，不要客套

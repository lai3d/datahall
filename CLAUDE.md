# GPU Data Hall Builder

用于体验搭建 AI 数据中心的模拟器，重点是 NVIDIA 新一代 GPU 机柜（GB200/GB300 NVL72、Vera Rubin NVL72、Kyber）。
目标形态：网页版（传播和容量规划逻辑）+ Unity 版（沉浸体验、VR、托盘拆解、故障演练）。
数据格式兼容 OpenUSD，为以后接入 NVIDIA SimReady 资产和 Omniverse DSX 生态留路。

## 目录

- `web/`：网页版，Vite + three.js 0.128（npm 锁版本），入口 `web/index.html` → `web/src/main.js`
  - `src/catalog.js`：import `spec/catalog.json`，构建时打进包里
  - `src/sim.js`：容量模型与 PUE，纯函数
  - `src/usd-export.js`：`buildUsda`，纯函数，不依赖 DOM 和 three，node 可直接 import
  - `src/download.js`：有 `window.claude` 走 downloads（zip），否则 Blob 直接下载文件
  - `src/share-link.js`：分享链接，布局编码进网址 hash，纯函数
  - `src/layout-export.js`：`buildLayout`，给 Unity 版的 `layout.json`，纯函数；拓扑和设备名与 USD 导出共用 `grid.js` 的 `supplyLinks`、`equipmentName`
  - `src/usda-parser.js`：usda 文本的精简解析器（prim、属性、元数据、值），不做组合
  - `src/usd-import.js`：导入自己导出的 `.usda`，纯函数，返回布局和提示列表
  - `src/scene.js` / `src/controls.js`：three 场景、拾取、轨道相机与指针输入
  - `src/ui.js`：右侧面板；`src/state.js`：共享状态；`src/layout.js`：预设与 localStorage；`src/grid.js`：网格常量
  - `tests/`：vitest；`usd-export.test.js` 从样例反解设备清单再生成，要求与 `samples/datahall.usda` 逐字节一致，
    并解析 `schema/generatedSchema.usda` 检查导出的每个 `dchall:` 属性都由应用的 schema 定义、类型一致（不需要 pxr）
  - `scripts/update-sample.js`：`npm run sample`，导出格式有意变更后按样例原布局重新生成 `samples/datahall.usda`
  - `scripts/capacity-cases.js`：`npm run capacity-cases`，从 `sim.js` 生成 `spec/capacity-cases.json`（Unity 的 C# 容量模型用它核对）
  - `scripts/layout-from-usda.js`、`scripts/validate-gltf.js`：给 `tools/test_usd_to_unity.py` 做对照和 glTF-Validator 检查
  - `tests/fixtures/`：导入测试用的文件。`pxr-resaved`、`pxr-edited` 由 `tools/make_import_fixtures.py` 生成；
    `schema-0.1` 取自提交 `2cdd465` 的样例。导出格式变化后要重新生成，并更新 `usd-import.test.js` 里的预期
- `spec/catalog.json`：设备目录，**唯一数据源**
- `spec/layout.schema.json`：`layout.json` 格式；`spec/capacity-cases.json`：容量模型共用测试用例（生成文件，不要手改）
- `schema/`：codeless applied API schema 插件
  - `schema.usda`：源文件，只改这个
  - `generatedSchema.usda`、`plugInfo.json`：`tools/gen_schema.sh` 生成，和源文件一起提交。
    `plugInfo.json` 里的 `Root`/`ResourcePath`/`LibraryPath` 是手改的相对路径，重新生成会保留
- `samples/datahall.usda`：导出样例，已用 OpenUSD 26.08 和 schema 校验，同时是导出回归测试的 golden 文件
- `tools/validate_usd.py`：基于 schema 的 USD 校验，自动注册 `schema/` 插件；`tools/test_validate_usd.py` 是它的测试
- `tools/simready_setup.sh` + `tools/simready_audit.py`：对照 NVIDIA SimReady Foundation（固定版本）和 OAV 默认规则核对，环境在 `.simready/`
- `docs/simready-audit.md`：SimReady 核对报告；`docs/unity-options.md`：Unity 方案对比和决定
- `.gitattributes`：Git LFS 规则，只放二进制资产（glb、usdc/usdz/usd、贴图、音视频、字体、原生库）；`.usda`、`.gltf`、JSON、Unity YAML 留在普通 git。
  `tools/check_lfs.sh` 检查 LFS 文件是否已拉取，Unity 脚本启动时自动调用
- `tools/usd_to_unity.py`：`.usda` → 布局包（`layout.json` + `assets/<id>.glb`），测试 `tools/test_usd_to_unity.py`
- `unity/`：Unity 6000.6.1f1 + URP + glTFast 6.20.0 的 macOS 程序
  - `Assets/DataHall/Runtime`：`LayoutData`（解析校验）、`HallCoordinates`（USD (x, y, z) → Unity (-x, z, -y)）、
    `CapacityModel`（`sim.js` 的 C# 移植）、`HallBuilder`、`HallApp`（入口和中文 IMGUI 面板）、`OrbitCamera`
  - `Assets/DataHall/Editor`：`ProjectSetup`（URP、场景、播放器设置）、`BundleImporter`（导入布局包、生成 prefab 变体）、`BuildMac`
  - `Assets/DataHall/Generated`：导入生成的模型和设备库，由 `tools/unity_sync.sh` 更新；`Assets/DataHall/Prefabs`：模型的 prefab 变体，交互加在这里
  - `Assets/DataHall/Tests/EditMode`：EditMode 测试；`Fixtures/axis_probe.glb` 由 `tools/make_unity_fixtures.py` 生成
  - `Native/DataHallNative.m` → `Assets/Plugins/macOS/DataHallNative.bundle`（`tools/build_native_mac.sh`，需要 Xcode）：
    打开文件对话框（NSOpenPanel）和把文件拖进窗口；C# 封装 `Runtime/NativeMac.cs`，只在打包后的 macOS 程序里加载

## 运行

```bash
brew install git-lfs && git lfs install   # 仓库用 Git LFS 存二进制资产（规则见 .gitattributes），克隆前装好；已克隆的运行 git lfs pull
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

# Unity 版（编辑器 /Applications/Unity/Hub/Editor/6000.6.1f1，UNITY=... 可覆盖）
tools/unity_sync.sh [file.usda]   # 导入全部设备模型，再把 file.usda（默认 samples/datahall.usda）设为默认布局
tools/unity_test.sh               # EditMode 测试
tools/unity_build.sh              # 打包 build/DataHall.app 并跑 batchmode 冒烟断言；LAYOUT=path 换布局
tools/unity_native_smoke.sh       # 原生插件冒烟（会弹出窗口几秒）：拖放、自动取消的对话框、打开失败保留机房
tools/build_native_mac.sh         # 改了 unity/Native/DataHallNative.m 之后重新编译插件
build/DataHall.app/Contents/MacOS/* -layout path/to/layout.json   # 打开网页导出的布局
```

## 已定的设计决策

- **容量模型**：配电（RPP）、液冷（CDU）、风冷（列间空调）、后端网络端口、市电五项约束，任一不满足不能通电。
  PUE 估算：`(IT + 设备自耗 + 液冷热量×0.08 + 风冷热量×0.30 + IT×0.05) / IT`，是教学用简化公式。
- **OpenUSD 约定**：Z 轴向上，metersPerUnit = 1，defaultPrim = `/DataHall`。
  - `/DataHall/Catalog/<id>`：`class` 原型，带参数、简化几何和自己的 `Looks`（UsdPreviewSurface），几何绑定原型内的材质
  - `/DataHall/Equipment`：`kind = "group"`；`/DataHall/Equipment/Rxx_Cyy`：`kind = "component"`、`instanceable` 实例，引用 Catalog 原型
  - SimReady 相关（`docs/simready-audit.md`）：几何是非细分 `Mesh`（共用一个单位立方体，靠 translate/scale 定位），不要换回 `Cube`；
    `customLayerData` 带 SR.001 字段，生成日期由调用方传 `buildUsda(..., {date})`，`npm run sample` 沿用样例原日期
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
- **导入 .usda**：只读根层，不展开 sublayer 和外部引用，不支持二进制 usdc（提示用 usdcat 转换）。
  - 设备类型取自 `references = </DataHall/Catalog/<id>>`，位置以 `dchall:gridColumn/gridRow` 为准（缺失时按 `Rxx_Cyy` 名字推断），
    `translate` 只用来提示不一致；设备参数以 `catalog.json` 为准，文件里的参数只提示差异
  - 停用（`active = false`）、未知类型、越界、重叠、外部引用的设备跳过并提示；网格尺寸和当前不一致直接拒绝
  - 导入会替换当前机房；提示里含文件内容，界面上只能用 `textContent` 写入
- **分享链接**：`#layout=<版本>,<市电 MW>,<类型>:<列>.<排>-<列>.<排>,...`，列排从 0 开始，与 layout.json、USD 一致。
  - 用 hash 不用查询参数：不发到服务器，静态托管不需要配置；每次编辑用 `history.replaceState` 更新（不产生历史记录）
  - 打开页面时链接里的布局优先于 localStorage；手动改 hash 触发 `hashchange` 重新载入；无效条目跳过并提示，不支持的版本不载入
  - 改格式要升版本号并保留旧版本解码，已经发出去的链接不能失效
- **Unity 版**：`layout.json` 是 Unity 唯一读取的布局格式，网页“导出给 Unity”和 `tools/usd_to_unity.py` 产出的内容必须逐字段一致（测试比对）。
  - 设备几何来自 glb，导入后生成 prefab 变体；交互改变体，不改 `Generated/`。改了导出几何或颜色后跑 `tools/unity_sync.sh`
  - 颜色：USD 里写线性值（导出器把 sRGB 调色板换算后写入），glTF 同为线性；Unity 工程是线性色彩空间，IMGUI 贴图颜色要写 `.linear`
  - 打包后的程序默认 run in background，否则从终端启动时主循环暂停；`OpenScene(Single)` 会卸载未引用资产，之后要重新加载
  - 程序内打开：面板按钮弹 NSOpenPanel（在 Update 里弹，不在 OnGUI 里），或把文件拖进窗口；打开失败保留当前机房并提示。
    拖放是在 Unity 的 `PlayerWindowView` 类上添加拖放方法：NSView 自带默认实现，所以只检查 NSView 以下 Unity 自己的类，有实现就不接管。
    系统拖拽手势和对话框点选无法自动化，冒烟测试用伪造的拖放对象调用真实视图的 `performDragOperation:`
  - 重跑 `ProjectSetup` 会重建场景（fileID 变化）并可能改动 `UniversalRenderPipelineGlobalSettings.asset`，内容没变的话不要提交这些变动
- **网格坐标**：网页里 three.js 是 Y-up，导出时 `(x, y, z)_three → (x, -z, y)_usd`。格子 0.6m × 1.2m，16 列 × 10 排。

## 下一步（按优先级）

当前以网页版为主（2026-09-17 决定），Unity 版暂停。

1. 部署到 Vercel，main 合并后自动更新。
2. 按设备的容量检查：每台 CDU、RPP 按分配到的机柜算负载，在三维视图里标出超载设备和没接上的机柜。
3. 编辑体验：拖动移动设备、撤销和重做、整排放置。
4. three.js 从 r128 升级到新版（色彩管理、画质）。
5. Unity 版（暂停）：面板遮挡三维视图、通电动画和连线、托盘拆解、真实 SimReady 资产（方案 A5，见 `docs/unity-options.md`）。
   Unity USD Importer 在 6000.6 上编译失败，不要用；运行时直接读 USD 的备选是 B3。

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

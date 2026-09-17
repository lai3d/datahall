# GPU Data Hall Builder

用于体验搭建 AI 数据中心的模拟器，重点是 NVIDIA 新一代 GPU 机柜（GB200/GB300 NVL72、Vera Rubin NVL72、Kyber）。
目标形态：网页版（传播和容量规划逻辑）+ Unity 版（沉浸体验、VR、托盘拆解、故障演练）。
数据格式兼容 OpenUSD，为以后接入 NVIDIA SimReady 资产和 Omniverse DSX 生态留路。

## 目录

- `web/`：网页版，TypeScript（strict）+ Vite + three.js 0.186（npm 锁版本），没有 UI 框架（面板是原生 DOM），入口 `web/index.html` → `web/src/main.ts`
  - `tsconfig.json`：`npm run typecheck`（`tsc`，TypeScript 7）只做类型检查不产出文件，打包由 Vite 负责。开了 `erasableSyntaxOnly`：
    不用 enum、参数属性这类需要编译的语法，Node 24+ 可以直接运行 `scripts/*.ts`；相对 import 都写 `.ts` 后缀
  - `src/types.ts`：共用数据类型（目录、设备、布局条目、feeds）；`src/dom.ts`：取页面元素的 `$`，以及面板重画用的 `setHTML`
  - 面板整块重画一律用 `setHTML(el, html)`，不要直接写 `innerHTML`：内容没变不写（保住打开的下拉框），变了就按 id / data-* / 第几个可聚焦控件把键盘焦点还回去。
    要被找回焦点的控件带上 `id` 或 `dom.ts` 的 `KEY_ATTRS` 里的 data 属性。需要 DOM 的测试在文件头写 `// @vitest-environment happy-dom`
  - 文案类型：`zh.ts` 的类型取自 `en.ts`，`tr(key, vars)` 在编译期检查键和变量
  - `vercel.json`：Vercel 构建设置（Vite，`npm ci`、`npm run build`、输出 `dist`）
  - `src/catalog.ts`：import `spec/catalog.json`，构建时打进包里
  - `src/sim.ts`：容量模型与 PUE，纯函数
  - `src/i18n.ts` + `src/locales/en.ts`、`zh.ts`：界面语言，默认英文，可切换简体中文（右上角切换，记在 localStorage，`?lang=zh` 可直接指定）。
    所有界面文案、容量问题、导入提示都走 `tr(key, vars)`；新增文案要两个文件同时加，`tests/i18n.test.ts` 检查键一致、不漏变量
  - `src/supply.ts`：按设备的容量检查，每台 CDU、RPP 按 `supplyLinks` 就近分到的负载和自身容量比较，纯函数。只在网页版，Unity 的 `CapacityModel` 没有对应实现
  - `src/usd-export.ts`：`buildUsda`，纯函数，不依赖 DOM 和 three，node 可直接 import
  - `src/download.ts`：有 `window.claude` 走 downloads（zip），否则 Blob 直接下载文件
  - `src/share-link.ts`：分享链接，布局编码进网址 hash，纯函数
  - `src/layout-export.ts`：`buildLayout`，给 Unity 版的 `layout.json`，纯函数；拓扑和设备名与 USD 导出共用 `grid.ts` 的 `supplyLinks`、`equipmentName`
  - `src/usda-parser.ts`：usda 文本的精简解析器（prim、属性、元数据、值），不做组合
  - `src/usd-import.ts`：导入自己导出的 `.usda`，纯函数，返回布局和提示列表
  - `src/scene.ts` / `src/controls.ts`：three 场景、拾取、轨道相机与指针输入
  - `src/edit.ts`：编辑用的纯函数（整排放置的格子、布局比较、撤销历史）
  - `src/growth.ts`：增长规划，逐阶段累计的容量检查（`growthPlan`）和还能加几台（`headroom`），纯函数
  - `src/feeds.ts`：手动指定供给设备的维护（设置、失效清理、供给设备挪动时跟着改），纯函数
  - `src/redundancy.ts`：故障演练和 N+1 检查，纯函数；`blockingReasons` 和界面“不能通电”的条件一一对应（有测试保证）
  - `src/ui.ts`：右侧面板；`src/state.ts`：共享状态；`src/layout.ts`：预设与 localStorage；`src/grid.ts`：网格常量
  - `tests/`：vitest；`usd-export.test.ts` 从样例反解设备清单再生成，要求与 `samples/datahall.usda` 逐字节一致，
    并解析 `schema/generatedSchema.usda` 检查导出的每个 `dchall:` 属性都由应用的 schema 定义、类型一致（不需要 pxr）
  - `scripts/update-sample.ts`：`npm run sample`，导出格式有意变更后按样例原布局重新生成 `samples/datahall.usda`
  - `scripts/capacity-cases.ts`：`npm run capacity-cases`，从 `sim.ts` 生成 `spec/capacity-cases.json`（Unity 的 C# 容量模型用它核对）
  - `scripts/layout-from-usda.ts`、`scripts/validate-gltf.ts`：给 `tools/test_usd_to_unity.py` 做对照和 glTF-Validator 检查
  - `tests/fixtures/`：导入测试用的文件。`pxr-resaved`、`pxr-edited` 由 `tools/make_import_fixtures.py` 生成；
    `schema-0.1` 取自提交 `2cdd465` 的样例。导出格式变化后要重新生成，并更新 `usd-import.test.ts` 里的预期
- `spec/catalog.json`：设备目录，**唯一数据源**。`name`、`note` 是中文原文，导出的 USD `displayName` 和 `layout.json` 沿用它；
  英文写在每项的 `i18n.en` 下（缺的字段回退原文）。改 note 的数值或来源时中英文一起改
- `spec/layout.schema.json`：`layout.json` 格式；`spec/capacity-cases.json`：容量模型共用测试用例（生成文件，不要手改）
- `schema/`：codeless applied API schema 插件
  - `schema.usda`：源文件，只改这个
  - `generatedSchema.usda`、`plugInfo.json`：`tools/gen_schema.sh` 生成，和源文件一起提交。
    `plugInfo.json` 里的 `Root`/`ResourcePath`/`LibraryPath` 是手改的相对路径，重新生成会保留
- `samples/datahall.usda`：导出样例，已用 OpenUSD 26.08 和 schema 校验，同时是导出回归测试的 golden 文件
- `tools/validate_usd.py`：基于 schema 的 USD 校验，自动注册 `schema/` 插件；`tools/test_validate_usd.py` 是它的测试
- `tools/simready_setup.sh` + `tools/simready_audit.py`：对照 NVIDIA SimReady Foundation（固定版本）和 OAV 默认规则核对，环境在 `.simready/`
- `docs/simready-audit.md`：SimReady 核对报告；`docs/unity-options.md`：Unity 方案对比和决定；`docs/roadmap.md`：季度 roadmap（Now / Next / Later）
- `.gitattributes`：Git LFS 规则，只放二进制资产（glb、usdc/usdz/usd、贴图、音视频、字体、原生库）；`.usda`、`.gltf`、JSON、Unity YAML 留在普通 git。
  `tools/check_lfs.sh` 检查 LFS 文件是否已拉取，Unity 脚本启动时自动调用
- `tools/usd_to_unity.py`：`.usda` → 布局包（`layout.json` + `assets/<id>.glb`），测试 `tools/test_usd_to_unity.py`
- `unity/`：Unity 6000.6.1f1 + URP + glTFast 6.20.0 的 macOS 程序
  - `Assets/DataHall/Runtime`：`LayoutData`（解析校验）、`HallCoordinates`（USD (x, y, z) → Unity (-x, z, -y)）、
    `CapacityModel`（`sim.ts` 的 C# 移植）、`HallBuilder`、`HallApp`（入口和中文 IMGUI 面板）、`OrbitCamera`
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
npm run typecheck  # tsc 类型检查（CI 也跑）
npm test           # vitest
npm run build      # 产物在 web/dist，base 为相对路径，可部署到任意子路径
# 部署：Vercel 项目 lai3ds-projects/datahall 关联本仓库，Root Directory 为 web；合并到 main 发布正式版，PR 自动生成预览

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
  - 网页版另有逐台检查（`supply.ts`）：总量够时，就近分到某台 CDU 的液冷热量或某台 RPP 的功率超过它的容量，也不能通电。
    总量已经不够时只报总量，不逐台重复。三维视图里超载的 CDU、RPP 和没接上的设备顶上显示红色，接到超载设备的连线画成红色。
    `compute()` 和 `spec/capacity-cases.json` 不含逐台检查（和 Unity 共用的契约不变）。
  - 预设必须同时通过总量和逐台检查（`sim.test.ts`）。Rubin 预设的设施按 CDU、RPP、IB、空调循环摆放就是为此。
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
  - 改属性的顺序：`schema/schema.usda` → `tools/gen_schema.sh` → `web/src/usd-export.ts` → `npm run sample` → `validate_usd.py`
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
  - 版本 2：在设备分组后面加手动指定，`@c:<列>.<排>_<CDU 列>.<CDU 排>-...`（冷却液）、`@p:...`（配电）
  - 版本 3：再加部署阶段 `@<阶段>:<列>.<排>-...`（只列大于 1 的）。编码用能表达内容的最低版本：没有阶段用 2，也没有手动指定用 1
- **Unity 版**：`layout.json` 是 Unity 唯一读取的布局格式，网页“导出给 Unity”和 `tools/usd_to_unity.py` 产出的内容必须逐字段一致（测试比对）。
  - 设备几何来自 glb，导入后生成 prefab 变体；交互改变体，不改 `Generated/`。改了导出几何或颜色后跑 `tools/unity_sync.sh`
  - 颜色：USD 里写线性值（导出器把 sRGB 调色板换算后写入），glTF 同为线性；Unity 工程是线性色彩空间，IMGUI 贴图颜色要写 `.linear`
  - 打包后的程序默认 run in background，否则从终端启动时主循环暂停；`OpenScene(Single)` 会卸载未引用资产，之后要重新加载
  - 程序内打开：面板按钮弹 NSOpenPanel（在 Update 里弹，不在 OnGUI 里），或把文件拖进窗口；打开失败保留当前机房并提示。
    拖放是在 Unity 的 `PlayerWindowView` 类上添加拖放方法：NSView 自带默认实现，所以只检查 NSView 以下 Unity 自己的类，有实现就不接管。
    系统拖拽手势和对话框点选无法自动化，冒烟测试用伪造的拖放对象调用真实视图的 `performDragOperation:`
  - 重跑 `ProjectSetup` 会重建场景（fileID 变化）并可能改动 `UniversalRenderPipelineGlobalSettings.asset`，内容没变的话不要提交这些变动
- **供给关系**（`grid.ts` 的 `supplyLinks`，USD 导出、layout.json、逐台容量检查、连线共用）：默认接最近的 CDU / RPP（跨排距离加倍）；
  设备可以手动指定接哪台（`feeds: {coolantSource: [x, z], powerFeed: [x, z]}`，布局快照里是 `[type, x, z, feeds]`）。
  - 指定的格子不是对应的供给设备（被删、换类型）或在故障演练里被拿掉时，退回最近的；`edit()` 里删掉被删设备的失效指定，供给设备被拖动时指定跟着改
  - 手动指定进撤销历史、localStorage 和分享链接；USD 和 layout.json 格式不变，关系本来就逐台写出。导入 .usda 时读关系，和就近分配不同的才记成手动指定，
    指向没导入的设备时提示并按就近处理（pxr 转换器此时写空，这种坏文件两边不一致，有效文件逐字段一致，`test_manual_assignment_and_phase_match_web_export`）
  - 界面：设备详情里“冷却液来自 / 配电来自”是下拉框（第一项就近）；CDU / RPP 详情里“指定接入设备”进入点选模式，点设备接上、再点恢复就近，Esc 结束。手动指定的连线画成虚线
- **布局快照条目**：`[type, x, z]` 或 `[type, x, z, {feeds?, phase?}]`（`edit.ts` 的 `toItem` / `toEntry`），撤销历史、localStorage、预设都用它。
  2026-09-17 短暂发布过第 4 项直接是 feeds 的写法，`entryProps` 读的时候兼容
- **增长规划**：每台设备有部署阶段（`phase`，从 1 开始，1 不写）。第 n 阶段的检查包含阶段 ≤ n 的全部设备，原因和“不能通电”的条件一致（`blockingReasons`）。
  - 阶段进撤销历史、localStorage、分享链接（版本 3）、USD（`DataHallEquipmentAPI` 的 `int dchall:phase`，大于 1 才写在实例上）、
    layout.json（equipment 的 `phase`，两个生成器都写，schema 里可省略、缺省为 1；Unity 版的 C# 暂时不读）
  - 界面：新设备进哪个阶段（“+”开新阶段）；“查看到第几阶段”和点表格行是查看状态，不改布局也不进撤销历史，之后阶段的设备更淡、不参与计算和 N+1 检查；
    设备详情里可以改阶段。查看的阶段在新放设备超出它时自动切回全部
  - 还能加几台（`headroom`）只按全机房总量算（每台的需求增量和 `sim.ts` 的 PUE 公式一致），不看地板空位和逐台 CDU / RPP 分配；有测试保证加上算出的台数仍满足、再多一台就不满足
- **故障演练**：可以标记故障的是提供容量的设施（CDU、RPP、列间空调、IB 交换柜），GPU 机柜和存储柜不行。
  - 故障设施从计算里拿掉：不提供容量也不耗电，其余设备按 `supplyLinks` 重新就近分配；三维里半透明、不投影、不亮，连线不画
  - 故障标记（`state.failed`，按格子 key）不进布局、撤销历史、分享链接和导出；拖动时跟着设备走，撤销、重做后格子上还是可故障设施就保留；
    载入预设、导入文件、打开分享链接清空。标记故障不断电，已通电时即使演练出问题也能断电
  - N+1 检查针对完整布局（不看当前演练）：依次让每台设施单独故障，列出会让机房不满足容量检查的设备和原因；布局本身不满足时不检查
  - `gb200n1` 预设是 N+1 的示范；其他预设不要求 N+1
- **编辑**：所有改布局的操作都经过 `main.ts` 的 `edit()`，布局真的变了才记一条撤销历史（最多 100 条），
  包括放置、删除、整排放置、拖动、改市电、载入预设、导入文件、打开分享链接；启动时的载入和撤销、重做本身不记。
  - 拖动：按下的位置有设备就移动设备，否则旋转视角。按设备侧面时指针下的地板是后面的格子，所以按指针移动的格数挪，不是挪到指针下的格子；
    经过的空格立即生效（连线和容量检查跟着变），占用的格子跳过，松手记一条历史；第二根手指落下取消这次拖动
  - 整排放置：选“整排”后点第一格、再点最后一格，沿格子数差得多的方向（相等时沿排）填满空格；触屏没有悬停，只预览第一格
  - 快捷键：⌘Z / Ctrl+Z 撤销，⇧⌘Z / Ctrl+Y 重做，Delete / Backspace 删除选中设备，Esc 依次取消整排起点、当前设备、选中
  - 开发服务器下 `window.__datahall` 暴露 `state`、`cellToScreen`、`visibleGhosts`、`renderOnce`，给浏览器自动化用（生产构建没有）。
    自动化浏览器窗口在后台时 requestAnimationFrame 会暂停：画面和相机矩阵不更新，先调 `renderOnce()`，截图用 canvas 的 `toDataURL`
- **三维渲染**（three 0.186）：色彩管理默认开启，CSS 里的颜色按 sRGB 读入、换算到线性空间计算、输出 sRGB；不加色调映射，调色板颜色不偏。
  光照按物理单位，强度是 r128 时的 π 倍才亮度相当；太阳光投影子（只有设备主体投射，地板接收，阴影相机盖住整个机房）。
  `PCFSoftShadowMap` 在 r186 已移除，用默认的 `PCFShadowMap`
- **网格坐标**：网页里 three.js 是 Y-up，导出时 `(x, y, z)_three → (x, -z, y)_usd`。格子 0.6m × 1.2m，16 列 × 10 排。

## 下一步（按优先级）

当前以网页版为主（2026-09-17 决定），定位是传播和教学 demo，Unity 版暂停。季度计划见 `docs/roadmap.md`。

1. Unity 版（暂停）：面板遮挡三维视图、通电动画和连线、托盘拆解、真实 SimReady 资产（方案 A5，见 `docs/unity-options.md`）。
   Unity USD Importer 在 6000.6 上编译失败，不要用；运行时直接读 USD 的备选是 B3。

## 数据可信度

功耗和价格来自公开报道与供应链估算，**不是 NVIDIA 官方规格**，改数值时在 catalog.json 的 note 里写来源：
- GB300 NVL72 约 132–142 kW
- Vera Rubin NVL72：Max-Q 约 190 kW、Max-P 约 230 kW（Ming-Chi Kuo，2026-01），2026 下半年出货
- Rubin Ultra Kyber：约 600 kW，144 GPU，2027 路线图
- Vera Rubin NVL72 售价约 $5–7M/柜（Tom's Hardware，2026-03）
- IB 交换柜"288 端口"是简化模型，不是真实拓扑

## 风格

- 设了 `display` 的元素（`.row`、`.h2row`）要靠全局 `[hidden]{display:none !important}` 才能用 `hidden` 属性隐藏
- UI 默认英文，支持简体中文。两种语言都用句子式，英文用 sentence case，不用全大写标签
- `spec/capacity-cases.json` 里的问题文本固定生成中文（`buildCases` 临时切到中文），Unity 的 C# 容量模型逐字比对；改容量问题的中文措辞要同步改 C#
- 导出文件（`.usda` 注释和 README、`layout.json`）的内容不随界面语言变化
- 配色语义固定：GPU 绿、冷却液青、配电铜色、网络紫
- 回答直接，不要客套

# Unity 版：USD 接入方案对比

调研日期 2026-09-17。对比的是 Unity 版怎样使用本项目的 OpenUSD 数据：机房布局、设备参数、拓扑，以及以后替换进来的 SimReady 高精度资产。本文只做对比和推荐，不包含实现。

**目标平台：macOS 桌面程序（Apple Silicon）。** 这是 2026-09-17 确定的。

macOS 上没有主流 VR 运行时（SteamVR 2020 年起停止支持 macOS），所以 VR 暂不在范围内。以后如果要做 Quest 一体机，见文末附录，届时推荐不变，理由会更充分。

## 结论

**推荐方案 A：设备几何离线转换成 glb 随程序发布，机房布局用 `layout.json` 传给 Unity。**

**具体分工：**
- **`layout.json`**（布局、参数、拓扑）：网页版直接导出，同时由 Python pxr 转换器从任意 `.usda` 生成。Unity 运行时读 JSON，放置设备。
- **`assets/<catalogId>.glb`**（几何、PBR 材质）：由 pxr 转换器离线生成，glTFast 在编辑器里导入成 prefab。托盘拆解、故障演练的交互做在 prefab 上。

**理由：**
1. **最常见的流程最短。** 用户在网页上摆好机房，导出后在 Unity 程序里打开。整个过程不需要 Python，也不需要原生插件。设备几何很少变，随程序一起发布即可。
2. **组合交给参考实现。** SimReady 资产替换靠更强的层写 `over`（见 `docs/simready-audit.md`），需要真正的 USD 组合。转换器用 OpenUSD 26.8 完成组合，不必在 Unity 里重新实现。
3. **可测。** 转换器和 `layout.json` 格式都能在不装 Unity 的情况下测试，和现有 vitest、pytest 放在一起。
4. **Unity 侧依赖维护活跃。** glTFast 2026-08 仍有发布，编辑器和运行时都能导入。

**主要备选：B3（Unity USD Core 的 C# 绑定，运行时直接读 USD）。** 已在本机实测：打包后的 macOS 程序能读取本项目的 usda，以及 USD 26.08 写的 usdc，instanceable 组合、原型参数继承、关系都正确。

**B3 的问题：**
- 需要一个打包后处理步骤，否则程序一打开 USD 就崩溃；
- 依赖停在 USD v23.02，Unity 自 2023-12 起没有再更新；同一套 USD 包里的 Importer 已经在 Unity 6000.6 上编译不过。

**怎么选：** 如果“Unity 程序直接打开 `.usda`、全程只用 USD 一种格式”对你很重要，可以选 B3；否则选 A，长期维护风险更低。

**方案 C（Unity USD Importer）实测编译失败，排除。** 方案 B1（自己编译 OpenUSD）在 A、B3 都不满足需求时再考虑。

## 调研到的现状

| 项目 | 现状 | 依据 |
|---|---|---|
| Unity USD Importer `com.unity.importer.usd` | 1.0.0-pre.2（2024-09-17），**只能在编辑器里用**，材质只支持 UsdPreviewSurface；**在 Unity 6000.6.1f1 上编译失败**：`IGraphValueUtility.cs(251,21): error CS0619`，`AssetDatabase.TryGetGUIDAndLocalFileIdentifier(int, …)` 已过时并被当成错误 | 包信息、官方手册、本机实测 |
| Unity USD Core `com.unity.usd.core` | 1.0.0-pre.1（2023-12-12），**USD v23.02**；原生库覆盖 Windows x64、macOS arm64/x64、Linux x64，**macOS arm64 的库在打包后的程序里也启用**（`PluginImporter` 里 `Standalone: OSXUniversal`、`CPU: ARM64`）；没有 Android | 下载包 tarball 查看 `Runtime/Plugins` 和 `.meta` |
| 旧版 `com.unity.formats.usd` | 3.0.0-exp.5（2023-10），官方说明只剩遗留支持、即将弃用 | 包信息、Unity-Technologies/usd-unity-sdk |
| glTFast `com.unity.cloud.gltfast` | 6.20.0（2026-08-27）；编辑器和运行时都能导入；需要 Unity 6000.0+；支持读取 `extras`；`EXT_mesh_gpu_instancing` 只支持导入 | 包信息、6.20 功能页 |
| OpenUSD 在 macOS 上 | 官方构建目标，支持 monolithic 构建 | OpenUSD BUILDING.md |
| usd-core 26.8 pip 包里的 `libusd_ms.dylib` | 81 MB，universal2；**不能拿来直接链接**：包含 727 个 Python 符号但不链接 libpython，也没有头文件 | 本机 `otool`、`nm` 检查 |
| 本机工具链 | Apple M5 Max，macOS 26.6.2，Xcode、cmake、ninja 都已安装；Unity 6000.6.1f1（arm64）和 Unity CLI 1.0.0-beta.8 已安装并登录；batchmode 新建工程 22 秒、打包 macOS 程序 13 秒（110 MB） | 本机检查 |
| LightUSD（原 TinyUSDZ） | 无依赖的 C++17 库，支持组合、instancing；1.0 RC；C API 和 C# 绑定还在 `sandbox/`；Apache 2.0 | GitHub lighttransport/LightUSD（2026-09-15） |
| usd2gltf（PyPI） | 0.3.5，2023-02 之后没有更新 | PyPI |

### usd2gltf 实测：不能直接用

用 usd2gltf 0.3.5 加 usd-core 26.8 转换 `samples/datahall.usda`：

- **设备实例丢失：** 17 个设备实例导出成只有变换矩阵、没有子节点的空节点，引用的原型几何没有带过去，机房里看不到任何设备。
- **原型没挂进场景：** Catalog 里的 7 个 `class` 原型和它们的 14 个 Body、Front 被写成孤立节点，不在场景图里，Body、Front 也没挂在原型节点下。
- **材质丢失：** 只导出了 1 个材质（地板），原型内部 `Looks` 里的 14 个材质都丢了。
- **坐标轴没转换：** USD 是 Z 向上，glTF 是 Y 向上，转换器没处理。
- **自定义属性丢失：** 所有 `dchall:` 属性都没有进 `extras`。

所以方案 A 要自己写转换器。好在导出格式是本项目自己定的，需要处理的范围很小。

## 方案

### A. 离线转换：`layout.json` + 每种设备一个 glb

```
网页版 ──导出──▶ layout.json ◀──tools/usd_to_unity.py（pxr）── 任意 datahall.usda（可带 SimReady over 层）
                     │                        │
                     │                        └──▶ assets/<catalogId>.glb（几何 + PBR 材质）
                     ▼                                          ▼
       Unity 运行时：读 JSON，按网格位置实例化 ◀── prefab ◀── glTFast 编辑器导入
```

**`layout.json`：**
- **内容：** schema 版本、网格尺寸、市电、每台设备的 catalog id 和网格列排、拓扑关系（`powerFeed`、`coolantSource`），以及实际生效的设备参数。
- **格式定义：** 配一份 JSON Schema，由网页版和转换器共用。
- **网页版：** 在 `web/src/` 里加一个纯函数导出器，复用现有的拓扑计算。

**转换器（Python，用 `Usd.Stage` 做组合）：**
- **几何和材质：** 每个 Catalog 原型展开组合后的几何，输出一个 glb；UsdPreviewSurface 映射成 glTF 的 pbrMetallicRoughness。
- **坐标：** USD 的 Z 向上转成 glTF 的 Y 向上，`(x, y, z)_usd → (x, z, -y)_gltf`。本项目设备正面朝 -Y，转换后正好落在 glTF 约定的正面方向 +Z。glTF 到 Unity 的左右手转换由 glTFast 负责。
- **从 `.usda` 生成 `layout.json`：** 结果应当和网页版导出的逐字段一致，用现有样例做对照测试。
- **校验：** glb 用 Khronos glTF-Validator 检查。

**Unity 侧：**
- **编辑器工具：** 导入 glb，生成或更新 prefab。交互（托盘、碰撞体、高亮）做在 prefab 变体上，重新导入几何时不会被覆盖。
- **运行时：** 打开 `layout.json`，按网格位置实例化；容量模型参照 `web/src/sim.js` 移植成 C#，和网页版共用一份 JSON 测试用例。

**缺点：**
- 不是实时的，改了 USD 要重新转换。
- MDL 材质转 glTF PBR 会有损失。
- 在 Unity 里的修改要写回 USD，需要走 `layout.json → usda`（可以复用网页版的导入和导出逻辑）。

### B1. macOS 原生插件：OpenUSD 26.08

**做法：**
- 在本机用 `build_usd.py --build-monolithic --no-python --no-imaging` 之类的参数编译出 `libusd_m.dylib`。
- 写一层 C API 封装（打开 stage、遍历组合后的 prim、读 mesh、材质、属性、关系），Unity 通过 P/Invoke 调用，在 C# 里生成 Mesh、Material。

**优点：**
- Unity 程序可以直接打开任意 `.usd`、`.usdc`、`.usdz`。
- USD 版本和 SimReady 工具链一致。
- 以后可能在程序里写回 USD。

**缺点：**
- **原生层要长期维护：** 每次升级 USD 都要重新编译；要处理 plugInfo 资源在 `.app` 包里的路径；分发时插件要签名和公证。
- **C# 侧工作量不变：** mesh、材质到 Unity 的转换代码仍然要写，工作量和方案 A 的 Unity 侧相当，还要再加上原生层。
- **性能要单独测：** 大资产在运行时解析，加载时间要另外做性能测试。

### B3. Unity USD Core 的 C# 绑定（运行时）

**做法：** 直接用 `com.unity.usd.core`（USD.NET）在运行时打开 stage，自己写遍历和转换代码。

**实测（2026-09-17，Unity 6000.6.1f1，Mono 脚本后端）：**

| 检查项 | 编辑器 | 打包后的 macOS 程序 |
|---|---|---|
| 包能否编译 | ✅ | ✅ |
| 打开 `samples/datahall.usda` | ✅ | 未单独测（和 usdc 走同一路径） |
| 打开 USD 26.08 写出的 usdc（crate 0.8.0） | ✅ | ✅（需要下面的打包后处理） |
| instanceable 实例、从 class 原型组合出 `dchall:powerKw = 190` | ✅ | ✅ |
| 关系 `dchall:coolantSource` 的目标 | ✅ | ✅ |
| 带 instance proxy 遍历：35 个 Mesh（地板 1 个，17 台设备各 2 个） | ✅ | ✅ |
| `GetAppliedSchemas()` | 空列表（没注册本项目 schema 插件；属性值照样能读） | — |

**打包后处理必须做：**
- **不处理会崩溃：** Unity 打包时只复制 dylib，不复制 `lib/usd/**/plugInfo.json`。打开 stage 时会报 `Failed to find plugin for ArDefaultResolver`，随后原生层段错误（退出码 139）。
- **处理办法：** 把包里的 `Runtime/Plugins/arm64/MacOS/lib/usd` 复制到 `.app/Contents/PlugIns/ARM64/usd`（plugInfo 里的 `LibraryPath` 是 `../../libusd_*.dylib`，位置正好对上），再重新签名（本机用 ad-hoc 签名即可）。实际工程里用 `IPostprocessBuildWithReport` 自动完成。

**优点：**
- 不需要转换器，也不需要新的交换格式，Unity 直接读网页导出的 `.usda`。
- 组合在运行时完成，SimReady 覆盖层有机会直接生效（要看 23.02 能不能读那些资产）。
- 不用自己编译 USD。

**缺点：**
- **依赖停滞：** USD v23.02，pre-release 状态从 2023-12 延续至今；同一套包里的 Importer 已经在 Unity 6000.6 上编译失败，USD Core 以后也可能遇到同样的问题。
- **新资产兼容性未知：** 本项目自己的文件没问题，但 2026 年工具链产出的 SimReady 资产如果用了 23.02 之后的新 schema 或新 crate 版本，可能读不全，需要拿真实资产验证。
- **C# 侧工作量不减：** mesh、材质到 Unity 的转换代码要在 C# 里写，工作量和方案 A 的转换器相当，只是换了语言。
- **还没验证的：** IL2CPP 脚本后端、签名和公证后的分发。

### C. Unity 官方 USD Importer（编辑器导入）

**排除。**
- **编译不过：** 在本机 Unity 6000.6.1f1 上，`com.unity.importer.usd@1.0.0-pre.2` 编译失败（CS0619，调用了已过时的 `AssetDatabase.TryGetGUIDAndLocalFileIdentifier(int, …)`），整个工程的编辑器脚本都会因此无法编译。
- **其他限制：** 就算在更早的 Unity 版本上能用，它也只能在编辑器里用，底层是 USD v23.02；官方文档没有提到 instancing、payload、variant 和自定义属性。

## 对比（macOS）

| | A 离线：JSON + glb | B1 OpenUSD 原生插件 | B3 Unity USD Core 运行时 | C Unity USD Importer |
|---|---|---|---|---|
| 本机实测 | 转换器未写；usd2gltf 不可用 | 未测 | ✅ 打包后的 macOS 程序可读取（需打包后处理） | ❌ Unity 6000.6 编译失败 |
| Unity 程序直接打开 `.usda` | ❌ 读 `layout.json`（网页导出） | ✅ | ✅ | — |
| 组合正确性 | ✅ pxr 26.8 | ✅ OpenUSD 26.08 | ✅ 本项目文件已验证；SimReady 资产未验证（23.02） | — |
| `dchall:` 参数和拓扑 | ✅ layout.json | ✅ 读属性 | ✅ 已验证 | — |
| 依赖风险 | 低：usd-core、glTFast 维护活跃 | 中：自己编译、签名、升级 | 高：依赖停滞，同套 Importer 已在新版 Unity 上坏掉 | — |
| CI 测试（Unity 已装好，batchmode 可用） | 转换器不需要 Unity；Unity 侧 EditMode | 部分 | EditMode 加打包冒烟测试 | — |
| 首个可用版本（Claude 会话小时） | 4–6 | 9–13 | 4–6 | — |

## 工作量估算（方案 A）

按 Claude 会话小时计，实际日历时间取决于会话安排。

| 步骤 | 会话小时 | 内容 |
|---|---|---|
| A1 `layout.json` 格式 | 1 | JSON Schema；网页版导出按钮和纯函数导出器；vitest 用例 |
| A2 转换器 | 2–3 | `tools/usd_to_unity.py`：原型转 glb、`.usda` 转 `layout.json`、坐标转换；pytest 加 glTF-Validator；样例和 SimReady 替换写法做回归 |
| A3 Unity 工程 | 2–3 | 编辑器导入 glb 生成 prefab、运行时打开 `layout.json` 并实例化；EditMode 测试 |
| A4 容量模型移植 | 1–2 | `sim.js` 移植为 C#，和网页版共用 JSON 测试用例 |
| A5 高精度资产 | 3–5（视资产而定） | 真实 SimReady 资产：payload、大网格、MDL 到 PBR 的近似、贴图 |

**需要你自己完成的步骤（耗时不在 Claude 控制范围内）：**
- ~~安装 Unity 并登录~~：已完成（6000.6.1f1）。Claude 可以用 batchmode 跑测试、打包并运行 macOS 程序。6000.6 不是 LTS；如果想要长期稳定，可以在 Hub 里安装 6000.3 LTS，这需要你来操作。
- 如果要把 `.app` 发给别人：Apple Developer 账号，以及签名和公证。只在本机运行不需要。
- 真实 SimReady 资产的获取和授权。

## 还需要决定的

1. **选 A 还是 B3：** Unity 程序是否必须直接打开 `.usda`（全程只用 USD 一种格式）？
   - 不必须：选 A，依赖风险低。
   - 必须：选 B3，已实测可行，但依赖停滞；万一它在以后的 Unity 版本里坏掉，退路是 B1。
2. **Unity 版本和渲染管线：** 继续用已装的 6000.6，还是改用 6000.3 LTS；渲染管线建议 URP（Apple Silicon 上性能稳，glTFast 着色器支持完整），追求画质选 HDRP。
3. **Unity 工程放在哪：** 建议放在本仓库 `unity/`，和转换器、JSON Schema 一起做版本管理。

## 附录：如果以后要做 Quest 一体机

- **Unity USD Core：** 原生库没有 Android 版本。
- **OpenUSD：** 官方构建目标不含 Android（BUILDING.md 列出的是 Windows、macOS、visionOS、WebAssembly）；社区的 aarch64 构建脚本 syoyo/USD-build-aarch64 最后提交 2022-10。
- **LightUSD：** 有 Android CI，但 C API 还在实验阶段。
- **结论：** Quest 上运行时读 USD 风险很高。方案 A 在设备上只读 JSON 和 glb，不受影响，而且 glTFast 支持运行时导入。

## 来源

- [Unity USD Importer 手册](https://docs.unity3d.com/Packages/com.unity.importer.usd@1.0/manual/index.html)、[USD Core 手册](https://docs.unity3d.com/Packages/com.unity.usd.core@1.0/manual/index.html)、[Understanding the Unity USD Packages](https://docs.unity3d.com/Packages/com.unity.exporter.usd@1.0/manual/UnderstandingUsdPackages.html)
- 包信息：`https://packages.unity.com/com.unity.importer.usd`、`com.unity.usd.core`、`com.unity.formats.usd`、`com.unity.cloud.gltfast`（2026-09-17 查询），以及 `com.unity.usd.core` 1.0.0-pre.1 包文件
- [glTFast 6.20 功能列表](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.20/manual/features.html)
- [OpenUSD BUILDING.md](https://github.com/PixarAnimationStudios/OpenUSD/blob/dev/BUILDING.md)、[syoyo/USD-build-aarch64](https://github.com/syoyo/USD-build-aarch64)
- [lighttransport/LightUSD](https://github.com/lighttransport/LightUSD)
- [usd2gltf](https://pypi.org/project/usd2gltf)、[Unity-Technologies/usd-unity-sdk](https://github.com/Unity-Technologies/usd-unity-sdk)
- [Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator)

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

**如果以后要求“Unity 程序直接打开任意 `.usd`”，** macOS 上有两条现实的备选路线：
- **B1：** 自己编译 OpenUSD 26.08 原生插件。官方支持 macOS，本机工具链齐全。
- **B3：** 用 Unity 官方 USD Core 的 C# 绑定，它自带 macOS arm64 运行时库，但 USD 版本停在 v23.02。

两者都比方案 A 重，建议等真有这个需求时再选。

## 调研到的现状

| 项目 | 现状 | 依据 |
|---|---|---|
| Unity USD Importer `com.unity.importer.usd` | 1.0.0-pre.2（2024-09-17），**只能在编辑器里用**，材质只支持 UsdPreviewSurface | packages.unity.com 包信息、官方手册 |
| Unity USD Core `com.unity.usd.core` | 1.0.0-pre.1（2023-12-12），**USD v23.02**；原生库覆盖 Windows x64、macOS arm64/x64、Linux x64，**macOS arm64 的库在打包后的程序里也启用**（`PluginImporter` 里 `Standalone: OSXUniversal`、`CPU: ARM64`）；没有 Android | 下载包 tarball 查看 `Runtime/Plugins` 和 `.meta` |
| 旧版 `com.unity.formats.usd` | 3.0.0-exp.5（2023-10），官方说明只剩遗留支持、即将弃用 | 包信息、Unity-Technologies/usd-unity-sdk |
| glTFast `com.unity.cloud.gltfast` | 6.20.0（2026-08-27）；编辑器和运行时都能导入；需要 Unity 6000.0+；支持读取 `extras`；`EXT_mesh_gpu_instancing` 只支持导入 | 包信息、6.20 功能页 |
| OpenUSD 在 macOS 上 | 官方构建目标，支持 monolithic 构建 | OpenUSD BUILDING.md |
| usd-core 26.8 pip 包里的 `libusd_ms.dylib` | 81 MB，universal2；**不能拿来直接链接**：包含 727 个 Python 符号但不链接 libpython，也没有头文件 | 本机 `otool`、`nm` 检查 |
| 本机工具链 | Apple M5 Max，macOS 26.6.2，Xcode、cmake、ninja 都已安装；**没有安装 Unity** | 本机检查 |
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

**做法：** 直接用 `com.unity.usd.core`（USD.NET）在运行时打开 stage，自己写遍历和转换代码。Importer 只能在编辑器里用，不走 Importer。

**优点：** 不用维护原生编译；macOS arm64 的运行时库是现成的。

**缺点：**
- **版本停滞：** USD v23.02，pre-release 状态从 2023-12 延续至今，没有更新迹象。
- **新文件可能读不了（未验证）：** 2026 年工具链写出的 usdc，如果用了更新的 crate 版本，23.02 可能读不了，需要实测。
- **实测条件不具备：** 本机没有安装 Unity，以上判断都没有实测。

### C. Unity 官方 USD Importer（编辑器导入）

**不采用。**
- 只能在编辑器里用，底层是 USD v23.02，2024-09 之后没有新版本。
- 官方文档没有提到 instancing、payload、variant 和自定义属性。
- 本项目的 `dchall:` 参数和拓扑仍要另外处理，结果比方案 A 多一个不可控的依赖。

## 对比（macOS）

| | A 离线：JSON + glb | B1 OpenUSD 原生插件 | B3 Unity USD Core 运行时 | C Unity USD Importer |
|---|---|---|---|---|
| Unity 程序直接打开任意 USD | ❌ 先转换（网页导出的布局可以直接打开） | ✅ | ✅ | ❌ |
| 组合正确性（over、instanceable、payload） | ✅ pxr 26.8 | ✅ OpenUSD 26.08 | ⚠️ 23.02，需实测 | ❓ 文档未说明 |
| `dchall:` 参数和拓扑 | ✅ layout.json | ✅ 读属性 | ✅ 读属性 | ❌ 另行处理 |
| 原生代码维护 | 无 | 编译、签名、升级 | 无（但依赖已停滞） | 无 |
| 能否不装 Unity 做 CI 测试 | ✅ 转换器和 JSON 格式 | 部分（C API 层） | ❌ | ❌ |
| 首个可用版本（Claude 会话小时） | 4–6 | 9–13 | 5–8 | 2–3（仅验证可行性） |

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
- 安装 Unity Hub 和 Unity 6（6000.0 或更高），登录 Unity 账号并激活许可证。装好之后，Claude 可以用 `Unity -batchmode -runTests` 跑 EditMode 测试，也能命令行打包 macOS 程序；否则 Unity 侧只能写代码、没法验证。
- 如果要把 `.app` 发给别人：Apple Developer 账号，以及签名和公证。只在本机运行不需要。
- 真实 SimReady 资产的获取和授权。

## 还需要决定的

1. **Unity 程序是否必须直接打开任意 `.usd`**（而不是网页导出的 `layout.json`）？不需要就走 A；需要的话，A 完成后再在 B1 和 B3 之间选。
2. **渲染管线：** 建议 URP（Apple Silicon 上性能稳，glTFast 着色器支持完整）；追求画质选 HDRP。
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

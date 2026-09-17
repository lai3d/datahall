# Unity 版：USD 接入方案对比

调研日期 2026-09-17。对比的是 Unity 版怎样使用本项目的 OpenUSD 数据（机房布局、设备参数、拓扑，以及以后替换进来的 SimReady 高精度资产）。本文只做对比和推荐，不包含实现。

## 结论

**推荐方案 A：用 Python pxr 做离线转换，产出 `layout.json` 和每种设备一个 `.glb`，Unity 通过 glTFast 导入。**

1. **能上 Quest 一体机。** VR 大概率以 Quest 这类 Android arm64 一体机为目标。方案 A 在设备上只读 JSON 和 glTF，不需要任何 USD 运行时。
   - Unity 官方 USD 包的原生库没有 Android 版本。
   - OpenUSD 官方构建目标里也没有 Android。
2. **组合交给参考实现 pxr。** 替换高精度模型靠的是更强的层写 `over`（见 `docs/simready-audit.md`），这需要真正的 USD 组合。离线转换直接用 OpenUSD 的参考实现，不必在 Unity 里重新实现组合。
3. **Unity 侧依赖维护活跃。** glTFast 是 Unity 官方维护的包，2026-08 仍有发布，编辑器和运行时都能导入。
4. **适合交互开发。** 托盘拆解、故障演练需要在 Unity 里手工做交互 prefab（碰撞体、抓取、动画），这部分内容本来就不会从 USD 自动生成。USD 只需要提供布局、参数和几何。

**方案 B（运行时原生 USD 插件）暂缓。** 等到“在头显里直接打开任意 `.usda`”成为明确需求时，再评估 LightUSD（原 TinyUSDZ）1.0；不考虑编译 OpenUSD 本体。

**方案 C（Unity 官方 USD Importer）不采用。**

## 调研到的现状

| 项目 | 现状 | 依据 |
|---|---|---|
| Unity USD Importer `com.unity.importer.usd` | 1.0.0-pre.2（2024-09-17），**只能在编辑器里用**，材质只支持 UsdPreviewSurface | packages.unity.com 包信息、官方手册 |
| Unity USD Core `com.unity.usd.core` | 1.0.0-pre.1（2023-12-12），**USD v23.02**；原生库只有 Windows x64、macOS arm64/x64、Linux x64，**没有 Android** | 下载包 tarball 查看 `Runtime/Plugins` |
| 旧版 `com.unity.formats.usd` | 3.0.0-exp.5（2023-10），官方说明只剩遗留支持、即将弃用；GitHub 仓库最后提交 2024-11 | 包信息、Unity-Technologies/usd-unity-sdk |
| glTFast `com.unity.cloud.gltfast` | 6.20.0（2026-08-27），7.0.0-exp.1（2026-08-28）；编辑器和运行时都能导入；需要 Unity 6000.0+ | 包信息、6.20 功能页 |
| glTFast 对扩展的支持 | `EXT_mesh_gpu_instancing` 只支持导入；支持读取 `extras` 和扩展字段；Draco、KHR_texture_transform 支持导入和导出；meshopt、量化只支持导入 | 6.20 功能页 |
| OpenUSD 官方构建目标 | Windows（x64 或 ARM64）、macOS、visionOS（monolithic）、WebAssembly；没有 Android | OpenUSD BUILDING.md |
| OpenUSD 的 Android 社区构建 | syoyo/USD-build-aarch64，最后提交 2022-10 | GitHub |
| LightUSD（原 TinyUSDZ） | 无依赖的 C++17 库，读写 usda/usdc/usdz，支持组合（LIVRPS）、instancing 和 PointInstancer；有 Android、iOS 的 CI；1.0 RC，计划 26.09 或 26.10 发布；C API 和 C# 绑定还在 `sandbox/`；Apache 2.0 许可 | GitHub lighttransport/LightUSD（最后提交 2026-09-15） |
| usd2gltf（PyPI） | 0.3.5，2023-02 之后没有更新 | PyPI、GitHub |

### usd2gltf 实测：不能直接用

用 usd2gltf 0.3.5 加 usd-core 26.8 转换 `samples/datahall.usda`：

- **设备实例丢失：** 17 个设备实例导出成只有变换矩阵、没有子节点的空节点，引用的原型几何没有带过去，机房里看不到任何设备。
- **原型没挂进场景：** Catalog 里的 7 个 `class` 原型和它们的 14 个 Body、Front 被写成孤立节点，不在场景图里，Body、Front 也没挂在原型节点下，场景里看不到。
- **材质丢失：** 15 个 mesh 只导出了 1 个材质（地板），原型内部 `Looks` 里的 14 个材质都丢了。
- **坐标轴没转换：** USD 是 Z 向上，glTF 是 Y 向上，转换器没处理。
- **自定义属性丢失：** 所有 `dchall:` 属性都没有进 `extras`。

所以方案 A 要自己写转换器。好在导出格式是本项目自己定的，需要处理的范围很小。

## 三个方案

### A. 离线转换：pxr → `layout.json` + 每种设备一个 glb

```
datahall.usda  ──(可选：更强的层 over 成 SimReady 资产)──┐
                                                         ▼
                                    tools/usd_to_unity.py（usd-core）
                                       │                    │
                        layout.json（布局、参数、拓扑）    assets/<catalogId>.glb（几何 + PBR 材质）
                                       │                    │
                             Unity 运行时读 JSON        glTFast 在编辑器导入 → prefab
                                       └──── 按网格位置实例化 prefab ────┘
```

**转换器（Python，用 `Usd.Stage` 做组合，不自己解析文本）：**
- **几何和材质：** 每个 Catalog 原型展开组合后的几何，输出一个 glb；UsdPreviewSurface 映射成 glTF 的 pbrMetallicRoughness。
- **坐标：** USD 的 Z 向上转成 glTF 的 Y 向上，`(x, y, z)_usd → (x, z, -y)_gltf`。本项目设备正面朝 -Y，转换后正好落在 glTF 约定的正面方向 +Z。glTF 到 Unity 的左右手转换由 glTFast 负责。
- **layout.json：** 包含 schema 版本、网格尺寸、市电、每台设备的 catalog id 和网格列排、拓扑关系（`powerFeed`、`coolantSource`），以及文件里实际生效的设备参数。
- **校验：** 输出用 Khronos glTF-Validator 检查，layout.json 配一份 JSON Schema。

**Unity 侧：**
- **编辑器工具：** 导入 glb，生成或更新 prefab。交互（托盘、碰撞体、XR 抓取）做在 prefab 的变体上，重新导入几何时不会被覆盖。
- **运行时：** 读 `layout.json`，按网格位置实例化 prefab，用 Unity 自己的 GPU instancing 批量渲染。容量模型可以对照 `web/src/sim.js` 移植成 C#，用同一组测试用例核对结果。

**优点：**
- 所有平台（包括 Quest）运行时零 USD 依赖。
- 组合由参考实现完成，SimReady 的 `over`、payload、variant 都自然生效。
- 转换器能在 CI 里测，不需要 Unity。

**缺点：**
- 不是实时的，USD 改了要重新转换。
- MDL 材质转 glTF PBR 会有损失，高精度资产只能保留基础 PBR 参数。
- 在 Unity 里的修改不能直接写回 USD，需要另走 `layout.json → usda` 的回写，这可以复用网页版的导出逻辑。

### B. 运行时原生 USD 插件

**两种实现路线：**
- **B1：** 编译 OpenUSD 本体（monolithic），写 C API 薄封装，Unity 通过 P/Invoke 调用。
- **B2：** 用 LightUSD 的 C API 和 C# 绑定。

在 C# 里遍历组合后的 stage，生成 Mesh、Material、GameObject。

**优点：** 头显里可以直接打开任意 `.usd` / `.usdz`，用户或厂商提供的新资产不需要预先转换；以后可能写回 USD。

**缺点和风险：**
- **B1：** OpenUSD 官方不支持 Android。社区脚本 2022 年以后没人维护。还要处理 TBB、plugInfo 资源路径（APK 里的文件要先解压）、IL2CPP 下的调用、库体积，以及每个平台单独编译、每次升级 USD 都要重来。
- **B2：** LightUSD 还没到 1.0，C API 在 sandbox 里。与 OpenUSD 在组合和 schema 上的一致性要自己验证（本项目依赖 class、instanceable、codeless schema 属性）。
- **两者共同的问题：**
  - mesh、材质到 Unity 的转换代码仍然要在 C# 里写一遍，工作量和方案 A 的 Unity 侧相当，还要再加上原生层；
  - 运行时解析大文件，Quest 上的加载时间和内存要单独做性能测试。

### C. Unity 官方 USD Importer（编辑器导入）

在编辑器里把 `.usda` 导入成 prefab，再打包到各个平台。

**不采用的原因：**
- 只能在编辑器里用，底层是 USD v23.02，pre-release 状态从 2023-12 延续至今，2024-09 之后没有新版本。
- 官方文档列出的支持范围里没有 instancing、payload、variant、自定义属性；我们的 `dchall:` 参数和拓扑需要另外处理。
- **没有实测：** 本机没有安装 Unity，以上判断只来自官方文档和包信息，没有实际导入过样例。如果想排除风险，可以花约 1 个 Claude 会话小时做验证（前提是你先装好 Unity 6，见下文）。

## 对比

| | A 离线 pxr → JSON + glb | B1 OpenUSD 原生插件 | B2 LightUSD 原生插件 | C Unity USD Importer |
|---|---|---|---|---|
| Quest（Android arm64）运行 | ✅ 运行时无 USD | ⚠️ 需要自己交叉编译，官方不支持 | ⚠️ 有 Android CI，C API 实验中 | ✅ 只在编辑器导入 |
| 头显里打开任意 USD | ❌ 需要先转换 | ✅ | ✅ | ❌ |
| 组合正确性（over、instanceable、payload） | ✅ 参考实现 | ✅ 参考实现 | ⚠️ 需要验证 | ❓ 文档未说明 |
| `dchall:` 参数和拓扑 | ✅ 进 layout.json | ✅ | ✅ | ❌ 另行处理 |
| 依赖维护状况 | usd-core 26.8、glTFast 2026-08 | 自己维护编译 | 1.0 前 | 2024-09 后停滞 |
| 能否不装 Unity 做 CI 测试 | ✅ 转换器全部可测 | 部分（C API 层） | 部分 | ❌ |
| 首个可用版本（Claude 会话小时） | 4–6 | 14–22 | 8–12 | 2–3（仅验证可行性） |

## 工作量估算（方案 A）

按 Claude 会话小时计，实际日历时间取决于会话安排。

| 步骤 | 会话小时 | 内容 |
|---|---|---|
| A1 转换器 | 2–3 | `tools/usd_to_unity.py`：原型到 glb（Mesh 和 UsdPreviewSurface）、`layout.json` 及其 JSON Schema、坐标转换；pytest 加 glTF-Validator；用 `samples/datahall.usda` 和 `docs/simready-audit.md` 里的写法 B 替换样例做回归 |
| A2 Unity 导入工具 | 2–3 | Unity 包 `unity/com.dchall.datahall`：编辑器菜单导入 glb 生成 prefab、运行时读 `layout.json` 并实例化；EditMode 测试 |
| A3 容量模型移植 | 1–2 | `sim.js` 移植为 C#，和网页版共用一份 JSON 测试用例 |
| A4 高精度资产 | 3–5（视资产而定） | 真实 SimReady 资产：payload、大网格、MDL 到 PBR 的近似、贴图 |

**需要你自己完成的步骤（耗时不在 Claude 控制范围内）：**
- 安装 Unity 6（6000.0 或更高）和 Android Build Support 模块。装好之后，Claude 可以用 `Unity -batchmode -runTests` 跑 EditMode 测试，否则 Unity 侧只能写代码、没法验证。
- 在 Quest 头显上开启开发者模式（需要 Meta 开发者账号），并用数据线或无线连接调试。
- 如果需要 Windows 构建，得有一台 Windows 机器或 CI 运行环境。
- 真实 SimReady 资产的获取和授权。

## 需要你拍板的问题

1. **VR 目标：** Quest 一体机，还是 PC VR（Link、SteamVR）？选 PC VR 的话，方案 B1 的平台风险明显下降，但方案 A 仍然更简单。
2. **是否需要在头显里打开任意 USD：** 如果需要，A 做完后再单独评估 B2。
3. **Unity 版本和渲染管线：** 建议 Unity 6 LTS 加 URP（Quest 性能）。
4. **Unity 工程放在哪里：** 本仓库的 `unity/` 目录，还是单独的仓库。

## 来源

- [Unity USD Importer 手册](https://docs.unity3d.com/Packages/com.unity.importer.usd@1.0/manual/index.html)、[USD Core 手册](https://docs.unity3d.com/Packages/com.unity.usd.core@1.0/manual/index.html)、[Understanding the Unity USD Packages](https://docs.unity3d.com/Packages/com.unity.exporter.usd@1.0/manual/UnderstandingUsdPackages.html)
- 包信息：`https://packages.unity.com/com.unity.importer.usd`、`com.unity.usd.core`、`com.unity.formats.usd`、`com.unity.cloud.gltfast`（2026-09-17 查询）
- [glTFast 6.20 功能列表](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.20/manual/features.html)
- [OpenUSD BUILDING.md](https://github.com/PixarAnimationStudios/OpenUSD/blob/dev/BUILDING.md)、[syoyo/USD-build-aarch64](https://github.com/syoyo/USD-build-aarch64)
- [lighttransport/LightUSD](https://github.com/lighttransport/LightUSD)
- [usd2gltf](https://pypi.org/project/usd2gltf)、[Unity-Technologies/usd-unity-sdk](https://github.com/Unity-Technologies/usd-unity-sdk)
- [Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator)
